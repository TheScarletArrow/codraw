# Tasks

## 1. backend

- [ ] 1.1 backend: `AddressRateLimiter` и `ClientErrorLimiter` (`codraw.limits.client-errors-per-address-per-minute`); проверка: unit-тест окна и ожидания
- [ ] 1.2 backend: `codraw.client.errors{kind}` и `Limit.CLIENT_ERRORS` в `CodrawMetrics`; проверка: тест метрик
- [ ] 1.3 backend: `POST /api/client-errors` без входа с CSRF, проверка полей, журнал с парами ключ-значение, 429; проверка: интеграционные тесты — 204 без входа, `user.id` с входом, 400, 403 без CSRF, 429 с `Retry-After`, поля строки ECS

## 2. frontend

- [ ] 2.1 frontend: `errors/reporting.ts` — нормализация, обрезка, повторы, предел 10, путь без параметров, чужие источники, отправка без новых ошибок; проверка: unit-тесты
- [ ] 2.2 frontend: обработчики окна и корня React в `main.tsx`, `AppError` в `errorElement` корневых маршрутов; проверка: компонентный тест экрана ошибки

## 3. Мониторинг, проверка и документация

- [ ] 3.1 deploy: правило `CodrawClientErrors` и его тест; переменная предела в `docker-compose.prod.yml`; проверка: `promtool test rules` в CI
- [ ] 3.2 e2e: ошибка на странице доски доходит до `backend` с путём без параметров, повтор не отправляется; проверка: job e2e зелёный в CI
- [ ] 3.3 Описать отчёты в `docs/deploy.md` (метрика, правило, поля журнала, предел) и README, отметить изменение в «Плане работ»; проверка: документация описывает поля журнала и предел
