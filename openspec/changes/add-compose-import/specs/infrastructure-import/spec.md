# Spec Delta

## Purpose

Превращает описания инфраструктуры — файлы docker-compose — в схему контейнеров, их связей и сетей доски, которую
можно править вместе.

## ADDED Requirements

### Requirement: Импорт docker-compose

Меню «SQL и Mermaid» SHALL предлагать участнику, который правит доску, «Импорт docker-compose…»: поле для текста,
«Открыть файлы» для одного или нескольких файлов `.yaml` и `.yml`, галочки «Связи по переменным окружения»
(включена) и «Фигуры C4» (выключена) и «Добавить на страницу». Файлы в порядке выбора, а за ними текст поля SHALL
сливаться в один проект, как `docker compose -f a.yml -f b.yml`: сервис с тем же именем из следующего файла SHALL
заменять образ, сборку и `network_mode` и добавлять зависимости, ссылки, сети, порты и переменные окружения (переменная с
тем же именем — заменять). Перед добавлением участник SHALL видеть сводку «Сервисов: N, связей: N, сетей: N», которая
считает ровно то, что будет добавлено, и ошибку каждого файла, который не будет добавлен. «Добавить на страницу» SHALL
ставить схему справа от фигур страницы, разложенную автораскладкой слева направо по связям, одним шагом отмены у всех
участников, и SHALL быть недоступно, пока нет ни одного сервиса или разбор не закончен. Участнику в режиме «Просмотр»
пункт SHALL не показываться.

#### Scenario: Файл CoDraw

- **WHEN** участник открывает в «Импорт docker-compose…» файл с сервисами `postgres` (`image: postgres:18-alpine`),
  `backend` (`build: ./backend`, `depends_on: [postgres]`) и `frontend` (`depends_on: [backend]`, `ports:
  ["8080:80"]`) и нажимает «Добавить на страницу»
- **THEN** справа от схемы страницы появляются «База данных» `postgres` и «Контейнеры» `backend` и `frontend`, связи
  от `backend` к `postgres` и от `frontend` к `backend`, второй участник видит то же, а `Ctrl+Z` убирает их все

#### Scenario: Сводка

- **WHEN** участник вставляет в поле текст того же файла
- **THEN** он видит «Сервисов: 3, связей: 2, сетей: 0»

#### Scenario: Два файла

- **WHEN** участник открывает `docker-compose.yml`, где у сервиса `backend` `image: app:1`, и `docker-compose.prod.yml`,
  где у `backend` `image: app:2` и `depends_on: [redis]`, и сервис `redis`
- **THEN** сводка называет 2 сервиса и 1 связь, а подпись `backend` называет образ `app:2`

#### Scenario: Только просмотр

- **WHEN** участник в режиме «Просмотр» открывает меню «SQL и Mermaid»
- **THEN** пункта «Импорт docker-compose…» в меню нет

### Requirement: Сервисы docker-compose

Каждый сервис SHALL становиться одной фигурой палитры, выбранной по образу: по словам его имени без реестра, тега и
дайджеста — «База данных» для PostgreSQL, PostGIS, TimescaleDB, MySQL, MariaDB, MongoDB, SQL Server, Oracle,
CockroachDB, Cassandra, ScyllaDB, CouchDB и Neo4j; «Кэш» для Redis, Valkey, KeyDB, Dragonfly и Memcached; «Очередь»
для RabbitMQ, ActiveMQ, NATS и Mosquitto; «Топик событий» для Kafka, Redpanda и Pulsar; «Балансировщик нагрузки» для
nginx, HAProxy, Traefik, Envoy и Caddy; «API-шлюз» для Kong, KrakenD, Tyk и APISIX; «Хранилище объектов» для MinIO,
RustFS, SeaweedFS и Azurite; «Поисковый индекс» для Elasticsearch, OpenSearch, Solr, Meilisearch и Typesense;
«Хранилище данных» для ClickHouse и Druid. Образ, в имени которого есть слово инструмента при сервисе (`ui`,
`exporter`, `admin`, `commander`, `express`, `console`, `dashboard`), и сервис без образа или с другим образом SHALL
становиться «Контейнером». Подпись фигуры SHALL состоять из строк: имя сервиса; образ, а без него — каталог сборки
(`build: ./backend`) или файл Dockerfile сборки (`build: collab/Dockerfile`); опубликованные порты (`:8080, :8443`), если
они есть. Фигура SHALL вмещать подпись, а подпись фигур с подписью под фигурой («Хранилище объектов», «Топик событий»)
SHALL не налезать на соседние фигуры. С галочкой «Фигуры C4» сервис SHALL становиться Database C4 вместо «Базы данных»
и Container C4 вместо остальных фигур с подписью из имени, строки `[Container: образ]` и портов.

#### Scenario: Фигуры по образам

- **WHEN** импортированы сервисы с образами `bitnami/postgresql:16`, `redis/redis-stack:7`,
  `confluentinc/cp-kafka:7.6.0`, `provectuslabs/kafka-ui` и `rustfs/rustfs:1.0.1`
