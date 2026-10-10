# Functions of codraw-backup: settings, rclone remotes, metrics and the rule of retention. Sourced, not run.
# Secrets reach pg_dump and rclone only through their environment: never print a setting or pass it as an argument.

BACKUP_DIR=${CODRAW_BACKUP_DIR:-/backups}
WORK_DIR=$BACKUP_DIR/.work
RESTORE_DIR=$BACKUP_DIR/.restore
METRICS_DIR=$BACKUP_DIR/.metrics
METRICS_FILE=$METRICS_DIR/metrics.txt
METRICS_PORT=9187
# codraw-2026-10-10T030000Z.tar, and .tar.bin when encrypted: the time in UTC, so names sort by time.
ARCHIVE_PATTERN='^codraw-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.tar(\.bin)?$'

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

is_count() {
  case "$1" in '' | *[!0-9]*) return 1 ;; esac
}

# Fills the defaults and stops on a setting that cannot work, naming it.
check_settings() {
  CODRAW_BACKUP_SCHEDULE=${CODRAW_BACKUP_SCHEDULE:-0 3 * * *}
  CODRAW_BACKUP_KEEP_DAILY=${CODRAW_BACKUP_KEEP_DAILY:-7}
  CODRAW_BACKUP_KEEP_WEEKLY=${CODRAW_BACKUP_KEEP_WEEKLY:-4}
  is_count "$CODRAW_BACKUP_KEEP_DAILY" && [ "$CODRAW_BACKUP_KEEP_DAILY" -ge 1 ] ||
    fail "CODRAW_BACKUP_KEEP_DAILY must be a whole number from 1"
  is_count "$CODRAW_BACKUP_KEEP_WEEKLY" || fail "CODRAW_BACKUP_KEEP_WEEKLY must be a whole number from 0"
  for name in PGHOST PGDATABASE PGUSER PGPASSWORD CODRAW_IMAGES_S3_ENDPOINT CODRAW_IMAGES_S3_BUCKET \
    CODRAW_IMAGES_S3_ACCESS_KEY CODRAW_IMAGES_S3_SECRET_KEY; do
    eval "[ -n \"\${$name:-}\" ]" || fail "$name is not set"
  done
  if [ -n "${CODRAW_BACKUP_S3_ENDPOINT:-}" ]; then
    for name in CODRAW_BACKUP_S3_BUCKET CODRAW_BACKUP_S3_ACCESS_KEY CODRAW_BACKUP_S3_SECRET_KEY; do
      eval "[ -n \"\${$name:-}\" ]" || fail "$name is not set, and CODRAW_BACKUP_S3_ENDPOINT is"
    done
  fi
}

# The remotes of rclone, from the environment only: `images` (the storage of images), `offsite` (the storage of
# archives outside the server) and `sealed` (encryption over the file system, crypt with names in the clear).
configure_rclone() {
  export RCLONE_CONFIG=/dev/null
  # Errors only: notices of rclone about hashes and empty directories of S3 say nothing about the backup.
  export RCLONE_LOG_LEVEL=ERROR
  export RCLONE_CONFIG_IMAGES_TYPE=s3 RCLONE_CONFIG_IMAGES_PROVIDER=Other RCLONE_CONFIG_IMAGES_FORCE_PATH_STYLE=true
  export RCLONE_CONFIG_IMAGES_ENDPOINT="$CODRAW_IMAGES_S3_ENDPOINT"
  export RCLONE_CONFIG_IMAGES_REGION="${CODRAW_IMAGES_S3_REGION:-us-east-1}"
  export RCLONE_CONFIG_IMAGES_ACCESS_KEY_ID="$CODRAW_IMAGES_S3_ACCESS_KEY"
  export RCLONE_CONFIG_IMAGES_SECRET_ACCESS_KEY="$CODRAW_IMAGES_S3_SECRET_KEY"
  if [ -n "${CODRAW_BACKUP_S3_ENDPOINT:-}" ]; then
    export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER=Other RCLONE_CONFIG_OFFSITE_FORCE_PATH_STYLE=true
    export RCLONE_CONFIG_OFFSITE_ENDPOINT="$CODRAW_BACKUP_S3_ENDPOINT"
    export RCLONE_CONFIG_OFFSITE_REGION="${CODRAW_BACKUP_S3_REGION:-us-east-1}"
    export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$CODRAW_BACKUP_S3_ACCESS_KEY"
    export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$CODRAW_BACKUP_S3_SECRET_KEY"
    prefix=$(printf '%s' "${CODRAW_BACKUP_S3_PREFIX:-}" | sed 's#^/*##; s#/*$##')
    OFFSITE="offsite:$CODRAW_BACKUP_S3_BUCKET${prefix:+/$prefix}"
  else
    OFFSITE=
  fi
  if [ -n "${CODRAW_BACKUP_ENCRYPTION_PASSWORD:-}" ]; then
    export RCLONE_CONFIG_SEALED_TYPE=crypt RCLONE_CONFIG_SEALED_REMOTE=/ RCLONE_CONFIG_SEALED_FILENAME_ENCRYPTION=off
    export RCLONE_CONFIG_SEALED_DIRECTORY_NAME_ENCRYPTION=false
    # rclone takes the password obscured; it reads it from stdin, so it is never an argument.
    RCLONE_CONFIG_SEALED_PASSWORD=$(printf '%s' "$CODRAW_BACKUP_ENCRYPTION_PASSWORD" | rclone obscure -) ||
      fail "cannot prepare the encryption password"
    export RCLONE_CONFIG_SEALED_PASSWORD
    SUFFIX=.tar.bin
  else
    SUFFIX=.tar
  fi
}

