## 1. backend

- [x] 1.1 backend: `OidcProperties` (`codraw.auth.oidc.<id>`) с проверкой id и пропуском провайдеров без issuer или client id; проверка: unit-тест настроек
- [x] 1.2 backend: `CodrawClientRegistrations` — GitHub и Google только с настоящим client id, провайдеры OIDC с ленивым чтением метаданных и кэшем удачи; `SignInProviderFailureFilter` → `/login?error`; проверка: unit-тест репозитория и интеграционный тест недоступного провайдера
- [x] 1.3 backend: `CodrawOidcUserService` — допуск по доменам почты и группам, профиль `oidc:<iss>` + `sub`, имя и аватар из claims, перенос гостя, `DefaultOidcUser` с `userId`; отказ → `/login?error=denied`; проверка: `OidcUserServiceTest` (смена почты, одинаковый `sub` у разных issuer, домены, группы)
- [x] 1.4 backend: `GET /api/auth/providers` без входа; `codraw.guests.enabled` и 403 у `POST /api/guest`; проверка: интеграционные тесты API
- [x] 1.5 backend: выход у провайдера — `logoutUrl` в ответе `POST /api/logout` для провайдера с `logout`; проверка: интеграционный тест
- [x] 1.6 backend: `/api/legal` — `signInProviders` и `guests`; проверка: тест `LegalController`
- [x] 1.7 backend: `OidcLoginTest` — Keycloak в Testcontainers, полный вход кодом авторизации, повторный вход после смены почты, второй realm, ограничения, выход у провайдера; проверка: тест проходит локально и в CI

## 2. frontend

- [x] 2.1 frontend: API `fetchLoginProviders`, `logout` с `logoutUrl`; страница входа по списку способов входа, «Вход не настроен», `?error=denied`, общий текст предела гостей; выход переходит к провайдеру; проверка: тесты `LoginPage` и `Layout`
- [x] 2.2 frontend: политика конфиденциальности — провайдеры входа установки и корпоративный провайдер; проверка: тест страниц
- [x] 2.3 frontend: «Что нового» и `version`; проверка: тест «Что нового»

## 3. Сквозная проверка и документация

- [x] 3.1 e2e: страница входа показывает способы входа установки, кнопка недоступного корпоративного провайдера возвращает на вход с ошибкой; проверка: e2e локально и в CI
- [x] 3.2 `docker-compose.prod.yml`: переменные провайдера `corp` и `CODRAW_GUESTS_ENABLED`; проверка: `docker compose config`
- [x] 3.3 `docs/deploy.md` (корпоративный вход, пример Keycloak, закрытая установка), `docs/running.md`, README, ADR-0011, «План работ»; проверка: документация описывает настройку
