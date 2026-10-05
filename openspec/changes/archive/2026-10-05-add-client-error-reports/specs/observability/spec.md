# Spec Delta

## MODIFIED Requirements

### Requirement: Метрики backend

`backend` SHALL отдавать метрики в формате Prometheus на `/actuator/prometheus` без входа: HTTP-запросы, JVM, пул
соединений с базой, а также число созданных досок и гостей, размеры сохранённых документов, сработавшие пределы,
удалённое уборкой гостей и ошибки браузеров участников по видам.

#### Scenario: Prometheus читает метрики backend

- **WHEN** Prometheus запрашивает `/actuator/prometheus` у `backend` в сети стека
- **THEN** ответ имеет статус 200 и содержит `http_server_requests_seconds_count` и `codraw_board_creations_total`

#### Scenario: Предел в метриках

- **WHEN** пользователь упирается в предел числа досок
- **THEN** `codraw_limits_reached_total{limit="boards"}` увеличивается на 1

#### Scenario: Ошибки браузеров в метриках

- **WHEN** Prometheus запрашивает метрики `backend`, и ни одной ошибки браузеров ещё не было
- **THEN** ответ содержит `codraw_client_errors_total` для видов `error`, `unhandledrejection` и `render` со значением 0

### Requirement: Мониторинг стека

`docker-compose.prod.yml` SHALL поднимать с профилем `monitoring` Prometheus, который собирает метрики `backend` и
`collab` и проверяет правила оповещений: сервис недоступен, доля ответов 5xx `backend` больше 5%, неудачные
сохранения документов, ожидание соединений с базой, больше 20 ошибок браузеров участников за 10 минут. Без профиля
стек SHALL оставаться прежним.

#### Scenario: Стек с мониторингом

- **WHEN** администратор поднимает стек с `--profile monitoring`
- **THEN** Prometheus на `127.0.0.1:9090` сервера показывает цели `backend` и `collab` в состоянии `up` и правила
  оповещений

#### Scenario: Много ошибок браузеров

- **WHEN** за 10 минут `backend` получил 25 отчётов об ошибках браузеров
- **THEN** срабатывает правило `CodrawClientErrors`
