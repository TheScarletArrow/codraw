#!/usr/bin/env bash
# Checks the steps of codraw-deploy against a fake `docker` that records its calls: what stops a deployment before
# anything changes, the backup, the switch of the files, the rollback and the exit codes. Without Docker; the job
# `images` of CI also deploys for real against the stack of CI (check-deploy.sh).
#   deploy/cd/codraw-deploy.test.sh
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/codraw-deploy
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
failures=0

mkdir -p "$work/bin"
# The fake docker: the version the stack runs is in $FAKE/running, the images that are there in $FAKE/images; a
# version in $FAKE/broken never becomes healthy, and $FAKE/fail-<step> makes a step fail.
cat > "$work/bin/docker" <<'FAKE_DOCKER'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE/calls"
prefix=ghcr.io/example/codraw-
if [ "$1" = --config ]; then shift 2; fi
case "$1" in
  compose)
    shift
    while [ $# -gt 0 ]; do
      case "$1" in
        --project-directory | -f | --env-file) shift 2 ;;
        *) break ;;
      esac
    done
    case "$1 ${2:-}" in
      "config --quiet") [ ! -e "$FAKE/fail-config" ] || { echo "required variable NEW_SECRET is missing a value" >&2; exit 1; } ;;
      "config --images")
        for service in backend collab frontend backup; do echo "$prefix$service:$CODRAW_VERSION"; done
        echo postgres:18-alpine ;;
      "config ") echo "name: codraw-prod" ;;
      "pull --quiet") [ ! -e "$FAKE/fail-pull" ] || exit 1 ;;
      "ps -q") [ -s "$FAKE/running" ] && echo backup-container ;;
      "ps -a") echo "NAME STATUS" ;;
      "exec -T") [ ! -e "$FAKE/fail-backup" ] || exit 1; echo backup >> "$FAKE/backups" ;;
      "up -d")
        if grep -qx "$CODRAW_VERSION" "$FAKE/broken" 2> /dev/null; then exit 1; fi
        echo "$CODRAW_VERSION" > "$FAKE/running"
        # The stack reads the files of the directory it runs from.
        cp docker-compose.prod.yml "$FAKE/compose-at-up" ;;
      *) echo "fake docker: unexpected compose $*" >&2; exit 3 ;;
    esac ;;
  ps) [ -s "$FAKE/running" ] && echo backend-container ;;
  inspect) echo "${prefix}backend:$(cat "$FAKE/running")" ;;
  login) cat > "$FAKE/token" ;;
  pull)
    [ ! -e "$FAKE/fail-pull" ] || exit 1
    echo "$3" >> "$FAKE/images" ;;
  image)
    case "$2" in
      inspect) [ "$3" = postgres:18-alpine ] || grep -qxF "$3" "$FAKE/images" ;;
      ls) cat "$FAKE/images" ;;
      rm) echo "$3" >> "$FAKE/removed" ;;
    esac ;;
  *) echo "fake docker: unexpected $*" >&2; exit 3 ;;
esac
FAKE_DOCKER
chmod +x "$work/bin/docker"

# A deployment directory with .env.prod and the files of the running version $1, and those of version $2 waiting.
setup() {
  export FAKE=$work/fake-$1-$2-$RANDOM
  dir=$FAKE/dir
  mkdir -p "$dir/deploy/prometheus" "$dir/.codraw-deploy/incoming/deploy/prometheus" "$dir/.codraw-deploy/incoming/deploy/cd"
  echo 'SECRET=kept' > "$dir/.env.prod"
  echo "compose of $1" > "$dir/docker-compose.prod.yml"
  echo "rules of $1" > "$dir/deploy/prometheus/alerts.yml"
  echo "compose of $2" > "$dir/.codraw-deploy/incoming/docker-compose.prod.yml"
  echo "rules of $2" > "$dir/.codraw-deploy/incoming/deploy/prometheus/alerts.yml"
  cp "$script" "$dir/.codraw-deploy/incoming/deploy/cd/codraw-deploy"
  echo "$1" > "$FAKE/running"
  for service in backend collab frontend backup; do echo "ghcr.io/example/codraw-$service:$1"; done > "$FAKE/images"
}

deploy() {
  (cd "$dir" && PATH="$work/bin:$PATH" bash .codraw-deploy/incoming/deploy/cd/codraw-deploy deploy "$@" 2> "$FAKE/log")
}

expect() {
  if [ "$2" != "$3" ]; then
    failures=$((failures + 1))
    printf 'FAIL %s\n  expected: %s\n  actual:   %s\n' "$1" "$3" "$2"
    sed 's/^/  log: /' "$FAKE/log" 2> /dev/null || true
  fi
}

