# Проверки безопасности

Как сообщить об уязвимости — в [SECURITY.md](../SECURITY.md). Здесь — что репозиторий проверяет сам и что делать,
когда проверка краснеет.

## Что проверяется

| Проверка | Где | Когда падает |
|---|---|---|
| Обновления зависимостей | Dependabot, `.github/dependabot.yml` | Не падает: раз в неделю (понедельник) открывает pull request с минорными обновлениями и патчами каждой экосистемы — Gradle, pnpm, Dockerfile, compose, GitHub Actions; мажорные версии — отдельными pull request, кроме базовых образов (Node.js, JDK, PostgreSQL), которые меняют вручную. `@hocuspocus/*` обновляется вручную вместе с патчем в `patches/`. |
| Анализ кода | CodeQL, `.github/workflows/codeql.yml` | Не падает: находки набора `security-extended` для TypeScript/JavaScript и Kotlin появляются в «Security → Code scanning». Запускается на каждом пуше и раз в неделю. |
| Уязвимости в образах | Grype, джоба `images` в `.github/workflows/ci.yml` | Уязвимость CRITICAL или HIGH, у которой есть исправленная версия, в любом из образов `backend`, `collab`, `frontend`, `backup`. Сводка в логе называет пакет, версию, исправление и файл. |
| Уязвимости в пакетах pnpm | `pnpm audit --audit-level high`, джоба `web` | Уязвимость high или critical в `pnpm-lock.yaml`. |

Зависимости Gradle проверяются через образ `backend`: Grype читает jar-файлы внутри него.

## Когда проверка покраснела

- **Образ.** Если уязвим пакет базового образа (apk, deb), обычно хватает пересборки: новые версии тегов `node:24-alpine`,
  `eclipse-temurin:25-jre-noble` и других уже содержат исправление. Если нет — обновите тег в Dockerfile или пакет в
  нём. Если уязвим jar или пакет npm внутри образа — обновите зависимость в `build.gradle.kts` или `package.json`.
  Образы на Alpine в CI заново выполняют `apk upgrade` раз в сутки (аргумент сборки `CODRAW_UPGRADE_DAY`), поэтому
  исправленный пакет Alpine попадает в них не позже следующего дня, даже если базовый тег не менялся.
- **pnpm audit.** `pnpm update <пакет>` или, для транзитивной зависимости, `pnpm.overrides` в корневом `package.json`.
- **CodeQL.** Разберите находку; ложное срабатывание закройте в «Security → Code scanning» с причиной.

Не публикуйте подробности неисправленной уязвимости в issue и pull request: см. [SECURITY.md](../SECURITY.md).

## Настройки репозитория

Включает владелец в «Settings → Code security»: Dependabot alerts и security updates, secret scanning и push protection,
private vulnerability reporting (без него кнопка «Report a vulnerability» из `SECURITY.md` недоступна).
