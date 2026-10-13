## 1. backend

- [x] 1.1 backend: регистрации и провайдеры `yandex` и `vk` в `application.yaml` (`YANDEX_CLIENT_ID`,
  `YANDEX_CLIENT_SECRET`, `VK_CLIENT_ID`), Яндекс ID и VK ID в списке провайдеров `CodrawClientRegistrations`,
  зарезервированные id в `OidcProperties`; проверка: `CodrawClientRegistrationsTest`, тест настроек OIDC
- [x] 1.2 backend: `state` без `=` для всех провайдеров, `device_id` и `state` в обмене кода VK ID; проверка: тест
  адреса авторизации VK ID и полного входа
- [x] 1.3 backend: профиль Яндекс ID (`Authorization: OAuth`) и VK ID (`POST` с `client_id`, `user`), `ProviderProfile`
  для `yandex` и `vk`; проверка: `OAuth2LoginTest` (имя, аватар, без портрета, одинаковый id у разных провайдеров)
- [x] 1.4 backend: `yandex:<id>` и `vk:<user_id>` в `CODRAW_ADMINS`; проверка: тест `AdminProperties`
- [x] 1.5 backend: `id` провайдеров в `/api/legal`; причина неудачного входа через провайдера в журнале
  (`SignInFailureHandler`); проверка: `LegalApiTest`, `ClosedInstallationTest`
- [x] 1.6 backend: `FakeSignInProviders` и `YandexVkLoginTest` — полный вход MockMvc через оба провайдера, повторный
  вход, ошибка без `device_id`; проверка: тест проходит локально и в CI

## 2. frontend

- [x] 2.1 frontend: названия встроенных провайдеров по языку интерфейса на странице входа и в политике; проверка:
  тесты `LoginPage`
- [x] 2.2 frontend: политика конфиденциальности (Яндекс ID и VK ID, пол и дата рождения не хранятся) и условия без
  названий провайдеров на русском и английском, даты документов; проверка: тест правовых страниц
- [x] 2.3 frontend: подсказки гостю «после входа» без GitHub и Google; проверка: тесты страниц и `dictionaries.test.ts`
- [x] 2.4 frontend: справка, «Что нового» 0.48.0 и `version`; проверка: тесты справки и «Что нового»

## 3. Сквозная проверка и документация

- [x] 3.1 e2e: страница входа с кнопками Яндекс ID и VK ID и политика с ними; проверка: e2e локально и в CI
- [x] 3.2 `docker-compose.prod.yml` и `.env.prod.example`: `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `VK_CLIENT_ID`;
  проверка: `docker compose config`
- [x] 3.3 README (регистрация приложений Яндекс ID и VK ID), `docs/deploy.md`, `docs/running.md`, ADR-0015,
  «План работ»; проверка: документация описывает настройку
