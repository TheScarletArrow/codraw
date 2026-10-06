# Развёртывание CoDraw на сервере

CoDraw разворачивается из готовых образов четырьмя контейнерами: `frontend` (nginx), `backend`, `collab`
и PostgreSQL. Наружу открыт один порт — порт приложения: nginx отдаёт приложение и с того же адреса передаёт API
в `backend`, а синхронизацию — в `collab`. TLS завершает прокси перед этим портом.

```
браузер ──https──▶ TLS-прокси ──http──▶ frontend :8080 ──/api/──▶ backend :8080 ──▶ PostgreSQL
                                                     └─/collab─▶ collab :1234 ──▶ backend (внутренний API)
```

## Что нужно

- Сервер с Docker и Docker Compose v2 (`docker compose version`), 2 ГБ памяти и больше.
- Домен, который указывает на сервер, например `codraw.example.com`.
- TLS-прокси: ниже — пример для [Caddy](https://caddyserver.com), который сам получает сертификат Let's Encrypt.
  Подойдёт любой прокси, который передаёт заголовки `Host` и `X-Forwarded-Proto`.

## Образы

CI публикует образы при каждом пуше в `main`:

- `ghcr.io/thescarletarrow/codraw-backend`
- `ghcr.io/thescarletarrow/codraw-collab`
- `ghcr.io/thescarletarrow/codraw-frontend`

с тегом полного хеша коммита, а когда прошли все проверки CI этого коммита, — и с тегом `latest`. Если пакеты
репозитория закрыты, войдите в реестр токеном с правом `read:packages`: `docker login ghcr.io`. Собрать образы
на самом сервере тоже можно: `docker compose -f docker-compose.prod.yml build`.

## 1. Переменные

Скопируйте из репозитория `docker-compose.prod.yml` и `.env.prod.example`, переименуйте пример в `.env.prod`
и заполните:

| Переменная | Обязательна | Что |
|---|---|---|
| `POSTGRES_PASSWORD` | да | пароль базы |
| `CODRAW_INTERNAL_TOKEN` | да | секрет внутреннего API между `collab` и `backend`, например `openssl rand -hex 32` |
| `CODRAW_COLLAB_TOKEN_SIGNING_KEY` | да | RSA-ключ подписи токенов синхронизации (PEM, PKCS#8) |
| `CODRAW_COLLAB_TOKEN_PREVIOUS_SIGNING_KEY` | нет | прежний ключ на время смены ключа |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | нет | OAuth-приложение GitHub |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | нет | OAuth-приложение Google |
| `CODRAW_HTTP_PORT` | нет | порт приложения на сервере, по умолчанию `8080` |
| `CODRAW_VERSION` | нет | тег образов, по умолчанию `latest` |
| `CODRAW_IMAGE_PREFIX` | нет | реестр и префикс имён образов, по умолчанию `ghcr.io/thescarletarrow/codraw-` |
| `CODRAW_LEGAL_OPERATOR`, `CODRAW_LEGAL_CONTACT_EMAIL` | перед открытым запуском | кто предоставляет сервис и куда писать о данных: их называют политика конфиденциальности (`/privacy`) и условия использования (`/terms`) |

Необязательные настройки, у которых есть значения по умолчанию:

| Переменная | По умолчанию | Что |
|---|---|---|
| `CODRAW_GUESTS_BOARD_RETENTION` | `30d` | доска гостя с истёкшим сеансом удаляется, если с ней столько никто не работал; затем удаляется гость без досок |
| `CODRAW_LIMITS_BOARDS_PER_USER` | `100` | больше досок пользователь не создаст; доски гостя, перешедшие при входе, не ограничиваются |
| `CODRAW_LIMITS_GUESTS_PER_ADDRESS_PER_HOUR` | `20` | новых гостей с одного адреса в час; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_CLIENT_ERRORS_PER_ADDRESS_PER_MINUTE` | `30` | отчётов об ошибках браузеров с одного адреса в минуту; сверх них — 429; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_COMMENTS_PER_BOARD` | `5000` | больше комментариев на доске, во всех ветках вместе, не сохранится; сверх — 409 |
| `CODRAW_LIMITS_MEMBERS_PER_BOARD` | `100` | больше участников у доски, кроме владельца, не будет: приглашение и «Добавить» сверх — 409 |
| `CODRAW_LIMITS_INVITES_PER_BOARD` | `20` | больше действующих ссылок-приглашений у доски не будет; отозванные не считаются; сверх — 409 |
| `CODRAW_LIMITS_EMBED_SIZE` | `2MB` | больше не примет живая картинка доски (SVG из браузеров участников); сверх — 413 |
| `DOCUMENT_SIZE_LIMIT_BYTES` | `16777216` | до скольких байт `collab` даёт расти документу доски; у предела проходят только удаления |
| `CODRAW_LIMITS_DOCUMENT_SIZE` | `32MB` | больше `backend` не сохранит состояние документа и версию; держите выше предела `collab`, а при росте — поднимите и `client_max_body_size` nginx |
| `CODRAW_LIMITS_VERSIONS_SIZE_PER_BOARD` | `64MB` | сколько занимают версии одной доски вместе; старые удаляются, новейшая остаётся всегда |

Политика конфиденциальности и условия использования — шаблоны, которые описывают, что делает CoDraw: какие данные и
cookie, сроки хранения этой установки, получателей. Оператор в них — из `CODRAW_LEGAL_OPERATOR` и
`CODRAW_LEGAL_CONTACT_EMAIL`; без них страницы говорят, что оператор не указал свои данные. Перед открытым запуском
задайте их и покажите тексты своему юристу. Ссылка на политику нужна и Google, чтобы перевести OAuth-приложение из
режима Testing.

Без обязательной переменной Docker Compose не запустит стек и назовёт её. Без OAuth-приложений работает только вход
гостем: кнопки «Войти через GitHub» и «Войти через Google» ведут на ошибку провайдера.

Ключ подписи:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out collab-signing-key.pem
```

Его содержимое целиком, с переносами строк, — значение `CODRAW_COLLAB_TOKEN_SIGNING_KEY` в двойных кавычках
в `.env.prod` или в окружении команды: `CODRAW_COLLAB_TOKEN_SIGNING_KEY="$(cat collab-signing-key.pem)"`.

## 2. OAuth

Создайте OAuth-приложения GitHub и Google, как описано в README («Вход через GitHub и Google»), с адресами возврата
`https://codraw.example.com/api/login/oauth2/code/github` и `https://codraw.example.com/api/login/oauth2/code/google`.
`backend` строит эти адреса по схеме и домену, которые передаёт прокси, поэтому за TLS-прокси они получаются
с `https`.

## 3. Запуск

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

`--wait` ждёт, пока все контейнеры станут `healthy`: PostgreSQL, затем `backend` (миграции базы применяются при
его старте), затем `collab` и `frontend`. Приложение отвечает на `http://<сервер>:8080`.

## 4. TLS-прокси

Пример `Caddyfile` для Caddy на том же сервере:

```
codraw.example.com {
    reverse_proxy localhost:8080
}
```

Caddy получает сертификат, передаёт `Host` и `X-Forwarded-Proto` и проксирует WebSocket без дополнительных настроек.
Другому прокси нужно то же: исходный `Host`, `X-Forwarded-Proto: https`, поддержка WebSocket (`Upgrade`)
и таймаут чтения не меньше часа для `/collab`. Прокси на порту, отличном от 443, должен передавать и
`X-Forwarded-Port`, иначе адрес возврата OAuth получит порт 443. Закройте порт приложения от внешнего мира, если прокси на том же
сервере, например опубликуйте его только на localhost: `CODRAW_HTTP_PORT=127.0.0.1:8080`.

## Обновление и откат

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
```

Контейнеры пересоздаются, данные остаются в томе `codraw-prod_postgres-data`. Подключённые участники видят «Нет
связи» на время перезапуска и переподключаются сами. Для отката задайте `CODRAW_VERSION` с хешем предыдущего коммита
и выполните `up -d --wait`. Откат на версию до изменения схемы базы требует отката миграций — U-скриптов в
`backend/src/main/resources/db/migration`.

## Мониторинг и журналы

**Метрики** в формате Prometheus открыты без входа только внутри сети стека: по адресу приложения их нет.

| Где | Что |
|---|---|
| `backend:8080/actuator/prometheus` | HTTP-запросы (`http_server_requests_seconds_*`), JVM, пул соединений с базой (`hikaricp_*`); созданные доски и гости (`codraw_board_creations_total`, `codraw_guest_creations_total`), размеры сохранённых документов (`codraw_documents_stored_bytes_*`), сработавшие пределы (`codraw_limits_reached_total{limit}`), удалённое уборкой гостей (`codraw_guests_cleanup_deleted_total{kind}`), ошибки браузеров участников (`codraw_client_errors_total{kind}`: `error`, `unhandledrejection`, `render`) |
| `collab:1234/metrics` | подключения (`codraw_collab_connections`), открытые доски (`codraw_collab_documents`), сохранения документов по результату и их время (`codraw_collab_stores_total{result}`, `codraw_collab_store_duration_seconds`), отказы по причинам (`codraw_collab_rejections_total{reason}`), метрики процесса Node.js |

**Prometheus** поднимается вместе со стеком с профилем `monitoring`. Положите рядом с `docker-compose.prod.yml`
каталог `deploy/prometheus` из репозитория:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile monitoring up -d --wait
```

Prometheus слушает `127.0.0.1:9090` сервера (порт — `CODRAW_PROMETHEUS_PORT`): входа у него нет, поэтому
открывайте его через SSH-туннель (`ssh -L 9090:127.0.0.1:9090 сервер`) или прокси со входом. В
`deploy/prometheus/alerts.yml` — правила оповещений:

| Правило | Когда |
|---|---|
| `CodrawServiceDown` | `backend` или `collab` не отвечает Prometheus 2 минуты |
| `CodrawBackendErrors` | больше 5% ответов `backend` — ошибки 5xx, 10 минут |
| `CodrawDocumentStoreFailures` | `collab` не смог сохранить документ доски хотя бы раз за 10 минут |
| `CodrawDatabaseConnectionsPending` | запросы `backend` 5 минут ждут соединений с базой |
| `CodrawClientErrors` | больше 20 ошибок в браузерах участников за 10 минут |

Prometheus показывает сработавшие правила на странице Alerts. Чтобы получать оповещения, подключите Alertmanager
(`alerting` в `deploy/prometheus/prometheus.yml`) или внешний мониторинг, который читает те же метрики. Проверить
правила после правки: `promtool test rules deploy/prometheus/alerts.test.yml`.

**Журналы** `backend` и `collab` в этом стеке — JSON по строке на событие в формате ECS (`@timestamp`, `log.level`,
`message`, `error.*`): их разбирает любой сборщик журналов. Читать их глазами удобнее так:
`docker compose -f docker-compose.prod.yml logs backend | jq -r '.message'`.

**Ошибки браузеров.** Приложение отправляет необработанные ошибки страниц и ошибки отрисовки в `backend`
(`POST /api/client-errors`), и они попадают в его журнал строками уровня `WARN` с полями `client.error.kind`,
`error.message`, `error.stack_trace`, `url.path` (путь страницы без параметров), `user_agent.original` и `user.id`, если
участник вошёл; содержимого досок в отчётах нет. Найти их: `docker compose -f docker-compose.prod.yml logs backend | jq
'select(.client.error.kind)'`. Одна и та же ошибка отправляется один раз за загрузку страницы, всего — не больше 10. Чтобы вернуть обычный текст, уберите
`LOGGING_STRUCTURED_FORMAT_CONSOLE` у `backend` и задайте `LOG_FORMAT: text` у `collab`.

## Резервные копии

Всё состояние — в PostgreSQL: доски, документы, пользователи, сеансы.

```bash
# копия
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U codraw -d codraw --format=custom > codraw-$(date +%F).dump

# восстановление в пустую базу
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_restore -U codraw -d codraw --clean --if-exists < codraw-2026-10-05.dump
```

Делайте копию по расписанию (cron) и храните её вне сервера.

## Что проверяет CI

Задача `images` проверяет конфигурацию и правила Prometheus (`promtool`), собирает три образа, поднимает из них
этот же `docker-compose.prod.yml` с профилем `monitoring`, ждёт, пока Prometheus увидит `backend` и `collab`, и в
браузере проверяет через nginx совместную работу двух гостей, заголовки безопасности, кеширование и закрытость
внутреннего API и метрик (`pnpm --filter @codraw/e2e test:stack`). Тот же тест можно запустить против своего стека:
`STACK_URL=https://codraw.example.com pnpm --filter @codraw/e2e test:stack`.
