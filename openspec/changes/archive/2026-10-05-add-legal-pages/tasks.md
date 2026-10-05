# Tasks

## 1. backend

- [x] 1.1 backend: `LegalProperties` (`codraw.legal.operator`, `codraw.legal.contact-email`) и `GET /api/legal` без входа; проверка: интеграционный тест — заданные и пустые значения без сеанса

## 2. frontend

- [x] 2.1 frontend: `legal/` — общая вёрстка, тексты политики и условий с оператором, маршруты `/privacy` и `/terms` вне `Layout`; проверка: компонентные тесты страниц с заданным и пустым оператором
- [x] 2.2 frontend: строка согласия на `LoginPage` и ссылки внизу `BoardsPage`; проверка: компонентные тесты

## 3. Развёртывание, проверка и документация

- [x] 3.1 deploy: `CODRAW_LEGAL_OPERATOR` и `CODRAW_LEGAL_CONTACT_EMAIL` в `docker-compose.prod.yml` и `.env.prod.example`, раздел в `docs/deploy.md`; проверка: документация называет переменные и требует задать их перед запуском
- [x] 3.2 e2e: ссылки со страницы входа открывают обе страницы без входа, оператор из настроек на странице; проверка: job e2e зелёный в CI
- [x] 3.3 README: раздел о персональных данных и «План работ»; проверка: README ссылается на страницы