# A deployment pulls the images of the version with the token of the job in its own configuration, backs up, switches
# the files, keeps .env.prod and records the version.
setup old new
status=0
printf 'job-token\n' | CODRAW_DEPLOY_REGISTRY=ghcr.io CODRAW_DEPLOY_REGISTRY_USER=ci deploy new || status=$?
expect "deploy: exit" "$status" 0
expect "deploy: running" "$(cat "$FAKE/running")" new
expect "deploy: version" "$(cat "$dir/.codraw-deploy/version")" new
expect "deploy: compose at up" "$(cat "$FAKE/compose-at-up")" "compose of new"
expect "deploy: rules" "$(cat "$dir/deploy/prometheus/alerts.yml")" "rules of new"
expect "deploy: previous kept" "$(cat "$dir/.codraw-deploy/previous/docker-compose.prod.yml")" "compose of old"
expect "deploy: .env.prod" "$(cat "$dir/.env.prod")" "SECRET=kept"
expect "deploy: backups" "$(cat "$FAKE/backups")" backup
expect "deploy: token" "$(cat "$FAKE/token")" job-token
expect "deploy: token pulls" "$(grep -c -- '--config .* pull -q ghcr.io/example/codraw-' "$FAKE/calls")" 4
expect "deploy: token not on a command line" "$(grep -c job-token "$FAKE/calls" || true)" 0
expect "deploy: old images removed" "$(cat "$FAKE/removed" 2> /dev/null)" ""
expect "deploy: script installed" "$([ -x "$dir/deploy/cd/codraw-deploy" ] && echo yes)" yes

# The next deployment removes the images of the version before the previous one.
mkdir -p "$dir/.codraw-deploy/incoming/deploy/cd"
echo "compose of newer" > "$dir/.codraw-deploy/incoming/docker-compose.prod.yml"
cp "$script" "$dir/.codraw-deploy/incoming/deploy/cd/codraw-deploy"
status=0
CODRAW_DEPLOY_BACKUP=0 deploy newer || status=$?
expect "next deploy: exit" "$status" 0
expect "next deploy: removed" "$(grep -c ':old$' "$FAKE/removed")" 4
expect "next deploy: kept previous" "$(grep -c ':new$' "$FAKE/removed" || true)" 0
expect "next deploy: no backup asked" "$(wc -l < "$FAKE/backups")" 1

# A configuration that .env.prod does not complete stops the deployment before anything changes.
setup old new
touch "$FAKE/fail-config"
status=0
deploy new || status=$?
expect "config: exit" "$status" 1
expect "config: running" "$(cat "$FAKE/running")" old
expect "config: files" "$(cat "$dir/docker-compose.prod.yml")" "compose of old"
expect "config: says why" "$(grep -c NEW_SECRET "$FAKE/log")" 1
expect "config: no backup" "$([ -e "$FAKE/backups" ] && echo backup)" ""

# Images that cannot be pulled, or are not there without a pull, stop it too.
setup old new
touch "$FAKE/fail-pull"
status=0
deploy new || status=$?
expect "pull: exit" "$status" 1
expect "pull: files" "$(cat "$dir/docker-compose.prod.yml")" "compose of old"
setup old new
status=0
CODRAW_DEPLOY_PULL=0 deploy new || status=$?
expect "missing images: exit" "$status" 1
expect "missing images: names them" "$(grep -c 'codraw-backend:new' "$FAKE/log")" 1
expect "missing images: no pull" "$(grep -c ' pull' "$FAKE/calls" || true)" 0

# So does a failed backup.
setup old new
touch "$FAKE/fail-backup"
status=0
deploy new || status=$?
expect "backup: exit" "$status" 1
expect "backup: running" "$(cat "$FAKE/running")" old
expect "backup: files" "$(cat "$dir/docker-compose.prod.yml")" "compose of old"

# A version that does not become healthy goes back to the previous one with its files.
setup old broken
echo broken > "$FAKE/broken"
status=0
deploy broken || status=$?
expect "rollback: exit" "$status" 1
expect "rollback: running" "$(cat "$FAKE/running")" old
expect "rollback: compose at up" "$(cat "$FAKE/compose-at-up")" "compose of old"
expect "rollback: rules" "$(cat "$dir/deploy/prometheus/alerts.yml")" "rules of old"
expect "rollback: version" "$(cat "$dir/.codraw-deploy/version")" old
expect "rollback: says so" "$(grep -c 'rolled back to old' "$FAKE/log")" 1

# Without a previous version, a failed one leaves the stack to the operator.
setup old broken
echo broken > "$FAKE/broken"
: > "$FAKE/running"
status=0
deploy broken || status=$?
expect "nothing to roll back to: exit" "$status" 2

# Another deployment at the same time waits for nothing: it refuses.
setup old new
exec 8> "$dir/.codraw-deploy/lock"
flock -n 8
status=0
deploy new || status=$?
exec 8>&-
expect "lock: exit" "$status" 1
expect "lock: running" "$(cat "$FAKE/running")" old

if [ "$failures" -gt 0 ]; then
  echo "$failures checks of codraw-deploy failed"
  exit 1
fi
echo "codraw-deploy: all checks passed"
