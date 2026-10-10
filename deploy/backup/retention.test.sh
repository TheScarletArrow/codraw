#!/bin/sh
# Checks the rule of retention on lists of names, without a database or storages. In the backup image:
#   docker run --rm -v "$PWD/deploy/backup:/src:ro" --entrypoint sh <image> /src/retention.test.sh
. "${CODRAW_BACKUP_LIB:-/usr/local/lib/codraw-backup/lib.sh}"

failures=0

# expect_deleted <now> <daily> <weekly> <names> <expected>: the names, one per line, and what the rule deletes.
expect_deleted() {
  actual=$(printf '%s\n' "$4" | retention_plan "$(date -u -d "$1" +%s)" "$2" "$3" | sort)
  expected=$(printf '%s\n' "$5" | sed '/^$/d' | sort)
  if [ "$actual" != "$expected" ]; then
    failures=$((failures + 1))
    printf 'FAIL at %s, %s daily, %s weekly\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3" "$(echo $expected)" \
      "$(echo $actual)"
  fi
}

# A week of daily archives at 03:00 and one more an hour later today: the earlier of today's goes.
expect_deleted '2026-10-10 04:30:00' 7 0 "codraw-2026-10-04T030000Z.tar
codraw-2026-10-05T030000Z.tar
codraw-2026-10-06T030000Z.tar
codraw-2026-10-07T030000Z.tar
codraw-2026-10-08T030000Z.tar
codraw-2026-10-09T030000Z.tar
codraw-2026-10-10T030000Z.tar
codraw-2026-10-10T040000Z.tar" "codraw-2026-10-10T030000Z.tar"

# Eight days of archives with 7 daily: the one of 7 days ago is older than 7 days and goes.
expect_deleted '2026-10-10 03:00:05' 7 0 "codraw-2026-10-03T030000Z.tar
codraw-2026-10-04T030000Z.tar
codraw-2026-10-09T030000Z.tar
codraw-2026-10-10T030000Z.tar" "codraw-2026-10-03T030000Z.tar"

# Weekly: the last archive of each ISO week younger than 4 weeks stays, the rest of those weeks goes.
# 2026-10-10 is a Saturday of week 41; Sundays end the weeks 40, 39, 38 and 37.
expect_deleted '2026-10-10 03:30:00' 2 4 "codraw-2026-09-06T030000Z.tar
codraw-2026-09-12T030000Z.tar
codraw-2026-09-13T030000Z.tar
codraw-2026-09-19T030000Z.tar
codraw-2026-09-20T030000Z.tar
codraw-2026-09-27T030000Z.tar
codraw-2026-10-03T030000Z.tar
codraw-2026-10-04T030000Z.tar
codraw-2026-10-08T030000Z.tar
codraw-2026-10-09T030000Z.tar
codraw-2026-10-10T030000Z.tar" "codraw-2026-09-06T030000Z.tar
codraw-2026-09-12T030000Z.tar
codraw-2026-09-19T030000Z.tar
codraw-2026-10-03T030000Z.tar
codraw-2026-10-08T030000Z.tar"

# Backups stopped long ago: the newest archive stays all the same.
expect_deleted '2026-10-10 03:00:00' 7 4 "codraw-2025-01-01T030000Z.tar
codraw-2025-01-02T030000Z.tar.bin" "codraw-2025-01-01T030000Z.tar"

# Encrypted and plain archives are the same archives to the rule; other files are never touched.
expect_deleted '2026-10-10 03:00:00' 1 0 "codraw-2026-10-08T030000Z.tar.bin
codraw-2026-10-09T030000Z.tar
codraw-2026-10-10T030000Z.tar.bin
codraw-2026-10-10T030000Z.tar.bin.partial
notes.txt
.metrics" "codraw-2026-10-08T030000Z.tar.bin
codraw-2026-10-09T030000Z.tar"

# Nothing to delete.
expect_deleted '2026-10-10 03:00:00' 7 4 "" ""

if [ "$failures" != 0 ]; then
  echo "$failures checks of the rule of retention failed"
  exit 1
fi
echo "the rule of retention: all checks passed"
