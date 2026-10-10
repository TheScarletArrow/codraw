# Tasks

## 1. Удаление в backend

- [x] 1.1 backend: миграция V28 и откат U28 — индекс `comment_threads (resolved_by)`; проверка: `MigrationsTest`, `AccountDeletionApiTest`
- [x] 1.2 backend: `AccountDeletionService` — `preview`, `delete` с решениями о досках и режимом `undecided`, проверка единственного владельца пространства, уход из пространств, передача и удаление досок, обезличивание `editors` и `authors` нулевым UUID, завершение сеансов, удаление пользователя; версии показывают нулевой UUID как «Удалённый пользователь»; проверка: `AccountDeletionApiTest`
- [x] 1.3 backend: `GET /api/me/deletion`, `DELETE /api/me` (204, сеанс и cookie, 409 `decisions-required` / `sole-workspace-owner` / предел, 400 не участник); проверка: `AccountDeletionApiTest`
- [x] 1.4 backend: тест полноты — все внешние ключи на `users` из `pg_constraint` сверяются со списком, у каждого есть индекс, после удаления ни один столбец, массив и `spring_session` не ссылаются на пользователя; проверка: `AccountDeletionApiTest`
- [x] 1.5 backend: `POST /internal/users/missing`; проверка: `MissingUsersApiTest`

## 2. Выгрузка в backend

- [x] 2.1 backend: предел `exports-per-user-per-day`, метка `account-exports` метрики пределов, счётчик `codraw_accounts_deleted_total`; `POST /api/me/export` (JSON со всеми данными) и `GET /api/me/export/boards/{id}`; проверка: `AccountExportApiTest`

## 3. collab

- [x] 3.1 collab: `missingUsers` в клиенте backend, раз в минуту закрывать соединения пользователей, которых нет, с `4401 account-deleted`; проверка: `server.test.ts`, `backend-client.test.ts`

## 4. frontend

- [x] 4.1 frontend: `api/account.ts`; сборка архива выгрузки (`account/exportArchive.ts`) с JSON и `.drawio` досок; проверка: `exportArchive.test.ts`
- [x] 4.2 frontend: страница `/settings/account` — «Мои данные» и «Удаление учётной записи» с решениями о досках, пространствами, подтверждением; ссылка в шапке; сообщение «Учётная запись удалена» на странице входа; проверка: `AccountPage.test.tsx` (со страницей входа), `Layout.test.tsx`
- [x] 4.3 frontend: «Что нового» и версия приложения; политика конфиденциальности; проверка: тесты «Что нового» и `LegalPages.test.tsx`

## 5. Проверка и документация

- [x] 5.1 e2e: пользователь скачивает архив, передаёт доску участнику и удаляет учётную запись, участник видит доску и комментарий «Удалённый пользователь», новый вход создаёт пустую учётную запись; проверка: `account-deletion.spec.ts`
- [x] 5.2 README (возможности, раздел, план работ), `docs/deploy.md` (предел); проверка: `openspec validate add-account-deletion`
