# observability Specification

## Purpose
Позволяет тем, кто развернул CoDraw, видеть нагрузку, ошибки и работу пределов по метрикам и журналам и узнавать о
поломке раньше пользователей.

## Requirements

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

### Requirement: Метрики collab

`collab` SHALL отдавать метрики в формате Prometheus на `/metrics`: число подключений и открытых документов,
сохранения документов по результату и их длительность, отказы в подключении и правках по причинам, метрики процесса.

#### Scenario: Подключения в метриках

- **WHEN** к доске подключены два участника, и Prometheus запрашивает `/metrics` у `collab`
- **THEN** `codraw_collab_connections` равно 2, а `codraw_collab_documents` — 1

#### Scenario: Отказ в метриках

- **WHEN** `collab` отклоняет правку, с которой документ превысит предел
- **THEN** `codraw_collab_rejections_total{reason="document-too-large"}` увеличивается на 1

### Requirement: Метрики не видны снаружи

Метрики `backend` и `collab` SHALL быть недоступны по адресу приложения.

#### Scenario: Запрос метрик снаружи

- **WHEN** клиент запрашивает `/actuator/prometheus` или `/metrics` по адресу приложения
- **THEN** ответ имеет статус 404 или отдаёт страницу приложения, но не метрики

### Requirement: Структурированные журналы

В стеке `docker-compose.prod.yml` `backend` и `collab` SHALL писать журнал строками JSON с временем, уровнем и
сообщением, а ошибки — с типом, сообщением и стеком.

#### Scenario: Ошибка сохранения в журнале collab

- **WHEN** `collab` не смог сохранить документ, потому что `backend` недоступен
- **THEN** в журнале `collab` — строка JSON с `log.level` `error`, сообщением с идентификатором доски и
  `error.message`

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
