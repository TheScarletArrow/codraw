# Tasks

## 1. Alertmanager

- [x] 1.1 deploy: `deploy/alertmanager/entrypoint.sh` — сборка конфигурации из окружения (Telegram, почта, чат, сторож),
  секреты в файлах `0600` и поля `*_file`, проверка наполовину заданных каналов, предупреждение без каналов, свой файл
  `CODRAW_ALERTMANAGER_CONFIG`, фильтр токена Telegram в журнале, передача сигналов; режим `check` с
  `amtool check-config`
- [x] 1.2 deploy: `deploy/alertmanager/codraw.tmpl` — заголовок и текст оповещений для Telegram, почты и чата
- [x] 1.3 deploy: маршрут (`group_by`, `group_wait`, `group_interval`, `repeat_interval`, `send_resolved`), глушение
  производных правил `CodrawServiceDown`, маршрут сторожа; проверка: `amtool check-config` без каналов и со всеми

## 2. Стек и Prometheus

- [x] 2.1 deploy: `docker-compose.prod.yml` — сервис `alertmanager` в профиле `monitoring`, том `alertmanager-data`,
  порт `CODRAW_ALERTMANAGER_PORT`, переменные каналов; Prometheus зависит от него
- [x] 2.2 deploy: `deploy/prometheus` — `alerting`, правило `Watchdog`, его тест, шапка `alerts.yml`; проверка:
  `promtool check config`, `promtool test rules`
- [x] 2.3 deploy: `.env.prod.example` — каналы оповещений и сторож

## 3. Проверка в CI

- [x] 3.1 deploy: `deploy/alertmanager/check-delivery.sh` — получатель-вебхук в сети стека, Prometheus видит
  Alertmanager, тестовое оповещение доходит в формате Slack, сторож доходит от Prometheus, токена Telegram нет в журнале
- [x] 3.2 ci: `.github/workflows/ci.yml` — `amtool check-config` в шаге конфигурации, каналы CI в окружении стека,
  `check-delivery.sh` после подъёма стека; проверка: локальный прогон с Docker

## 4. Документация

- [x] 4.1 docs: `docs/deploy.md` — раздел «Оповещения» (Telegram, почта, чат, сторож, своя конфигурация, проверка
  отправки, предупреждение без каналов), таблица правил, «Что проверяет CI»
- [x] 4.2 docs: `docs/adr/0013-alert-delivery.md` — Alertmanager и конфигурация из окружения; ссылка из ADR-0002
- [x] 4.3 README: раздел «Мониторинг», пункт 115 плана; проверка: `openspec validate --all --strict`