- **THEN** на странице «База данных», «Кэш», «Топик событий», «Контейнер» и «Хранилище объектов»

#### Scenario: Подпись

- **WHEN** у сервиса `prometheus` образ `prom/prometheus:v3.15.0` и порт `"127.0.0.1:9090:9090"`
- **THEN** подпись «Контейнера» — «prometheus», «prom/prometheus:v3.15.0» и «:9090» по строкам

#### Scenario: Фигуры C4

- **WHEN** участник включает «Фигуры C4» и импортирует `postgres` с образом `postgres:18-alpine` и `backend` со сборкой
  `./backend`
- **THEN** на странице Database C4 «postgres», «[Container: postgres:18-alpine]» и Container C4 «backend»,
  «[Container: ./backend]»

### Requirement: Связи docker-compose

Сервис из `depends_on` (списком или словарём), из `links` (имя до двоеточия) и из `network_mode: service:имя` SHALL
давать одну связь от зависимого сервиса к сервису, от которого он зависит. С галочкой «Связи по переменным окружения»
значение переменной окружения сервиса SHALL давать связь к другому сервису, имя, `container_name`, `hostname` или
псевдоним в сети которого стоит в значении адресом: после `схема://` (и `пользователь@`), перед `:порт` или всем
значением. Такая связь SHALL быть подписана протоколом из схемы адреса — `HTTP`, `HTTPS`, `WebSocket`, `gRPC`, `JDBC` для
`jdbc:…`, `PostgreSQL`, `MySQL`, `MongoDB`, `Redis`, `AMQP`, `Kafka`, `NATS`, `MQTT`, иначе самой схемой; адрес без схемы
SHALL давать связь без подписи. Между двумя сервисами в одну сторону SHALL быть одна связь с подписями всех её
протоколов через запятую. Ссылки на себя и на сервисы, которых нет в проекте, SHALL не давать связей.

#### Scenario: Адрес в переменной

- **WHEN** у `backend` `depends_on: [postgres]` и `SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/codraw`, а у
  `collab` `BACKEND_URL: http://backend:8080`
- **THEN** от `backend` к `postgres` одна связь с подписью «JDBC», а от `collab` к `backend` — связь «HTTP»

#### Scenario: Без связей по переменным

- **WHEN** участник снимает «Связи по переменным окружения» для того же файла
- **THEN** от `backend` к `postgres` связь без подписи, а от `collab` к `backend` связи нет

#### Scenario: Список брокеров

- **WHEN** у `orders` переменная `KAFKA_BOOTSTRAP_SERVERS: kafka:9092`
- **THEN** от `orders` к `kafka` идёт связь без подписи

### Requirement: Сети docker-compose

Если сервисы проекта в двух сетях и больше, каждая сеть, в которой есть сервис, SHALL становиться рамкой «Граница» с
именем сети вокруг своих сервисов; сервис без сетей SHALL быть в сети `default`, а сервис в нескольких сетях — в рамке
первой из них. Если все сервисы в одной сети, рамок SHALL не быть, и сводка SHALL называть 0 сетей.

#### Scenario: Две сети

- **WHEN** `frontend` в сетях `public` и `internal`, `backend` — в `internal`, а `postgres` — без сетей
- **THEN** на странице рамки `public` вокруг `frontend`, `internal` вокруг `backend` и `default` вокруг `postgres`, и
  сводка называет 3 сети

### Requirement: Ошибки, переменные и пределы docker-compose

Ошибка синтаксиса YAML SHALL называть файл, строку и столбец; документ без раздела `services` SHALL давать ошибку, что
это не docker-compose; остальные файлы SHALL можно добавить. Значение `${ИМЯ:-по умолчанию}` и `${ИМЯ-по умолчанию}` в
образе, портах и переменных SHALL заменяться значением по умолчанию, а `${ИМЯ}`, `$ИМЯ` и `${ИМЯ:?…}` SHALL оставаться
`${ИМЯ}`. Файл больше 5 МБ SHALL отклоняться. Если в проекте больше 300 сервисов, участник SHALL видеть, сколько их, и
SHALL NOT добавлять схему. Файлы SHALL разбираться в браузере и никуда не отправляться.

#### Scenario: Значение по умолчанию

- **WHEN** у сервиса `frontend` порт `"${CODRAW_HTTP_PORT:-8080}:8080"` и образ `${PREFIX}frontend:${TAG:-latest}`
- **THEN** подпись — «frontend», «${PREFIX}frontend:latest» и «:8080»

#### Scenario: Не docker-compose

- **WHEN** участник открывает файл `openapi.yaml` без раздела `services`
- **THEN** участник видит «openapi.yaml: это не docker-compose — нет раздела services»

#### Scenario: Ошибка YAML

- **WHEN** в третьей строке `docker-compose.yml` отступ ключа под сервисом не совпадает с соседними
- **THEN** участник видит «docker-compose.yml: строка 3, столбец …» с причиной
