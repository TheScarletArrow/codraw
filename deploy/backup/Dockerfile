# Backup image: dumps the database and copies the images of boards on a schedule, keeps the archives by the rule of
# retention and restores them (docs/deploy.md, «Резервные копии»; docs/adr/0010-backups.md).
# rclone talks to the S3-compatible storages and encrypts archives; it comes as a static binary of its own image.
FROM rclone/rclone:1.75.2 AS rclone

# The cron of containers: it runs as any user, passes the environment to its jobs and logs them to stdout. Built from its
# module, verified by the checksum database of Go, with a current Go: the release binaries carry the Go of their day.
FROM golang:1.26-alpine AS supercronic
ARG SUPERCRONIC_VERSION=0.2.49
RUN CGO_ENABLED=0 go install -trimpath -ldflags="-s -w" github.com/aptible/supercronic@v${SUPERCRONIC_VERSION}

# The major version of the server of the stack, so that pg_dump and pg_restore fit it.
FROM postgres:18-alpine
# The fixes of the packages of Alpine that came after the base image; gosu of the image, which the backups do not run
# (they start as postgres), goes. The day of the build (`--build-arg`) runs the upgrade again every day: otherwise the
# cache of layers in CI keeps the packages of the day the layer was made.
ARG CODRAW_UPGRADE_DAY
RUN apk upgrade --no-cache \
    && rm -f /usr/local/bin/gosu \
    && mkdir -p /backups && chown postgres:postgres /backups
COPY --from=supercronic /go/bin/supercronic /usr/local/bin/supercronic
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY lib.sh /usr/local/lib/codraw-backup/lib.sh
COPY codraw-backup /usr/local/bin/codraw-backup
# A new named volume takes the owner of /backups from the image.
VOLUME /backups
USER postgres
WORKDIR /backups
EXPOSE 9187
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:9187/metrics.txt"]
ENTRYPOINT ["codraw-backup"]
CMD ["schedule"]
