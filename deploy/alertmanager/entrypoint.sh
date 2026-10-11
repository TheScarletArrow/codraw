#!/bin/sh
# Alertmanager of the profile monitoring of docker-compose.prod.yml (docs/deploy.md, «Оповещения»):
#   entrypoint.sh [FLAGS...]   builds the configuration from the environment and runs alertmanager with the flags
#   entrypoint.sh check        builds the configuration and checks it with amtool, without starting alertmanager
# With CODRAW_ALERTMANAGER_CONFIG it takes that file as is instead. Secrets go to files of their own that the
# configuration names: never print a setting or pass it as an argument.
set -eu
umask 077

DIR=/tmp/alertmanager
SECRETS=$DIR/secrets
TEMPLATES=/etc/alertmanager/codraw/codraw.tmpl

log() {
  printf 'alertmanager: %s\n' "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

# A setting as a double-quoted YAML string; it must be one line.
quoted() {
  case "$2" in *[[:cntrl:]]*) fail "$1 must be one line without control characters" ;; esac
  printf '"%s"' "$(printf '%s' "$2" | sed 's/[\\"]/\\&/g')"
}

# The address of a webhook: http(s), one line. It goes to a secret file, never to the configuration.
check_url() {
  case "$2" in *[[:cntrl:]]*) fail "$1 must be one line without control characters" ;; esac
  case "$2" in http://?* | https://?*) ;; *) fail "$1 must be an address starting with http:// or https://" ;; esac
}

