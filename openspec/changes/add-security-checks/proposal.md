## Why

Перед выпуском MVP у CoDraw не было ни одной автоматической проверки безопасности: уязвимые зависимости и образы
находились только случайно, а сообщить об уязвимости было некуда, кроме публичного issue. Проверка кода по областям
(вход, права, `collab`, исходящие запросы, парсеры и загрузки, заголовки) нашла несколько мест, где пределы и запреты
установки обходились; их нужно закрыть до выпуска.

## What Changes

- CI: Dependabot (Gradle, pnpm, Dockerfile, compose, GitHub Actions) раз в неделю с группами; CodeQL для
  `javascript-typescript` и `java-kotlin` (backend собирается под экстрактором на JDK 25); сканирование четырёх образов
  Grype в джобе `images`, которое падает на CRITICAL и HIGH с исправленной версией; `pnpm audit --audit-level high` в
  джобе `web`. `SECURITY.md` — как сообщить об уязвимости приватно, `docs/security.md` — что и где проверяется.
- `collab`: предел размера документа считает каждое изменение, которое документ хранит; соединение говорит в
  присутствии только за свой клиент и от имени пользователя своего токена, с состоянием не больше 32 КиБ; читатели не
  рассылают «доска изменилась» и «решения изменились».
- `backend`: пределы по адресу считают сеть IPv6 /64 одним адресом и держат не больше 100 000 ключей; корзина хранит не
  больше 100 досок пользователя; запрет доступа администратором отзывает приглашения и
  переходит на копии доски; импорт схемы — не больше двух одновременно, общий срок импорта, ещё несколько особых
  диапазонов адресов и имена без управляющих символов; очиститель живой картинки и сообщения чатов строже.

## Capabilities

### New Capabilities

- `security-checks`: автоматические проверки безопасности в CI и порядок сообщения об уязвимостях.

### Modified Capabilities

- `realtime-sync`: размер документа и изменения без нового содержимого.
- `presence`: состояние присутствия соединения.
- `board-trash`: предел корзины.
- `admin-moderation`: запрет доступа, приглашения и копии.
- `live-schema-import`: одновременные импорты, срок импорта, особые адреса, имена.

## Impact

- `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `SECURITY.md`, `docs/security.md`.
- `collab`: `size.ts`, `server.ts` (`beforeHandleAwareness`, `onStateless`).
- `backend`: `AddressRateLimiter`, `NewGuestLimiter`, `LimitProperties` (`boards-in-trash-per-user`), `BoardService.moveToTrash`, `BoardMemberService`, `AdminService.blockSharing`,
  `BoardCopyService`, `schemaimport/*` (`import-timeout`, `max-concurrent-imports`), `SvgSanitizer`,
  `NotificationMessages`.
- Миграций нет; пользователю изменение почти не заметно, поэтому версия и «Что нового» не меняются.
