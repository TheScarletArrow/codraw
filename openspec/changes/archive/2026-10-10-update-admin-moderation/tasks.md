## 1. backend

- [x] 1.1 backend: `DELETE /api/admin/users/{id}` через `AccountDeletionService` (`UndecidedBoards.DELETE`), 409 для себя, администраторов и единственного владельца пространства, `DELETE_USER` в журнале и в проверке `V29`; блокировка закрывает сеансы через `Accounts.endSessions`; проверка: тесты API
- [x] 1.2 backend: `oidc:<issuer>:<sub>` в `CODRAW_ADMINS`, отказ заблокированному во входе через OIDC, `?error=denied` и `?blocked` в одном обработчике; проверка: тесты конфигурации, `CodrawOidcUserServiceTest`, `SignInFailureHandlerTest`
- [x] 1.3 backend: `POST /internal/users/check` вместо `/missing` и `/blocked`; проверка: `UserChecksApiTest`

## 2. collab

- [x] 2.1 collab: `checkUsers`, отказ при подключении с `account-deleted` и `user-blocked`, одна проверка соединений раз в 10 секунд (`USER_CHECK_INTERVAL_MS`); проверка: тесты сервера и клиента

## 3. frontend и документация

- [x] 3.1 frontend: «Удалить» во вкладке «Пользователи» с подтверждением и сообщением о единственном владельце пространства, `account-deleted` в подключении доски; проверка: тесты `AdminPage` и `BoardPage`
- [x] 3.2 README, `docs/deploy.md`, `.env.prod.example`, политика конфиденциальности, «Что нового» 0.38.0, пункт 109 «Плана работ»; проверка: тесты страниц
