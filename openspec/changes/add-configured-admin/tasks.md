## 1. backend

- [x] 1.1 backend: `AdminProperties` — `login` и `password` с проверкой при создании и `toString` без пароля, логин в `accounts`; проверка: unit-тест свойств
- [x] 1.2 backend: `PasswordService.ensureAccount` и `ConfiguredAdmin` по `ApplicationReadyEvent` — создание, приведение пароля с завершением сеансов, снятие блокировки; проверка: интеграционный тест
- [x] 1.3 backend: `PasswordSignIn` — вход по паролю с администратором из настроек, регистрация только при общем входе; `GET /api/auth/providers`, `/api/legal`, `PasswordController`; `/api/me` `passwordFromSettings` и 403 `password-from-settings`; проверка: интеграционный тест

## 2. frontend

- [x] 2.1 frontend: раздел «Пароль» администратора из настроек без формы; проверка: тест `AccountPage`

## 3. Документация

- [x] 3.1 `docker-compose.prod.yml`, `.env.prod.example`, `docs/deploy.md` («Администраторы установки»), README; проверка: документация описывает настройку
