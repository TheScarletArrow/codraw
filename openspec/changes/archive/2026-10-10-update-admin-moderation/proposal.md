## Why

Администрирование установки (#162) вышло раньше удаления учётной записи (#155) и корпоративного входа OIDC (#158) и
поэтому не умело ни того, ни другого: администратор мог только блокировать, а установку только с корпоративным входом
некому было администрировать — `CODRAW_ADMINS` не принимал пользователей OIDC. Кроме того, `collab` после обоих
изменений спрашивал `backend` о пользователях своих соединений двумя запросами с разной частотой.

## What Changes

- «Удалить» во вкладке «Пользователи»: администратор удаляет учётную запись через сервис удаления #155, без решений о
  досках — общие доски удаляются вместе с личными (`UndecidedBoards.DELETE`). Себя и других администраторов удалить
  нельзя (409), единственного владельца пространства с другими участниками — тоже (409, `sole-workspace-owner`).
  Удаление пишется в журнал.
- `CODRAW_ADMINS` принимает пользователей корпоративного провайдера: `oidc:<issuer>:<sub>`.
- Вход заблокированного через корпоративного провайдера тоже ведёт на `/login?blocked`.
- `collab` проверяет пользователей соединений одним запросом `POST /internal/users/check` раз в 10 секунд: ответ
  называет и удалённых (`account-deleted`), и заблокированных (`user-blocked`); при подключении тот же запрос задаётся о
  самом пользователе. `POST /internal/users/missing` и `POST /internal/users/blocked` больше нет.

## Capabilities

### New Capabilities

### Modified Capabilities

- `admin-moderation`: администраторы OIDC, удаление учётной записи администратором.
- `user-auth`: вход заблокированного через корпоративного провайдера.
- `account-deletion`: соединения удалённого пользователя закрываются одной проверкой с заблокированными, не позже чем
  через 10 секунд, и не открываются по токену, выданному до удаления.

## Impact

- `backend`: `AdminService.deleteUser`, `DELETE /api/admin/users/{id}`, `AdminProperties` с `oidc:`, `CodrawOidcUserService`,
  `UserChecksController` вместо `MissingUsersController` и `BlockedUsersController`, `delete-user` в журнале (`V29`).
- `collab`: `checkUsers`, `createUserChecks`, `USER_CHECK_INTERVAL_MS` вместо `BLOCKED_CHECK_INTERVAL_MS`.
- `frontend`: «Удалить» в администрировании, реакция страницы доски на `account-deleted`.
- `docs/deploy.md`, README, `.env.prod.example`, политика конфиденциальности, «Что нового».