# The value of a metric in the metrics file, empty without one.
metric() {
  [ -f "$METRICS_FILE" ] && awk -v name="$1" '$1 == name { print $2 }' "$METRICS_FILE"
}

# Writes the metrics: the last success, the last run and its result (empty before the first run), the size and the
# duration of the last archive. The file is replaced at once, so a scrape never reads half of it.
write_metrics() {
  mkdir -p "$METRICS_DIR"
  {
    echo '# HELP codraw_backup_last_success_timestamp_seconds When the last backup that succeeded finished, 0 before one.'
    echo '# TYPE codraw_backup_last_success_timestamp_seconds gauge'
    echo "codraw_backup_last_success_timestamp_seconds ${1:-0}"
    if [ -n "$3" ]; then
      echo '# HELP codraw_backup_last_run_timestamp_seconds When the last backup started.'
      echo '# TYPE codraw_backup_last_run_timestamp_seconds gauge'
      echo "codraw_backup_last_run_timestamp_seconds $2"
      echo '# HELP codraw_backup_last_run_success Whether the last backup succeeded: 1 or 0.'
      echo '# TYPE codraw_backup_last_run_success gauge'
      echo "codraw_backup_last_run_success $3"
    fi
    echo '# HELP codraw_backup_last_size_bytes The size of the last archive that was made.'
    echo '# TYPE codraw_backup_last_size_bytes gauge'
    echo "codraw_backup_last_size_bytes ${4:-0}"
    echo '# HELP codraw_backup_last_duration_seconds How long the last backup took.'
    echo '# TYPE codraw_backup_last_duration_seconds gauge'
    echo "codraw_backup_last_duration_seconds ${5:-0}"
  } > "$METRICS_FILE.new"
  mv "$METRICS_FILE.new" "$METRICS_FILE"
}

# The names of archives among the lines of stdin; succeeds without any.
archives() {
  awk -v pattern="$ARCHIVE_PATTERN" '$0 ~ pattern'
}

# Seconds since the epoch of the time in the name of an archive.
archive_epoch() {
  stamp=${1#codraw-}
  day=${stamp%%T*}
  clock=${stamp#*T}
  date -u -d "$day ${clock:0:2}:${clock:2:2}:${clock:4:2}" +%s
}

# Reads names of files and prints the archives to delete at the time $1 (seconds since the epoch): an archive stays when
# it is the last one of its day (UTC) younger than $2 days, or the last one of its ISO week younger than $3 weeks; the
# newest archive always stays. Other names are not archives and never printed.
retention_plan() {
  now=$1
  daily=$(($2 * 86400))
  weekly=$(($3 * 7 * 86400))
  archives | sort -r | {
    newest=1
    last_day=
    last_week=
    while read -r name; do
      epoch=$(archive_epoch "$name")
      age=$((now - epoch))
      day=$(date -u -d "@$epoch" +%Y-%m-%d)
      week=$(date -u -d "@$epoch" +%G-%V)
      keep=$newest
      newest=
      if [ "$day" != "$last_day" ]; then
        last_day=$day
        [ "$age" -lt "$daily" ] && keep=1
      fi
      if [ "$week" != "$last_week" ]; then
        last_week=$week
        [ "$age" -lt "$weekly" ] && keep=1
      fi
      [ -n "$keep" ] || echo "$name"
    done
  }
}