# Stops on a channel that is set in part or wrong, naming the setting, and writes the secrets of those that are set.
check_settings() {
  token=${CODRAW_ALERT_TELEGRAM_BOT_TOKEN:-}
  chat=${CODRAW_ALERT_TELEGRAM_CHAT_ID:-}
  telegram_api=${CODRAW_ALERT_TELEGRAM_API_URL:-}
  q_telegram_api=
  email_to=${CODRAW_ALERT_EMAIL_TO:-}
  chat_url=${CODRAW_ALERT_CHAT_WEBHOOK_URL:-}
  watchdog_url=${CODRAW_ALERT_WATCHDOG_URL:-}
  channels=

  if [ -n "$token" ] || [ -n "$chat" ]; then
    [ -n "$token" ] || fail "CODRAW_ALERT_TELEGRAM_BOT_TOKEN is not set, and CODRAW_ALERT_TELEGRAM_CHAT_ID is"
    [ -n "$chat" ] || fail "CODRAW_ALERT_TELEGRAM_CHAT_ID is not set, and CODRAW_ALERT_TELEGRAM_BOT_TOKEN is"
    # The format of Telegram, so the token goes into the regular expression of the log filter as is.
    case "$token" in *[[:cntrl:]]*) token=: ;; esac
    printf '%s' "$token" | grep -Eqx '[0-9]+:[A-Za-z0-9_-]+' ||
      fail "CODRAW_ALERT_TELEGRAM_BOT_TOKEN must look like 123456789:AAE…, the token that @BotFather gives"
    case "$chat" in *[[:cntrl:]]*) chat=x ;; esac
    # No leading zero: YAML would read the number as octal.
    printf '%s' "$chat" | grep -Eqx -- '-?[1-9][0-9]*' ||
      fail "CODRAW_ALERT_TELEGRAM_CHAT_ID must be a whole number, negative for groups"
    if [ -n "$telegram_api" ]; then
      check_url CODRAW_ALERT_TELEGRAM_API_URL "$telegram_api"
      q_telegram_api=$(quoted CODRAW_ALERT_TELEGRAM_API_URL "$telegram_api")
    fi
    printf '%s' "$token" > "$SECRETS/telegram-bot-token"
    channels="$channels telegram"
  fi

  if [ -n "$email_to" ]; then
    [ -n "${CODRAW_SMTP_HOST:-}" ] || fail "CODRAW_SMTP_HOST is not set, and CODRAW_ALERT_EMAIL_TO is"
    [ -n "${CODRAW_MAIL_FROM:-}" ] || fail "CODRAW_MAIL_FROM is not set, and CODRAW_ALERT_EMAIL_TO is"
    smtp_port=${CODRAW_SMTP_PORT:-587}
    case "$smtp_port" in '' | *[!0-9]*) fail "CODRAW_SMTP_PORT must be a port number" ;; esac
    require_tls=${CODRAW_ALERT_SMTP_REQUIRE_TLS:-true}
    case "$require_tls" in true | false) ;; *) fail "CODRAW_ALERT_SMTP_REQUIRE_TLS must be true or false" ;; esac
    # An IPv6 address of the server goes in brackets before the port; the port of any other host is CODRAW_SMTP_PORT.
    case "$CODRAW_SMTP_HOST" in
      *:*[!0-9A-Fa-f:]* | *[!0-9A-Fa-f:]*:*) fail "CODRAW_SMTP_HOST must be a host without a port, the port is CODRAW_SMTP_PORT" ;;
      *:*) smarthost="[$CODRAW_SMTP_HOST]:$smtp_port" ;;
      *) smarthost="$CODRAW_SMTP_HOST:$smtp_port" ;;
    esac
    case "$email_to" in *';'*) fail "CODRAW_ALERT_EMAIL_TO must be addresses of email, comma-separated" ;; esac
    IFS=,
    for address in $email_to; do
      case "$address" in *?@?*) ;; *) fail "CODRAW_ALERT_EMAIL_TO must be addresses of email, comma-separated" ;; esac
    done
    unset IFS
    case "$CODRAW_MAIL_FROM" in *?@?*) ;; *) fail "CODRAW_MAIL_FROM must hold an address of email" ;; esac
    q_email_to=$(quoted CODRAW_ALERT_EMAIL_TO "$email_to")
    q_from=$(quoted CODRAW_MAIL_FROM "$CODRAW_MAIL_FROM")
    q_smarthost=$(quoted CODRAW_SMTP_HOST "$smarthost")
    q_username=
    if [ -n "${CODRAW_SMTP_USERNAME:-}" ]; then
      q_username=$(quoted CODRAW_SMTP_USERNAME "$CODRAW_SMTP_USERNAME")
    fi
    [ -n "${CODRAW_SMTP_PASSWORD:-}" ] || [ -z "$q_username" ] ||
      fail "CODRAW_SMTP_PASSWORD is not set, and CODRAW_SMTP_USERNAME is"
    if [ -n "${CODRAW_SMTP_PASSWORD:-}" ]; then
      [ -n "$q_username" ] || fail "CODRAW_SMTP_USERNAME is not set, and CODRAW_SMTP_PASSWORD is"
      printf '%s' "$CODRAW_SMTP_PASSWORD" > "$SECRETS/smtp-password"
    fi
    channels="$channels email"
  fi

  if [ -n "$chat_url" ]; then
    check_url CODRAW_ALERT_CHAT_WEBHOOK_URL "$chat_url"
    printf '%s' "$chat_url" > "$SECRETS/chat-webhook-url"
    channels="$channels chat"
  fi

  if [ -n "$watchdog_url" ]; then
    check_url CODRAW_ALERT_WATCHDOG_URL "$watchdog_url"
    printf '%s' "$watchdog_url" > "$SECRETS/watchdog-url"
  fi
}

