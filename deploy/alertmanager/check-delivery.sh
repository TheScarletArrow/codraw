#!/usr/bin/env bash
# The check of alerts in CI (the job `images`): against the stack of docker-compose.prod.yml with the profile
# `monitoring`, started with the chat webhook and the watchdog on http://alert-sink:8080/chat and /watchdog and Telegram
# with an invented token and a Bot API on a closed port. It starts that receiver in the network of the stack, checks that Prometheus sees Alertmanager,
# that a test alert reaches the chat in the format of Slack, that the watchdog reaches its address from Prometheus and
# not the chat, and that the token of Telegram, whose delivery fails, is not in the log of Alertmanager.
# Run from the root of the repository with the environment that started the stack. The receiver goes when the check
# ends; on a failure the check prints what it received and the log of Alertmanager first.
set -euo pipefail

compose() { docker compose -f docker-compose.prod.yml --profile monitoring "$@"; }
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

SINK=alert-sink
NETWORK=codraw-prod_default
SUMMARY="Проверка доставки оповещений в CI"

# The receiver: answers 200 to each POST and prints its path and its body as one line of JSON.
RECEIVER='
import http.server, json

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            body = json.dumps(json.loads(body), ensure_ascii=False, separators=(",", ":"))
        except ValueError:
            body = body.decode("utf-8", "replace").replace("\n", " ")
        print(self.path, body, flush=True)
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(("", 8080), Handler)
print("listening on 8080", flush=True)
server.serve_forever()
'

# grep and tail read all of their input in the pipes below: grep -q or head may stop early, and pipefail takes the
# broken pipe of the command before them for a failure.

# The requests that reached the path $1, a body per line.
received() { docker logs "$SINK" 2> /dev/null | awk -v path="$1" '$1 == path { sub(/^[^ ]+ /, ""); print }'; }

test_alert_received() {
  received /chat | grep -F CodrawTestAlert | grep -F "$SUMMARY" | grep -F '"attachments":' > /dev/null
}
watchdog_received() { received /watchdog | grep -F '"alertname":"Watchdog"' > /dev/null; }

alertmanager_seen() {
  curl -s http://127.0.0.1:9090/api/v1/alertmanagers |
    jq -e '.data.activeAlertmanagers[] | select(.url == "http://alertmanager:9093/api/v2/alerts")'
}

finish() {
  local status=$?
  if [ "$status" != 0 ]; then
    echo "The receiver got:"
    docker logs "$SINK" 2>&1 || true
    echo "The log of Alertmanager:"
    compose logs --no-color --tail 100 alertmanager || true
  fi
  docker rm -f "$SINK" > /dev/null 2>&1 || true
}

: "${CODRAW_ALERT_TELEGRAM_BOT_TOKEN:?set CODRAW_ALERT_TELEGRAM_BOT_TOKEN as for the stack}"

step "The receiver of alerts in the network of the stack"
docker rm -f "$SINK" > /dev/null 2>&1 || true
trap finish EXIT
docker run -d --name "$SINK" --network "$NETWORK" --network-alias "$SINK" -e PYTHONUTF8=1 \
  python:3.13.15-alpine python -c "$RECEIVER" > /dev/null
wait_for 30 bash -c "docker logs $SINK 2>&1 | grep -q 'listening on 8080'" || fail "the receiver of alerts does not start"
done_step

step "Prometheus sends its alerts to Alertmanager"
wait_for 60 alertmanager_seen || fail "Prometheus does not list http://alertmanager:9093/api/v2/alerts as active"
done_step

# A service of its own each run: a group already notified waits for its repeat of 4 hours.
step "A test alert reaches the chat in the format of Slack"
compose exec -T alertmanager amtool alert add CodrawTestAlert severity=warning "job=ci-$(date +%s)" \
  --annotation="summary=\"$SUMMARY\"" --alertmanager.url=http://127.0.0.1:9093
wait_for 120 test_alert_received || fail "the test alert does not reach the chat webhook"
received /chat | grep -F CodrawTestAlert
done_step

# The receiver started after the stack: Alertmanager sends the watchdog again within its interval of a group, a minute.
step "The watchdog of Prometheus reaches the address of the watchdog, not the chat"
wait_for 150 watchdog_received || fail "Watchdog does not reach the watchdog address"
received /watchdog | tail -n 1
if received /chat | grep -F Watchdog > /dev/null; then fail "Watchdog reached the chat"; fi
done_step

# The Bot API of the stack is a closed port: the errors of the network hold its address with the token, and the filter
# of the log must replace it. (Telegram itself answers an invented token with 401, without the address.)
step "No token of Telegram in the log of Alertmanager"
telegram_errors() { compose logs --no-color alertmanager | grep -F 'integration=telegram' | grep -F 'bot<secret>/'; }
wait_for 60 telegram_errors || fail "no error of the network of Telegram with the token replaced in the log of Alertmanager"
telegram_errors | tail -n 1
if compose logs --no-color alertmanager | grep -F -- "$CODRAW_ALERT_TELEGRAM_BOT_TOKEN" > /dev/null; then
  fail "the log of Alertmanager holds the token of Telegram"
fi
done_step

echo "Alerts: Prometheus sees Alertmanager, the chat and the watchdog get theirs, the token stays out of the log"
