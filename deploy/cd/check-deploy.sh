#!/usr/bin/env bash
# The check of codraw-deploy in CI (the job `images`): against the stack of docker-compose.prod.yml with the profile
# `monitoring` that the job started from the images of the commit, from a directory of a deployment of its own, as an
# operator set it up and as the job `deploy` unpacks a version there. It deploys the commit (with a backup), refuses a
# version without images before anything changes, and rolls back a version whose backend does not start. The images
# are those the job built: nothing is pulled. Run from the root of the repository with the environment that started
# the stack; its variables stand in for .env.prod.
set -euo pipefail

version=${CODRAW_VERSION:?the images of the commit}
prefix=${CODRAW_IMAGE_PREFIX:?the prefix of the images}
dir=$(mktemp -d)
export COMPOSE_PROFILES=monitoring CODRAW_DEPLOY_PULL=0

step() { echo "::group::$*"; }
done_step() { echo "::endgroup::"; }
fail() { echo "::error::$*"; exit 1; }

compose() { docker compose --project-directory "$dir" -f "$dir/docker-compose.prod.yml" --env-file "$dir/.env.prod" "$@"; }
image_of() { docker inspect --format '{{.Config.Image}}' "$(compose ps -q "$1")"; }
# The newest archive of the server: the rule of retention keeps one of a day, so their number need not grow.
latest_backup() { compose exec -T backup codraw-backup list < /dev/null | tail -n 1; }

# The files of the commit in the place where the job `deploy` unpacks them.
stage() {
  rm -rf "$dir/.codraw-deploy/incoming"
  mkdir -p "$dir/.codraw-deploy/incoming"
  tar -cf - docker-compose.prod.yml deploy/prometheus deploy/alertmanager deploy/cd |
    tar -xf - -C "$dir/.codraw-deploy/incoming"
}

deploy() { (cd "$dir" && bash .codraw-deploy/incoming/deploy/cd/codraw-deploy deploy "$1"); }

expect_healthy_at() {
  local service image health
  for service in backend collab frontend backup; do
    image=$(image_of "$service")
    [ "$image" = "$prefix$service:$1" ] || fail "$service runs $image, not the version $1"
    health=$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q "$service")")
    [ "$health" = healthy ] || fail "$service is $health"
  done
  [ "$(cat "$dir/.codraw-deploy/version")" = "$1" ] || fail "the deployment records $(cat "$dir/.codraw-deploy/version")"
}

step "A deployment directory as the operator set it up: the files of docker-compose.prod.yml and an .env.prod"
tar -cf - docker-compose.prod.yml deploy/prometheus deploy/alertmanager | tar -xf - -C "$dir"
: > "$dir/.env.prod"
done_step

step "Deploy the commit over the running stack, with a backup"
before=$(latest_backup)
stage
deploy "$version" || fail "the deployment of $version failed"
expect_healthy_at "$version"
[ "$(latest_backup)" != "$before" ] || fail "no backup before the deployment"
done_step

step "Refuse a version without images, before anything changes"
backend=$(compose ps -q backend)
stage
status=0
deploy missing-ci || status=$?
[ "$status" = 1 ] || fail "a version without images ended with $status, not 1"
[ "$(compose ps -q backend)" = "$backend" ] || fail "the backend restarted for a version without images"
expect_healthy_at "$version"
done_step

step "Roll back a version whose backend does not start"
# The image of the commit with a command that ends at once; without a builder, which the job set up for buildx.
container=$(docker create "${prefix}backend:$version")
docker commit --change 'ENTRYPOINT ["sh", "-c", "echo a backend that does not start >&2; exit 1"]' "$container" \
  "${prefix}backend:broken-ci" > /dev/null
docker rm "$container" > /dev/null
for service in collab frontend backup; do docker tag "$prefix$service:$version" "$prefix$service:broken-ci"; done
stage
echo "# broken-ci" >> "$dir/.codraw-deploy/incoming/docker-compose.prod.yml"
status=0
CODRAW_DEPLOY_BACKUP=0 CODRAW_DEPLOY_WAIT_TIMEOUT=120 deploy broken-ci || status=$?
[ "$status" = 1 ] || fail "a version that does not start ended with $status, not 1"
expect_healthy_at "$version"
cmp -s docker-compose.prod.yml "$dir/docker-compose.prod.yml" || fail "the files of the previous version were not restored"
for service in backend collab frontend backup; do docker image rm "$prefix$service:broken-ci" > /dev/null || true; done
done_step

echo "codraw-deploy: deployed, refused and rolled back as expected"
