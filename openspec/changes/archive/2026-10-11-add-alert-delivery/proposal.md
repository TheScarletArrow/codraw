# Proposal

## Why

Prometheus профиля `monitoring` проверяет правила оповещений (`CodrawServiceDown`, `CodrawBackupFailed` и другие), но
отправлять их некуда: Alertmanager в стеке нет, и шапка `deploy/prometheus/alerts.yml` оставляет доставку установке.
Сработавшее правило видно только тому, кто сам открыл страницу Alerts через SSH-туннель, — то есть о поломке оператор
узнаёт от пользователей. Это пункт P0 перед выпуском MVP: оповещения должны доходить до людей.

**До:** правило срабатывает, Prometheus показывает его на своей странице, никто об этом не знает; упади сам Prometheus —
не узнает тем более.

**После:** с профилем `monitoring` стек поднимает Alertmanager; оператор задаёт в `.env.prod` Telegram, почту (те же
настройки SMTP, что у уведомлений CoDraw) или Slack-совместимый вебхук, и оповещения приходят туда с группировкой,
повторами и сообщением о разрешении. Необязательный «сторож» раз в несколько минут отмечается во внешнем сервисе
(healthchecks.io и подобных), и тот поднимает тревогу, если отметки прекратились. CI проверяет, что тестовое оповещение
доходит до получателя.

## What Changes

- Сервис `alertmanager` (`prom/alertmanager:v0.34.1`) в профиле `monitoring` `docker-compose.prod.yml`, том
  `alertmanager-data`, порт `127.0.0.1:9093` (`CODRAW_ALERTMANAGER_PORT`); секция `alerting` в
  `deploy/prometheus/prometheus.yml`.
- `deploy/alertmanager/entrypoint.sh` при запуске собирает конфигурацию из переменных окружения: получатели Telegram
  (`CODRAW_ALERT_TELEGRAM_BOT_TOKEN`, `CODRAW_ALERT_TELEGRAM_CHAT_ID`), почта (`CODRAW_ALERT_EMAIL_TO` и
  `CODRAW_SMTP_*`, `CODRAW_MAIL_FROM`), Slack-совместимый вебхук (`CODRAW_ALERT_CHAT_WEBHOOK_URL`: Slack, Mattermost,
  Rocket.Chat) и сторож (`CODRAW_ALERT_WATCHDOG_URL`). Секреты лежат в файлах с правами владельца и подключаются полями
  `*_file`, поэтому их нет в собранной конфигурации, в странице состояния Alertmanager и в журнале; токен Telegram, который
  Alertmanager печатает в ошибках сети, вырезается из журнала. Свой файл конфигурации оператор подключает
  `CODRAW_ALERTMANAGER_CONFIG`.
- Значения по умолчанию: группировка по правилу и сервису, первое оповещение через 30 с, повтор через 4 ч, сообщение о
  разрешении во всех каналах; `CodrawServiceDown` глушит производные правила своего сервиса.
- Правило `Watchdog` в `alerts.yml`, которое срабатывает всегда, и его тест.
- Без получателей стек поднимается как раньше; Alertmanager пишет предупреждение в журнал. Наполовину заданный получатель
  (токен без чата, адрес без SMTP) останавливает сервис с понятной строкой.
- Шаблоны сообщений `deploy/alertmanager/codraw.tmpl`: правило, сервис и `summary` на русском.
- CI: `amtool check-config` для конфигурации без получателей и со всеми; в проверке стека — Prometheus видит
  Alertmanager, тестовое оповещение `amtool` доходит до получателя-вебхука, поднятого в CI, сторож от Prometheus — до
  своего адреса, а токен Telegram не попадает в журнал.
- `docs/deploy.md` (настройка Telegram, почты, чата и сторожа, проверка отправки), `.env.prod.example`, шапка
  `alerts.yml`, ADR-0002, новый ADR-0013, README.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `observability`: стек с мониторингом доставляет оповещения получателям из настроек и отмечается у внешнего сторожа.

## Impact

- Новый каталог `deploy/alertmanager` (сборка конфигурации, шаблоны, проверка доставки для CI).
- `docker-compose.prod.yml`: сервис `alertmanager`, том `alertmanager-data`; Prometheus зависит от него.
- `deploy/prometheus`: `alerting`, правило `Watchdog` и его тест.
- `.github/workflows/ci.yml`: `amtool check-config`, проверка доставки в задаче `images`.
- Образов CoDraw, приложения, «Что нового» и версии изменение не касается: оно для операторов.
- Новый инструмент в стеке — Alertmanager — фиксирует ADR-0013.
