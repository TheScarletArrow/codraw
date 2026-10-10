# Tasks

## 1. Образ и скрипты копий

- [x] 1.1 deploy: `deploy/backup/Dockerfile` — `postgres:18-alpine`, `rclone` из `rclone/rclone:1.75.2`, `supercronic`
  0.2.49 с проверкой SHA-256, пользователь `postgres`, том `/backups`, проверка работоспособности по метрикам
- [x] 1.2 deploy: `deploy/backup/lib.sh` — настройки и их проверка, remotes rclone (изображения, внешнее хранилище,
  `crypt`), метрики, правило хранения (`retention_plan`)
- [x] 1.3 deploy: `deploy/backup/codraw-backup` — `schedule`, `now`, `list`, `restore`; блокировка, архив через
  временный файл, копия во внешнее хранилище, правило хранения на обоих хранилищах, отказ восстановления при чужих
  подключениях к базе
- [x] 1.4 deploy: `deploy/backup/retention.test.sh` — правило хранения на списках имён с заданным временем; проверка:
  тест проходит в собранном образе

## 2. Стек и мониторинг

- [x] 2.1 deploy: `docker-compose.prod.yml` — сервис `backup`, том `backups` (`CODRAW_BACKUP_VOLUME`), переменные
  копий; `CODRAW_LEGAL_BACKUP_*` у `backend`; Prometheus зависит от `backup`
- [x] 2.2 deploy: `deploy/prometheus` — задание `backup`, `CodrawServiceDown` для `backup`, `CodrawBackupFailed`,
  `CodrawBackupMissing` и их тесты в `alerts.test.yml`; проверка: `promtool check config` и `promtool test rules`
- [x] 2.3 deploy: `.env.prod.example` — настройки копий

## 3. Политика конфиденциальности

- [x] 3.1 backend: `LegalProperties` и `/api/legal` — `backupRetentionDays`, `backupOffsite`; проверка: тест
  `LegalController`
- [x] 3.2 frontend: `PrivacyPage.tsx` — резервные копии в сроках и получателях; `api` — поля ответа; проверка:
  `LegalPages.test.tsx`
- [x] 3.3 frontend: версия в `package.json` и «Что нового» в `releases.ts`; проверка: тест «Что нового»

## 4. Проверка в CI

- [x] 4.1 e2e: стек-тест кладёт на доску изображение и именованную версию через адрес приложения
- [x] 4.2 deploy: `deploy/backup/check-restore.sh` — правило хранения, неудачная копия в метриках и Prometheus,
  удаление старых архивов, отпечаток базы и бакета, восстановление в пустые базу и бакет из внешнего хранилища,
  сверка, секреты в журнале
- [x] 4.3 ci: `.github/workflows/ci.yml` — сборка, проверка и публикация образа `backup`, внешнее хранилище и
  шифрование копий в стеке, `check-restore.sh`, повторный стек-тест, `latest` для `backup`; проверка: локальный прогон
  задачи `images` с Docker

## 5. Документация

- [x] 5.1 docs: `docs/deploy.md` — раздел «Резервные копии» (настройки, внешнее хранилище, шифрование, правило
  хранения, метрики и оповещения, восстановление, ручная копия), сервис на схеме, CI
- [x] 5.2 docs: `docs/adr/0010-backups.md` — сервис копий, rclone и supercronic
- [x] 5.3 README: возможности, раздел «Резервные копии», пункт плана; проверка: `openspec validate --all --strict`