# The configuration: one receiver codraw with every channel set, the watchdog on a route of its own, and a receiver
# without channels for what has nowhere to go.
write_config() {
  main=none
  [ -z "$channels" ] || main=codraw
  watchdog=none
  [ -z "$watchdog_url" ] || watchdog=watchdog

  cat <<EOF
# Built by deploy/alertmanager/entrypoint.sh from the environment at each start; secrets are in files of their own.
templates:
  - $TEMPLATES

route:
  receiver: $main
  group_by: [alertname, job]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    # Always firing: a mark for the external watchdog every 5 minutes, never in the channels.
    - matchers: ['alertname="Watchdog"']
      receiver: $watchdog
      group_wait: 0s
      group_interval: 1m
      repeat_interval: 5m

# A service that is down silences the rules that fire because of it. No equal: some of those rules sum the series
# and lose the label job.
inhibit_rules:
  - source_matchers: ['alertname="CodrawServiceDown"', 'job="backend"']
    target_matchers: ['alertname=~"CodrawBackendErrors|CodrawDatabaseConnectionsPending|CodrawDocumentStoreFailures"']
  - source_matchers: ['alertname="CodrawServiceDown"', 'job="collab"']
    target_matchers: ['alertname="CodrawCollabBusy"']
  - source_matchers: ['alertname="CodrawServiceDown"', 'job="backup"']
    target_matchers: ['alertname=~"CodrawBackupFailed|CodrawBackupMissing"']

receivers:
  - name: none
EOF

  if [ -n "$channels" ]; then
    echo "  - name: codraw"
  fi
  if [ -f "$SECRETS/telegram-bot-token" ]; then
    cat <<EOF
    telegram_configs:
      - bot_token_file: $SECRETS/telegram-bot-token
        chat_id: $chat
        parse_mode: HTML
        message: '{{ template "codraw.telegram" . }}'
        send_resolved: true
EOF
    [ -z "$q_telegram_api" ] || echo "        api_url: $q_telegram_api"
  fi
  if [ -n "$email_to" ]; then
    cat <<EOF
    email_configs:
      - to: $q_email_to
        from: $q_from
        smarthost: $q_smarthost
        require_tls: $require_tls
EOF
    [ -z "$q_username" ] || echo "        auth_username: $q_username"
    [ ! -f "$SECRETS/smtp-password" ] || echo "        auth_password_file: $SECRETS/smtp-password"
    cat <<EOF
        headers:
          Subject: '{{ template "codraw.subject" . }}'
        text: '{{ template "codraw.text" . }}'
        html: ''
        send_resolved: true
EOF
  fi
  if [ -f "$SECRETS/chat-webhook-url" ]; then
    cat <<EOF
    slack_configs:
      - api_url_file: $SECRETS/chat-webhook-url
        title: '{{ template "codraw.title" . }}'
        title_link: ''
        fallback: '{{ template "codraw.title" . }}'
        text: '{{ template "codraw.text" . }}'
        send_resolved: true
EOF
  fi
  if [ -f "$SECRETS/watchdog-url" ]; then
    cat <<EOF
  - name: watchdog
    webhook_configs:
      - url_file: $SECRETS/watchdog-url
        send_resolved: false
EOF
  fi
}

build() {
  # A restarted container keeps /tmp: start from nothing.
  rm -rf "$DIR"
  mkdir -p "$SECRETS"
  check_settings
  write_config > "$DIR/alertmanager.yml"
  if [ -n "$channels" ]; then
    log "channels:$channels"
  else
    log "no channels are set (CODRAW_ALERT_*): alerts go nowhere, see docs/deploy.md «Оповещения»"
  fi
  [ -n "$watchdog_url" ] || log "CODRAW_ALERT_WATCHDOG_URL is not set: no external watchdog notices if monitoring stops"
}

if [ -n "${CODRAW_ALERTMANAGER_CONFIG:-}" ]; then
  [ -r "$CODRAW_ALERTMANAGER_CONFIG" ] || fail "cannot read CODRAW_ALERTMANAGER_CONFIG=$CODRAW_ALERTMANAGER_CONFIG"
  log "the configuration is $CODRAW_ALERTMANAGER_CONFIG, the settings CODRAW_ALERT_* are not used"
  config=$CODRAW_ALERTMANAGER_CONFIG
else
  build
  config=$DIR/alertmanager.yml
fi

if [ "${1:-}" = check ]; then
  exec /bin/amtool check-config "$config"
fi

# Alertmanager reads the secrets from the files only.
unset CODRAW_ALERT_TELEGRAM_BOT_TOKEN CODRAW_SMTP_PASSWORD CODRAW_ALERT_CHAT_WEBHOOK_URL CODRAW_ALERT_WATCHDOG_URL
set -- /bin/alertmanager --config.file="$config" --storage.path=/alertmanager --cluster.listen-address= "$@"
[ -f "$SECRETS/telegram-bot-token" ] || exec "$@"

# Alertmanager prints the address of Telegram with the token in errors of the network: its log goes through a filter
# that replaces the token. The filter reads the token from its file, and stops when alertmanager closes the pipe.
mkfifo "$DIR/log"
awk -v file="$SECRETS/telegram-bot-token" \
  'BEGIN { getline token < file; close(file) } { gsub(token, "<secret>"); print; fflush() }' < "$DIR/log" &
filter=$!
"$@" > "$DIR/log" 2>&1 &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null || true' TERM
trap 'kill -INT "$pid" 2>/dev/null || true' INT
# A signal ends wait early: wait again until alertmanager exits.
status=0
wait "$pid" || status=$?
while kill -0 "$pid" 2>/dev/null; do
  status=0
  wait "$pid" || status=$?
done
wait "$filter" || true
exit "$status"
