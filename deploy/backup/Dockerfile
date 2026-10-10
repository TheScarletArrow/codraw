# Backup image: dumps the database and copies the images of boards on a schedule, keeps the archives by the rule of
# retention and restores them (docs/deploy.md, «Резервные копии»; docs/adr/0010-backups.md).
# rclone talks to the S3-compatible storages and encrypts archives; it comes as a static binary of its own image.
FROM rclone/rclone:1.75.2 AS rclone

# The major version of the server of the stack, so that pg_dump and pg_restore fit it.
FROM postgres:18-alpine
ARG TARGETARCH
ARG SUPERCRONIC_VERSION=0.2.49
# The cron of containers: it runs as any user, passes the environment to its jobs and logs them to stdout.
ADD https://github.com/aptible/supercronic/releases/download/v${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH} /usr/local/bin/supercronic
RUN case "$TARGETARCH" in \
      amd64) sum=a53ae236602c7338aba3fbaff40bda6300eae3b9fedb8261eb06cfe3724430c1 ;; \
      arm64) sum=02aa0cb229ba09050cba6638059dadb9eedc2276632ea43d6a57a2f8c1629dd5 ;; \
      *) echo "no supercronic for $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && echo "$sum  /usr/local/bin/supercronic" | sha256sum -c - \
    && chmod 755 /usr/local/bin/supercronic \
    && mkdir -p /backups && chown postgres:postgres /backups
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
