#!/usr/bin/env bash
# The check of backups in CI (the job `images`): against the stack of docker-compose.prod.yml with the profile
# `monitoring`, a storage of backups outside the server, encryption, CODRAW_BACKUP_KEEP_DAILY=3 and
# CODRAW_BACKUP_KEEP_WEEKLY=2, after the check of the stack in a browser has made a board with a document, an image and
# a named version. It checks a refused restore and a failed backup, the rule of retention, then backs up, loses the
# database, the images and the archives of the server, restores from the storage outside and compares the data.
# Run from the root of the repository with the environment that started the stack.
set -euo pipefail

compose() { docker compose -f docker-compose.prod.yml --profile monitoring "$@"; }
backup() { compose exec -T backup codraw-backup "$@"; }
sql() { compose exec -T postgres psql -XAt -U "${POSTGRES_USER:-codraw}" -d "${POSTGRES_DB:-codraw}" -c "$1"; }
metric() { compose exec -T backup wget -q -O - http://127.0.0.1:9187/metrics.txt | awk -v name="$1" '$1 == name { print $2 }'; }
step() { echo "::group::$*"; }
done_step() { echo "::endgroup::"; }
fail() { echo "::error::$*"; exit 1; }

# Waits up to $1 seconds for the command after it to succeed.
wait_for() {
  local seconds=$1
  shift
  for _ in $(seq 1 "$seconds"); do
    if "$@" > /dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

alert_firing() {
  curl -s http://127.0.0.1:9090/api/v1/alerts |
    jq -e --arg name "$1" '.data.alerts[] | select(.labels.alertname == $name and .state == "firing")'
}

# Every table of the schema `public`, its rows and their hash, and every image of the bucket with the hash of its bytes.
fingerprint() {
  local table
  for table in $(sql "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"); do
    sql "SELECT '$table', count(*), coalesce(md5(string_agg(t::text, E'\\n' ORDER BY t::text)), '-') FROM public.\"$table\" t"
  done
  backup rclone md5sum --download "images:${CODRAW_IMAGES_S3_BUCKET:-codraw-images}" | sort -k2
}

archives() { backup list "$@" | sort; }
has_rows() { [ "$(sql "SELECT count(*) > 0 FROM $1")" = t ]; }

step "The rule of retention"
docker run --rm -v "$PWD/deploy/backup:/src:ro" --entrypoint sh "${CODRAW_IMAGE_PREFIX}backup:${CODRAW_VERSION}" /src/retention.test.sh
done_step

step "The first backup of the stack, made at its start"
[ "$(metric codraw_backup_last_run_success)" = 1 ] || fail "the first backup did not succeed"
[ "$(archives | wc -l)" = 1 ] || fail "there is no first archive on the server"
[ "$(archives --remote | wc -l)" = 1 ] || fail "there is no first archive in the storage of backups"
first=$(archives)
[[ "$first" == *.tar.bin ]] || fail "the first archive $first is not encrypted"
if compose exec -T backup tar -tf "/backups/$first" > /dev/null 2>&1; then fail "the encrypted archive reads as tar"; fi
done_step

step "A restore while backend works is refused"
if output=$(compose run --rm --no-deps -T backup restore latest 2>&1); then fail "the restore ran while backend works"; fi
grep -q "stop backend and collab" <<< "$output" || fail "the refused restore does not say why: $output"
done_step

step "A failed backup shows in the metrics and in an alert"
if compose exec -T -e PGPASSWORD=wrong backup codraw-backup now; then fail "a backup with a wrong password succeeded"; fi
[ "$(metric codraw_backup_last_run_success)" = 0 ] || fail "the failed backup is not in the metrics"
wait_for 120 alert_firing CodrawBackupFailed || fail "Prometheus does not fire CodrawBackupFailed"
done_step

step "The data of the stack: boards, documents, versions and images"
for table in boards board_documents board_versions board_images; do
  wait_for 60 has_rows "$table" || fail "the stack has nothing in $table to back up"
done
# Nobody writes while the data is compared: the app stops, the services of data and of backups work.
compose stop frontend collab backend
before=$(fingerprint)
echo "$before"
done_step

step "Old archives go by the rule of retention, on the server and outside of it"
day() { date -u -d "$1 days ago" +%Y-%m-%d; }
kept=("codraw-$(day 1)T020000Z.tar.bin" "codraw-$(day 2)T010000Z.tar")
# With the first archive of the stack, made today before the new one, these go.
doomed=("codraw-$(day 1)T010000Z.tar.bin" codraw-2025-01-01T030000Z.tar.bin codraw-2025-01-06T030000Z.tar)
for name in "${kept[@]}" "${doomed[@]}" notes.txt; do
  compose exec -T backup touch "/backups/$name"
  backup rclone touch "offsite:$CODRAW_BACKUP_S3_BUCKET/$CODRAW_BACKUP_S3_PREFIX/$name"
done
backup now
latest=$(archives | tail -n 1)
expected=$(printf '%s\n' "${kept[@]}" "$latest" | sort)
[ "$(archives)" = "$expected" ] || fail "the server keeps $(archives | xargs), not $(xargs <<< "$expected")"
[ "$(archives --remote)" = "$expected" ] || fail "the storage keeps $(archives --remote | xargs), not $(xargs <<< "$expected")"
compose exec -T backup test -f /backups/notes.txt || fail "the rule of retention deleted a file that is not an archive"
[ "$(metric codraw_backup_last_run_success)" = 1 ] || fail "the backup did not succeed"
done_step

step "The server loses its database, its images and its archives"
compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
backup rclone purge "images:${CODRAW_IMAGES_S3_BUCKET:-codraw-images}"
compose exec -T backup sh -c 'rm -f /backups/codraw-*'
[ "$(sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")" = 0 ] || fail "the database is not empty"
done_step

step "The restore of the last archive from the storage of backups"
compose run --rm --no-deps -T backup restore latest --remote
after=$(fingerprint)
if [ "$before" != "$after" ]; then
  diff <(echo "$before") <(echo "$after") || true
  fail "the restored data differs from the backed up"
fi
done_step

step "The stack works again on the restored data"
compose up -d --no-build --wait --wait-timeout 300
wait_for 120 bash -c '! curl -s http://127.0.0.1:9090/api/v1/alerts | jq -e ".data.alerts[] | select(.labels.alertname == \"CodrawBackupFailed\")"' ||
  fail "CodrawBackupFailed does not end after a backup that succeeded"
done_step

step "No secret in the log of backups"
log=$(compose logs --no-color backup)
for secret in "$POSTGRES_PASSWORD" "$CODRAW_S3_SECRET_KEY" "$CODRAW_BACKUP_S3_SECRET_KEY" "$CODRAW_BACKUP_ENCRYPTION_PASSWORD"; do
  if grep -qF -- "$secret" <<< "$log"; then fail "the log of backups holds a secret"; fi
done
done_step

echo "Backups: made, kept by the rule, encrypted, restored and equal"
