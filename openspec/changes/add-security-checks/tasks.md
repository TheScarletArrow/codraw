## 1. Проверки в CI

- [x] 1.1 ci: `.github/dependabot.yml` — Gradle, pnpm, Dockerfile, compose, GitHub Actions, группы и игнор мажорных версий образов и `@hocuspocus/*`; проверка: разбор YAML
- [x] 1.2 ci: `.github/workflows/codeql.yml` — `javascript-typescript` и `java-kotlin` вручную на JDK 25, `security-extended`; проверка: зелёный запуск в CI и локальный CodeQL CLI
- [x] 1.3 ci: Grype для четырёх образов в джобе `images`, падение на исправимых CRITICAL и HIGH со сводкой; проверка: запуск в CI
- [x] 1.4 ci: `pnpm audit --audit-level high` в джобе `web`; проверка: локальный `pnpm audit`
- [x] 1.5 docs: `SECURITY.md`, `docs/security.md`, строка в «Плане работ»

## 2. Исправления

- [x] 2.1 collab: предел размера считает удаления того, чего нет в документе; проверка: тест в `server.test.ts`
- [x] 2.2 collab: `beforeHandleAwareness` — свой клиент и переподключение, пользователь из токена, 32 КиБ с пустым выделением; читатели без `board-changed` и `decisions-changed`; проверка: тесты «viewing only»
- [x] 2.3 backend: `AddressRateLimiter` — сеть IPv6 /64, не больше 100 000 ключей, затем счёт заново, уборка раз в секунду; проверка: `AddressRateLimiterTest`
- [x] 2.4 backend: предел корзины пользователя; проверка: `LimitsApiTest`
- [x] 2.5 backend: запрет доступа отзывает приглашения и переходит на копии; проверка: `AdminApiTest`
- [x] 2.6 backend: импорт схемы — одновременные импорты, общий срок, особые диапазоны, имена без управляющих символов; проверка: `PostgresConnectionsTest`, `AllowedHostsTest`, `SchemaImportApiTest`
- [x] 2.7 backend: `SvgSanitizer` и `NotificationMessages.chatText`; проверка: `SvgSanitizerTest`, `NotificationMessagesTest`
