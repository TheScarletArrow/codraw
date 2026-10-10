# Развёртывание CoDraw на сервере

CoDraw разворачивается из готовых образов шестью контейнерами: `frontend` (nginx), `backend`, `collab`, PostgreSQL,
`s3` — S3-совместимое хранилище картинок досок RustFS ([ADR-0006](adr/0006-image-storage.md)) — и `backup`, который
снимает резервные копии по расписанию (см. «Резервные копии»). Наружу открыт один
порт — порт приложения: nginx отдаёт приложение и с того же адреса передаёт API в `backend`, а синхронизацию — в
`collab`. Картинки браузеры получают через `backend`, хранилище снаружи недоступно. TLS завершает прокси перед этим
портом.

```
браузер ──https──▶ TLS-прокси ──http──▶ frontend :8080 ──/api/──▶ backend :8080 ──▶ PostgreSQL
                                                     │                        └──▶ s3 :9000 (картинки досок)
                                                     └─/collab─▶ collab :1234 ──▶ backend (внутренний API)
backup ──по расписанию──▶ PostgreSQL, s3 ──▶ том backups и хранилище копий вне сервера
```

## Что нужно

- Сервер с Docker и Docker Compose v2 (`docker compose version`), 2 ГБ памяти и больше; сколько процессора и памяти
  нужно под ваше число досок — в разделе «Ресурсы» ниже.
- Домен, который указывает на сервер, например `codraw.example.com`.
- TLS-прокси: ниже — пример для [Caddy](https://caddyserver.com), который сам получает сертификат Let's Encrypt.
  Подойдёт любой прокси, который передаёт заголовки `Host` и `X-Forwarded-Proto`.

## Образы

CI публикует образы при каждом пуше в `main`:

- `ghcr.io/thescarletarrow/codraw-backend`
- `ghcr.io/thescarletarrow/codraw-collab`
- `ghcr.io/thescarletarrow/codraw-frontend`
- `ghcr.io/thescarletarrow/codraw-backup`

с тегом полного хеша коммита, а когда прошли все проверки CI этого коммита, — и с тегом `latest`. Если пакеты
репозитория закрыты, войдите в реестр токеном с правом `read:packages`: `docker login ghcr.io`. Собрать образы
на самом сервере тоже можно: `docker compose -f docker-compose.prod.yml build`.

## 1. Переменные

Скопируйте из репозитория `docker-compose.prod.yml` и `.env.prod.example`, переименуйте пример в `.env.prod`
и заполните:

| Переменная | Обязательна | Что |
|---|---|---|
| `POSTGRES_PASSWORD` | да | пароль базы |
| `CODRAW_S3_SECRET_KEY` | да | секретный ключ хранилища изображений, не короче 8 символов, например `openssl rand -hex 32` |
| `CODRAW_S3_ACCESS_KEY` | нет | ключ доступа хранилища изображений, по умолчанию `codraw` |
| `CODRAW_INTERNAL_TOKEN` | да | секрет внутреннего API между `collab` и `backend`, например `openssl rand -hex 32` |
| `CODRAW_COLLAB_TOKEN_SIGNING_KEY` | да | RSA-ключ подписи токенов синхронизации (PEM, PKCS#8) |
| `CODRAW_COLLAB_TOKEN_PREVIOUS_SIGNING_KEY` | нет | прежний ключ на время смены ключа |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | нет | OAuth-приложение GitHub |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | нет | OAuth-приложение Google |
| `CODRAW_OIDC_ISSUER_URI`, `CODRAW_OIDC_CLIENT_ID`, `CODRAW_OIDC_CLIENT_SECRET`, `CODRAW_OIDC_NAME` | нет | корпоративный провайдер входа OpenID Connect (Keycloak, Entra ID, Okta): issuer, клиент и название на кнопке «Войти через …», см. «Корпоративный вход» ниже |
| `CODRAW_HTTP_PORT` | нет | порт приложения на сервере, по умолчанию `8080` |
| `CODRAW_VERSION` | нет | тег образов, по умолчанию `latest` |
| `CODRAW_IMAGE_PREFIX` | нет | реестр и префикс имён образов, по умолчанию `ghcr.io/thescarletarrow/codraw-` |
| `CODRAW_LEGAL_OPERATOR`, `CODRAW_LEGAL_CONTACT_EMAIL` | перед открытым запуском | кто предоставляет сервис и куда писать о данных: их называют политика конфиденциальности (`/privacy`) и условия использования (`/terms`) |
| `CODRAW_APP_URL` | для уведомлений вне CoDraw | адрес приложения, например `https://codraw.example.com`: на него ведут ссылки писем и сообщений чатов; без него почта и чаты выключены, см. «Уведомления на почту и в чат» ниже |
| `CODRAW_SMTP_HOST`, `CODRAW_SMTP_PORT`, `CODRAW_SMTP_USERNAME`, `CODRAW_SMTP_PASSWORD`, `CODRAW_MAIL_FROM` | для писем | SMTP-сервер и отправитель писем об уведомлениях; без хоста писем нет |

Необязательные настройки, у которых есть значения по умолчанию:

| Переменная | По умолчанию | Что |
|---|---|---|
| `CODRAW_GUESTS_ENABLED` | `true` | «Продолжить без входа»; `false` — гостей нет, `POST /api/guest` отвечает 403, а прежние гости доживают свой срок |
| `CODRAW_OIDC_SCOPES` | `openid,profile,email` | scope корпоративного провайдера; `openid` добавляется сам |
| `CODRAW_OIDC_ALLOWED_EMAIL_DOMAINS` | пусто | домены почты через запятую, с которыми корпоративный провайдер пускает в CoDraw; пусто — всех его пользователей |
| `CODRAW_OIDC_ALLOWED_GROUPS` | пусто | группы через запятую, хотя бы в одной из которых должен быть пользователь; пусто — без проверки групп |
| `CODRAW_OIDC_GROUPS_CLAIM` | `groups` | claim, в котором провайдер перечисляет группы пользователя |
| `CODRAW_OIDC_LOGOUT` | `false` | `true` — «Выйти» завершает и сеанс у провайдера (RP-initiated logout) |
| `CODRAW_GUESTS_BOARD_RETENTION` | `30d` | доска гостя с истёкшим сеансом удаляется, если с ней столько никто не работал; затем удаляется гость без досок |
| `CODRAW_LIMITS_BOARDS_PER_USER` | `100` | больше досок пользователь не создаст; доски гостя, перешедшие при входе, не ограничиваются |
| `CODRAW_LIMITS_GUESTS_PER_ADDRESS_PER_HOUR` | `20` | новых гостей с одного адреса в час; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_CLIENT_ERRORS_PER_ADDRESS_PER_MINUTE` | `30` | отчётов об ошибках браузеров с одного адреса в минуту; сверх них — 429; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_COMMENTS_PER_BOARD` | `5000` | больше комментариев на доске, во всех ветках вместе, не сохранится; сверх — 409 |
| `CODRAW_LIMITS_DECISIONS_PER_BOARD` | `500` | больше архитектурных решений на доске не будет: новое и импорт сверх — 409 |
| `CODRAW_LIMITS_ISSUE_LINKS_PER_BOARD` | `1000` | больше задач GitHub, привязанных к элементам и веткам одной доски, не будет; сверх — 409 |
| `CODRAW_LIMITS_MEMBERS_PER_BOARD` | `100` | больше участников у доски, кроме владельца, не будет: приглашение и «Добавить» сверх — 409 |
| `CODRAW_LIMITS_INVITES_PER_BOARD` | `20` | больше действующих ссылок-приглашений у доски не будет; отозванные не считаются; сверх — 409 |
| `CODRAW_LIMITS_ACCESS_REQUESTS_PER_BOARD` | `50` | больше запросов доступа, которые ждут ответа владельца, у доски не будет; замена своего запроса не считается; сверх — 409 |
| `CODRAW_LIMITS_NOTIFICATIONS_PER_USER` | `200` | сколько последних уведомлений хранится у пользователя; более старые удаляются, когда приходят новые |
| `CODRAW_LIMITS_PROPOSALS_PER_BOARD` | `20` | больше открытых предложений изменений у доски не будет; принятые, отклонённые и отозванные не считаются; сверх — 409 |
| `CODRAW_LIMITS_PROPOSALS_PER_AUTHOR` | `3` | больше открытых предложений у одного автора на одной доске не будет; сверх — 409 |
| `CODRAW_LIMITS_CLOSED_PROPOSALS_PER_BOARD` | `20` | сколько последних закрытых предложений хранит доска вместе с их черновиками; более старые удаляются, когда закрывается следующее |
| `CODRAW_LIMITS_TAGS_PER_BOARD` | `10` | больше личных тегов одного пользователя у доски не будет; сверх — 409 |
| `CODRAW_LIMITS_TAGS_PER_USER` | `50` | больше разных личных тегов на всех досках у пользователя не будет; теги гостя, перешедшие при входе, не ограничиваются; сверх — 409 |
| `CODRAW_LIMITS_FOLDERS_PER_USER` | `50` | больше личных папок досок у пользователя не будет; папки гостя, перешедшие при входе, не ограничиваются; сверх — 409 |
| `CODRAW_NOTIFICATIONS_RETENTION` | `90d` | уведомление удаляется, когда ему столько, прочитанное или нет; уборка идёт раз в час |
| `CODRAW_NOTIFICATIONS_REVIEW_REQUEST_INTERVAL` | `10m` | владелец доски получает не больше одного уведомления о просьбе посмотреть элемент («Нужно ревью») за это время, от кого бы ни была просьба |
| `CODRAW_LIMITS_REVIEW_REQUESTS_PER_HOUR` | `30` | сколько уведомлений о просьбах о ревью дают владельцам досок просьбы одного пользователя за час; сверх — 429, статус элемента при этом ставится |
| `CODRAW_LIMITS_EMBED_SIZE` | `2MB` | больше не примет живая картинка доски (SVG из браузеров участников); сверх — 413 |
| `DOCUMENT_SIZE_LIMIT_BYTES` | `16777216` | до скольких байт `collab` даёт расти документу доски и черновику предложения; у предела проходят только удаления |
| `CODRAW_LIMITS_DOCUMENT_SIZE` | `32MB` | больше `backend` не сохранит состояние документа, черновика предложения и версию; держите выше предела `collab`, а при росте — поднимите и `client_max_body_size` nginx |
| `CODRAW_COLLAB_BROADCAST_DELAY_MS` | `0` | сколько миллисекунд `collab` копит правки и курсоры доски, прежде чем разослать их участникам одним сообщением; 0 — сразу. 20–30 вдвое снижают процессор `collab` на досках с десятками участников ценой такой задержки каждой правки, см. [нагрузочные тесты](load-testing.md) |
| `CODRAW_LIMITS_VERSIONS_SIZE_PER_BOARD` | `64MB` | сколько занимают версии одной доски вместе; сверх этого удаляются старые версии — сначала без названия, затем с названием, — а новейшая остаётся всегда |
| `CODRAW_LIMITS_IMAGE_SIZE` | `10MB` | больше файл картинки на доску не примут (браузер проверяет до загрузки, `backend` — 413); держите ниже 32 МБ, которые пропускает nginx |
| `CODRAW_LIMITS_IMAGES_SIZE_PER_BOARD` | `100MB` | сколько занимают картинки одной доски вместе, одинаковый файл — один раз; сверх — 409. Картинки хранятся, пока жива доска, даже убранные с неё: их показывают версии и предложения |
| `CODRAW_IMAGES_S3_ENDPOINT` | `http://s3:9000` | адрес S3-совместимого хранилища изображений; другой — например, облачного S3 — вместо сервиса `s3` |
| `CODRAW_IMAGES_S3_REGION` | `us-east-1` | регион хранилища |
| `CODRAW_IMAGES_S3_BUCKET` | `codraw-images` | бакет картинок; `backend` создаёт его, если его нет |
| `CODRAW_ISSUES_GITHUB_API_URL` | `https://api.github.com` | API GitHub, через которое пользователи привязывают и создают задачи; для GitHub Enterprise Server — `https://github.example.com/api/v3`; пусто — задачи выключены, см. «Задачи GitHub» ниже |
| `CODRAW_ISSUES_GITHUB_WEBHOOK_SECRET` | пусто | секрет вебхука задач GitHub, который сразу приносит их изменения; пусто — вебхук выключен |
| `CODRAW_SCHEMA_IMPORT_ALLOWED_HOSTS` | пусто | базы PostgreSQL, схему которых пользователи могут загрузить через `backend` («Подключиться к базе…» в «Импорт SQL»): имена хостов, адреса и сети CIDR через запятую; пусто — функция выключена, см. «Схема из живой базы» ниже |
| `CODRAW_LIMITS_SCHEMA_IMPORTS_PER_USER_PER_HOUR` | `30` | попыток загрузить схему из базы у одного пользователя в час, неудачные тоже; сверх — 429; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_EXPORTS_PER_USER_PER_DAY` | `5` | выгрузок «Скачать мои данные» у одного пользователя в сутки; сверх — 429; счётчик — в памяти `backend` |
| `CODRAW_LIMITS_LIBRARIES_PER_USER` | `20` | больше личных библиотек фигур у пользователя не будет; библиотеки гостя, перешедшие при входе, не ограничиваются; сверх — 409 |
| `CODRAW_LIMITS_COMPONENTS_PER_LIBRARY` | `200` | больше компонентов в одной библиотеке не будет; сверх — 409 |
| `CODRAW_LIMITS_LIBRARY_COMPONENT_SIZE` | `4MB` | больше компонент библиотеки — схема с картинками внутри и образцом — не сохранится; сверх — 413; держите ниже 32 МБ, которые пропускает nginx |
| `CODRAW_LIMITS_LIBRARY_IMAGE_SIZE` | `2MB` | больше картинка или SVG внутри компонента и файл, добавленный в библиотеку, не будут; сверх — 413 |
| `CODRAW_LIMITS_LIBRARIES_SIZE_PER_USER` | `50MB` | сколько занимают компоненты всех библиотек пользователя вместе; сверх — 409. Компоненты хранятся в PostgreSQL, пока пользователь их не удалит |
| `CODRAW_WEBHOOK_ALLOWED_HOSTS` | `hooks.slack.com` | хосты входящих вебхуков чатов, которые пользователи могут ввести, через запятую, например `hooks.slack.com,chat.example.com`; пусто — чаты выключены |
| `CODRAW_NOTIFICATIONS_DELIVERY_DELAY` | `1m` | сколько письмо или сообщение ждёт первой попытки: прочитанное в колокольчике или отменённое за это время не уходит |
| `CODRAW_NOTIFICATIONS_DELIVERY_MAX_ATTEMPTS` | `5` | попыток отправить письмо или сообщение, если сервер не отвечает; паузы — 1, 5, 25 минут, затем по 2 часа |
| `CODRAW_NOTIFICATIONS_EMAIL_CONFIRMATION_TTL` | `1d` | сколько действует ссылка письма, которое подтверждает адрес |
| `CODRAW_LIMITS_CONFIRMATION_EMAILS_PER_USER_PER_HOUR` | `5` | писем подтверждения адреса у одного пользователя в час; сверх — 429; счётчик — в памяти `backend` |

Политика конфиденциальности и условия использования — шаблоны, которые описывают, что делает CoDraw: какие данные и
cookie, сроки хранения этой установки, получателей. Оператор в них — из `CODRAW_LEGAL_OPERATOR` и
`CODRAW_LEGAL_CONTACT_EMAIL`; без них страницы говорят, что оператор не указал свои данные. Перед открытым запуском
задайте их и покажите тексты своему юристу. Ссылка на политику нужна и Google, чтобы перевести OAuth-приложение из
режима Testing.

Выгрузку своих данных и удаление учётной записи пользователи делают сами на странице «Учётная запись»; на запрос,
пришедший на `CODRAW_LEGAL_CONTACT_EMAIL`, можно ответить ссылкой на неё. Удалённая учётная запись не
восстанавливается, а её следы в резервных копиях базы уходят вместе с ними, по сроку их хранения.

Без обязательной переменной Docker Compose не запустит стек и назовёт её. Страница входа показывает только
настроенные способы входа: без OAuth-приложений GitHub и Google и без корпоративного провайдера остаётся вход гостем.

Ключ подписи:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out collab-signing-key.pem
```

Его содержимое целиком, с переносами строк, — значение `CODRAW_COLLAB_TOKEN_SIGNING_KEY` в двойных кавычках
в `.env.prod` или в окружении команды: `CODRAW_COLLAB_TOKEN_SIGNING_KEY="$(cat collab-signing-key.pem)"`.

### Схема из живой базы

«Импорт SQL» принимает дампы `pg_dump --schema-only` и `mysqldump --no-data` без всякой настройки: пользователь снимает
схему там, где у него есть доступ к базе, и открывает файл. Кроме того, `backend` может сам прочитать схему базы
PostgreSQL по адресу, пользователю и паролю, которые вводит пользователь («Подключиться к базе…»). Это сетевой доступ
`backend` к базам за пользователей, поэтому он выключен, пока администратор не перечислит разрешённые базы
([ADR-0007](adr/0007-live-schema-import.md)):

```bash
CODRAW_SCHEMA_IMPORT_ALLOWED_HOSTS=db.internal,reports.internal,10.20.0.0/16
```

- Имя из списка разрешено, во что бы оно ни разрешалось. Любой другой хост — адрес или имя — проходит, только если
  каждый его адрес лежит в сети из списка; `backend` подключается к проверенному адресу, а не разрешает имя заново.
- Loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16` с адресом метаданных облака, `fe80::/10`), multicast и
  адрес базы самого CoDraw закрыты и под широкой сетью вроде `10.0.0.0/8` или `0.0.0.0/0`: их открывает только
  запись внутри их диапазона (`127.0.0.1/32`) или имя. Неверная запись не даёт `backend` запуститься.
- Перечисляйте конкретные базы или узкие сети: всё, что в списке, `backend` может попробовать открыть по запросу
  любого вошедшего пользователя (не гостя), не больше 30 раз в час на пользователя. Схему читает любой пользователь
  базы, которому можно войти, — права на таблицы и данные не нужны; заведите для этого отдельную роль:
  `CREATE ROLE codraw_reader LOGIN PASSWORD '…'`.
- Подключение — только чтение, одно соединение без пула: ждёт соединения 5 секунд, ответа — 20, запрос к каталогу
  прерывается через 15; схема — не больше 500 таблиц и 2 МБ DDL (свойства `codraw.schema-import.connect-timeout`,
  `read-timeout`, `statement-timeout`, `max-tables`, `max-ddl-size`). В сессиях базы оно видно как
  `application_name = 'CoDraw schema import'`.
- Пароль приходит в теле запроса по HTTPS установки и нигде не хранится, в журнал не пишется. В журнале `backend` —
  строка о каждой попытке «Schema import from a database» с полями `user.id`, `server.address`, `server.port`,
  `codraw.schema_import.result` (`WARN` для `host-not-allowed`), в метриках — `codraw_schema_imports_total{result}`.
  Пользователь видит только общую причину: адрес не разрешён, не удалось подключиться, неверная база, пользователь
  или пароль, нет схемы, превышено время, слишком большая схема.
- «С проверкой сертификата» (`verify-full`) доверяет центрам сертификации JVM `backend`; для сертификата своего центра
  добавьте его в хранилище (`JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStore=…`). «Обязательно» шифрует без проверки
  сертификата, как `sslmode=require` в libpq.
- Политика конфиденциальности при включённой функции говорит, что учётные данные базы проходят через сервер и не
  хранятся.

### Уведомления на почту и в чат

Пользователи, вошедшие через GitHub или Google, получают уведомления (упоминания, ответы, назначенные ветки, доступ,
ревью) не только в колокольчике, но и на почту и в чат — на странице «Уведомления вне CoDraw»
([ADR-0008](adr/0008-external-notifications.md)). Обоим каналам нужен адрес приложения, на который ведут ссылки:

```bash
CODRAW_APP_URL=https://codraw.example.com
```

**Почта.** Задайте SMTP-сервер — свой или облачный (SES, Postmark, SendGrid и другие принимают SMTP) — и отправителя:

```bash
CODRAW_SMTP_HOST=smtp.example.com
CODRAW_SMTP_PORT=587
CODRAW_SMTP_USERNAME=codraw@example.com
CODRAW_SMTP_PASSWORD=…
CODRAW_MAIL_FROM="CoDraw <codraw@example.com>"
```

- Письма уходят только на адрес, который пользователь подтвердил по ссылке из письма (ссылка действует сутки, не
  больше 5 писем подтверждения в час на пользователя). Настройте SPF и DKIM домена отправителя, иначе письма уйдут в
  спам.
- Порт отправки по умолчанию — 587; соединение шифруется STARTTLS, если сервер его предлагает, и ждёт ответа 10
  секунд. Недоступный SMTP-сервер не делает `backend` больным: письма ждут в очереди.

**Чаты.** Пользователь вставляет адрес входящего вебхука Slack, Mattermost или Rocket.Chat; `backend` отправляет туда
`POST` с JSON `{"text": …}`. Это запросы `backend` по адресам, которые вводят пользователи, поэтому хост должен быть в
списке `CODRAW_WEBHOOK_ALLOWED_HOSTS` (по умолчанию `hooks.slack.com`). Для своего Mattermost:

```bash
CODRAW_WEBHOOK_ALLOWED_HOSTS=hooks.slack.com,mattermost.example.com
```

- В списке — только имена хостов, без подстановок; адреса только `https`, без имени и пароля. Перенаправлений
  `backend` не выполняет, ждёт соединения 5 секунд и ответа 10. Пустой список выключает чаты.
- Адрес вебхука — секрет: API его не отдаёт (только хост и 4 последних символа), в журнал и метрики он не попадает.

**Доставка.** Письмо и сообщение ставятся в очередь (таблица `notification_deliveries`) вместе с уведомлением и уходят
через минуту, если уведомление за это время не прочитали и не отменили; перед отправкой `backend` заново проверяет
настройки канала, отключённые доски и доступ получателя к доске. Несколько экземпляров `backend` разбирают очередь
вместе. Неудачная попытка повторяется до 5 раз; отказ (адрес не принят, вебхук ответил 4xx) не повторяется, а
пользователь видит его на странице настроек. В метриках — `codraw_notifications_deliveries_total{channel,result}`
(`sent`, `retried`, `failed`, `skipped`); рост `failed` у `email` — повод проверить SMTP.

### Задачи GitHub

Пользователи, вошедшие через GitHub или Google, подключают GitHub на странице «Подключения» своим токеном и привязывают
к элементам и веткам комментариев задачи, до которых этот токен дотягивается, или создают задачи со ссылкой обратно на
доску ([ADR-0009](adr/0009-issue-tracker.md)). По умолчанию это github.com; для GitHub Enterprise Server укажите его API:

```bash
CODRAW_ISSUES_GITHUB_API_URL=https://github.example.com/api/v3
```

- `backend` ходит только на этот адрес: токены пользователей уходят только туда, перенаправления — только в его пределах,
  соединения ждёт 5 секунд, ответа — 10. Пустое значение выключает задачи.
- Токен — секрет пользователя: API его не отдаёт, в журнал и метрики он не попадает. Пользователям стоит создавать
  fine-grained токены с доступом только к нужным репозиториям, правом «Issues: Read and write» и сроком действия. Токен,
  который GitHub перестал принимать, `backend` больше не отправляет, пока пользователь не введёт новый.
- Статус задачи идёт только из GitHub в CoDraw. Привязка, которую показывают и которой не обновляли дольше 5 минут,
  обновляется токеном того, кто её привязал, — не чаще раза в минуту.

**Вебхук задач** приносит изменения сразу, а не при следующем показе. Администратор репозитория или организации GitHub
создаёт вебхук с адресом `https://codraw.example.com/api/integrations/github/webhook`, типом `application/json`,
секретом и событием «Issues»; тот же секрет задаётся `backend`:

```bash
CODRAW_ISSUES_GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

`backend` принимает только события с подписью `X-Hub-Signature-256` этим секретом и меняет только уже привязанные
задачи: название, статус, перенос в другой репозиторий, удаление. Повторное или запоздавшее событие ничего не меняет.

### Корпоративный вход

Сотрудники входят через провайдер удостоверений компании, если он говорит OpenID Connect: Keycloak, Microsoft Entra ID,
Okta, Authentik, ADFS. Решение — [ADR-0011](adr/0011-corporate-sign-in.md).

1. Создайте у провайдера конфиденциальный клиент (client) с потоком «authorization code» и адресом возврата
   `https://codraw.example.com/api/login/oauth2/code/corp`, где `corp` — id провайдера в настройках CoDraw. Если
   включаете выход у провайдера, разрешите адрес после выхода `https://codraw.example.com/login`.
2. Задайте `CODRAW_OIDC_ISSUER_URI` — issuer провайдера, по которому открываются его метаданные
   `<issuer>/.well-known/openid-configuration`, — `CODRAW_OIDC_CLIENT_ID`, `CODRAW_OIDC_CLIENT_SECRET` и название
   кнопки `CODRAW_OIDC_NAME`, например «Keycloak компании». Без issuer или client id кнопки нет.
3. По желанию ограничьте вход доменами почты (`CODRAW_OIDC_ALLOWED_EMAIL_DOMAINS`) и группами
   (`CODRAW_OIDC_ALLOWED_GROUPS`). Не прошедший проверку возвращается на страницу входа с сообщением, что вход в эту
   установку ему не разрешён, и учётная запись не создаётся.

**Пример для Keycloak.** В realm `acme` создайте клиент `codraw`: Client authentication — On, Standard flow — On,
Valid redirect URIs — `https://codraw.example.com/api/login/oauth2/code/corp`, Valid post logout redirect URIs —
`https://codraw.example.com/login`; секрет — на вкладке Credentials. Для ограничения по группам добавьте клиенту
mapper «Group Membership» с Token Claim Name `groups` и выключенным Full group path. Затем в `.env.prod`:

```bash
CODRAW_OIDC_ISSUER_URI=https://sso.example.com/realms/acme
CODRAW_OIDC_CLIENT_ID=codraw
CODRAW_OIDC_CLIENT_SECRET=…
CODRAW_OIDC_NAME=Keycloak компании
CODRAW_OIDC_ALLOWED_GROUPS=codraw-users
CODRAW_OIDC_LOGOUT=true
```

Для Entra ID issuer — `https://login.microsoftonline.com/<id каталога>/v2.0` (не `/common`), а группы приходят
идентификаторами: их и указывайте. Ограничение по домену почты надёжно только с issuer одного каталога: Entra ID не
отдаёт `email_verified`, и в мультитенантном приложении claim `email` задаёт администратор чужого каталога, так что
он может указать любой домен. Для приложения, в которое входят из нескольких каталогов, ограничивайте вход группами
или условиями доступа в самом Entra ID. Для Okta — адрес сервера авторизации, например `https://acme.okta.com`.

Учётная запись CoDraw связана с парой issuer и идентификатора пользователя у провайдера (`sub`): смена почты или имени
её не теряет, а пользователи разных провайдеров — разные учётные записи. Поэтому issuer должен оставаться прежним: новый
адрес Keycloak или другой каталог Entra ID — это новые учётные записи. Метаданные провайдера `backend` читает при
первом входе через него и помнит до перезапуска; если провайдер недоступен, `backend` работает, а вход через провайдера
возвращает на страницу входа с ошибкой и пишет причину в журнал.

`docker-compose.prod.yml` передаёт одного провайдера с id `corp`. Второй и следующие добавьте в `environment` сервиса
`backend` (например, в `docker-compose.override.yml`) переменными `CODRAW_AUTH_OIDC_<ID>_ISSUER_URI`, `…_CLIENT_ID`,
`…_CLIENT_SECRET`, `…_NAME`, `…_SCOPES`, `…_ALLOWED_EMAIL_DOMAINS`, `…_ALLOWED_GROUPS`, `…_GROUPS_CLAIM`, `…_LOGOUT`;
id — строчные латинские буквы и цифры, кроме `github`, `google` и `guest`.

**Закрытая установка.** Чтобы оставить только корпоративный вход, не задавайте `GITHUB_*` и `GOOGLE_*` и выключите
гостей: `CODRAW_GUESTS_ENABLED=false`. Политика конфиденциальности сама назовёт провайдера, которого вы выбрали.

## 2. OAuth

Если нужен вход через GitHub и Google, создайте их OAuth-приложения, как описано в README («Вход через GitHub и Google»), с адресами возврата
`https://codraw.example.com/api/login/oauth2/code/github` и `https://codraw.example.com/api/login/oauth2/code/google`.
`backend` строит эти адреса по схеме и домену, которые передаёт прокси, поэтому за TLS-прокси они получаются
с `https`.

## 3. Запуск

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

`--wait` ждёт, пока все контейнеры станут `healthy`: PostgreSQL и хранилище изображений, затем `backend` (миграции
базы применяются при его старте, бакет картинок создаётся, если его нет), затем `collab` и `frontend`. Приложение
отвечает на `http://<сервер>:8080`.

**Другое хранилище изображений.** `backend` говорит с хранилищем по обычному S3 с путём бакета в адресе (path-style),
поэтому вместо сервиса `s3` подойдёт любое S3-совместимое: облачный S3, SeaweedFS, сборка MinIO. Задайте
`CODRAW_IMAGES_S3_ENDPOINT`, `CODRAW_IMAGES_S3_REGION`, `CODRAW_IMAGES_S3_BUCKET` и ключи в `CODRAW_S3_ACCESS_KEY` и
`CODRAW_S3_SECRET_KEY`; бакет должен быть закрыт для чтения снаружи — картинки отдаёт `backend`, проверяя доступ к
доске. Сервис `s3` стека тогда работает вхолостую. Если хранилище недоступно, доски работают, а загрузка и показ
картинок отвечают 503; уборка картинок удалённых досок ждёт его.

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

Контейнеры пересоздаются, данные остаются в томах `codraw-prod_postgres-data`, `codraw-prod_s3-data` (картинки) и
`codraw-prod_backups` (резервные копии). Перед обновлением, которое меняет схему базы, снимите копию:
`docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup codraw-backup now`. Подключённые участники видят «Нет
связи» на время перезапуска и переподключаются сами. Для отката задайте `CODRAW_VERSION` с хешем предыдущего коммита
и выполните `up -d --wait`. Откат на версию до изменения схемы базы требует отката миграций — U-скриптов в
`backend/src/main/resources/db/migration`.

## Мониторинг и журналы

**Метрики** в формате Prometheus открыты без входа только внутри сети стека: по адресу приложения их нет.

| Где | Что |
|---|---|
| `backend:8080/actuator/prometheus` | HTTP-запросы (`http_server_requests_seconds_*`), JVM, пул соединений с базой (`hikaricp_*`); созданные доски и гости (`codraw_board_creations_total`, `codraw_guest_creations_total`), удалённые учётные записи (`codraw_accounts_deleted_total`), размеры сохранённых документов (`codraw_documents_stored_bytes_*`), сработавшие пределы (`codraw_limits_reached_total{limit}`, в том числе `image`, `images`, `libraries`, `library-components`, `library-component` и `libraries-size`), удалённое уборкой гостей (`codraw_guests_cleanup_deleted_total{kind}`), ошибки браузеров участников (`codraw_client_errors_total{kind}`: `error`, `unhandledrejection`, `render`), размеры новых картинок досок (`codraw_images_stored_bytes_*`) и картинки удалённых досок, убранные из хранилища (`codraw_images_cleanup_deleted_total`), загрузки схем из баз по результатам (`codraw_schema_imports_total{result}`) |
| `backup:9187/metrics.txt` | резервные копии: время и результат последней попытки, время последней удачной копии, размер и длительность (`codraw_backup_*`, см. «Резервные копии») |
| `collab:1234/metrics` | подключения (`codraw_collab_connections`), открытые доски и черновики предложений (`codraw_collab_documents`), сохранения документов по результату и их время (`codraw_collab_stores_total{result}`, `codraw_collab_store_duration_seconds`; `proposal_closed` — правки черновика после решения по предложению, их `backend` не сохраняет), отказы по причинам (`codraw_collab_rejections_total{reason}`, в том числе `account-deleted` — соединения пользователей, удаливших учётную запись), тексты досок для поиска, переданные `backend`, по результату (`codraw_collab_search_texts_total{result}`: `stored`, `kept` — у доски уже был текст, `failed`), метрики процесса Node.js |

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
| `CodrawServiceDown` | `backend`, `collab` или `backup` не отвечает Prometheus 2 минуты |
| `CodrawBackendErrors` | больше 5% ответов `backend` — ошибки 5xx, 10 минут |
| `CodrawDocumentStoreFailures` | `collab` не смог сохранить документ доски хотя бы раз за 10 минут |
| `CodrawCollabBusy` | `collab` 10 минут занимает больше 80% ядра: правки вот-вот начнут доходить с задержкой, см. «Ресурсы» |
| `CodrawDatabaseConnectionsPending` | запросы `backend` 5 минут ждут соединений с базой |
| `CodrawClientErrors` | больше 20 ошибок в браузерах участников за 10 минут |
| `CodrawBackupFailed` | последняя резервная копия не удалась |
| `CodrawBackupMissing` | удачной резервной копии нет больше 26 часов (15 минут подряд) |

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

## Ресурсы

Первым у установки упирается процессор `collab`: это один процесс Node.js, он использует одно ядро, сколько бы их ни
было. На ядре Xeon 2,1 ГГц он держит p95 доставки правки ≤ 200 мс до ~300 одновременно открытых досок по 3 активных
участника и доску из 100 участников; `backend` и PostgreSQL при этом заняты на 10–15 % ядра.

| Одновременно открытых досок (по 2–3 активных участника) | Сервер |
|---|---|
| до 100 | 2 vCPU, 4 ГБ памяти |
| до 200 | 2–4 vCPU, 4 ГБ памяти |
| до 300 | 4 vCPU, 8 ГБ памяти |
| больше 300 | одного процесса `collab` не хватит ([#173](https://github.com/TheScarletArrow/codraw/issues/173)) |

Заложите `collab` 1 ГБ памяти, держите его процессор ниже ~70 % ядра в часы пик — правило `CodrawCollabBusy`
предупредит, — а если обычны доски с десятками участников, задайте `CODRAW_COLLAB_BROADCAST_DELAY_MS=20`–`30`. Стенд,
цифры, найденные узкие места и как прогнать ту же нагрузку на своём сервере (`pnpm load`) — в
[нагрузочных тестах](load-testing.md).

## Резервные копии

Состояние — в PostgreSQL (доски, документы, версии, пользователи, сеансы, описания картинок) и в хранилище картинок
(файлы картинок). Сервис `backup` стека снимает их копии сам: после `up -d` — сразу, если удачной копии ещё нет, а дальше
по расписанию. Решение — [ADR-0010](adr/0010-backups.md).

Каждая копия — один архив `codraw-2026-10-10T030000Z.tar` (время UTC) в томе `codraw-prod_backups`: в нём
`database.dump` — `pg_dump --format=custom` базы, `images/` — файлы бакета картинок и `manifest.txt`. Сначала снимается
база, затем картинки: файл картинки по своему адресу никогда не меняется, поэтому копия картинок, снятая после копии
базы, покрывает все картинки, на которые та ссылается. Картинки копируются по S3 API, поэтому так же копируется и внешнее
хранилище картинок (`CODRAW_IMAGES_S3_*`). Два снятия одновременно не идут.

| Переменная | По умолчанию | Что |
|---|---|---|
| `CODRAW_BACKUP_SCHEDULE` | `0 3 * * *` | когда снимать копии: cron из пяти полей, время UTC; с другим расписанием поправьте и порог `CodrawBackupMissing` |
| `CODRAW_BACKUP_KEEP_DAILY` | `7` | сколько последних дней хранится последняя копия каждого дня; не меньше 1 |
| `CODRAW_BACKUP_KEEP_WEEKLY` | `4` | сколько последних недель (ISO, с понедельника) хранится последняя копия каждой недели; 0 — без недельных |
| `CODRAW_BACKUP_ENCRYPTION_PASSWORD` | пусто | пароль шифрования архивов; пусто — архивы не шифруются |
| `CODRAW_BACKUP_S3_ENDPOINT` | пусто | адрес S3-совместимого хранилища копий вне сервера, например `https://s3.eu-central-1.amazonaws.com`; пусто — копии только на сервере |
| `CODRAW_BACKUP_S3_REGION` | `us-east-1` | регион этого хранилища |
| `CODRAW_BACKUP_S3_BUCKET` | — | бакет копий; создаётся, если его нет; обязателен с адресом |
| `CODRAW_BACKUP_S3_PREFIX` | пусто | каталог копий в бакете, например `codraw/prod` |
| `CODRAW_BACKUP_S3_ACCESS_KEY`, `CODRAW_BACKUP_S3_SECRET_KEY` | — | ключи хранилища копий; обязательны с адресом. Ключу хватает прав читать, писать и удалять объекты бакета |
| `CODRAW_BACKUP_VOLUME` | `backups` | где на сервере лежат архивы: том Docker или каталог сервера, например на другом диске (`/mnt/backups`; владелец — пользователь с UID 70: `chown 70:70 /mnt/backups`) |

Неверное расписание, число или половина настроек хранилища копий не дают сервису запуститься: `docker compose … logs
backup` называет настройку.

**Хранилище вне сервера.** Копия на том же диске спасает от ошибок, но не от потери сервера. Задайте
`CODRAW_BACKUP_S3_*`: каждый архив тогда копируется и туда, а копия считается удачной, когда архив лёг в оба места.
Подойдёт облачный S3, Backblaze B2, Yandex Object Storage, MinIO на другой машине — путь бакета в адресе (path-style).
Дайте хранилищу копий отдельные ключи, которые не открывают хранилище картинок, и, если провайдер умеет, включите
блокировку удаления объектов (object lock) на срок хранения.

**Шифрование.** С `CODRAW_BACKUP_ENCRYPTION_PASSWORD` архивы шифруются (rclone crypt: XSalsa20-Poly1305 с проверкой
целостности) и лежат на сервере и в хранилище только зашифрованными, с суффиксом `.tar.bin`. Храните пароль вне сервера:
без него копии не восстановить. Если пароль сменить, старые копии читаются только старым паролем; правило хранения
удаляет их как обычно.

**Правило хранения.** После удачной копии остаются: последний архив каждого дня (UTC), если он моложе
`CODRAW_BACKUP_KEEP_DAILY` суток, последний архив каждой недели, если он моложе `CODRAW_BACKUP_KEEP_WEEKLY` недель, и
всегда — самый свежий архив; остальные удаляются и на сервере, и в хранилище копий. Файлы с другими именами не
трогаются. Значит, удалённые пользователями данные остаются в копиях не дольше `max(N дней, 7·M дней)` — по умолчанию 28
дней; этот срок называет политика конфиденциальности. Место: до N+M архивов, каждый — база и все картинки.

**Метрики и оповещения.** `backup:9187/metrics.txt` в сети стека, Prometheus профиля `monitoring` читает их заданием
`backup`:

| Метрика | Что |
|---|---|
| `codraw_backup_last_success_timestamp_seconds` | когда закончилась последняя удачная копия, 0 — ни одной |
| `codraw_backup_last_run_timestamp_seconds`, `codraw_backup_last_run_success` | когда началась последняя попытка и удалась ли она (1 или 0) |
| `codraw_backup_last_size_bytes`, `codraw_backup_last_duration_seconds` | размер последнего архива и время последней попытки |

Значения лежат в томе копий и переживают перезапуск. Правила `CodrawBackupFailed` (последняя копия не удалась) и
`CodrawBackupMissing` (удачной копии нет больше 26 часов) — в таблице оповещений выше. Причина неудачи — в журнале:
`docker compose -f docker-compose.prod.yml logs backup`.

**Копия сейчас и список копий:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup codraw-backup now
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup codraw-backup list
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup codraw-backup list --remote
```

### Восстановление

Восстановление заменяет базу целиком и делает бакет картинок таким, каким он был при копии. Пока к базе подключён
`backend` или `collab`, оно отказывается. Выполните его с теми же `.env.prod` и паролем шифрования, что и копию, и той
же версией образов (`CODRAW_VERSION`) или новее:

```bash
# 1. остановите приложение: база и хранилище картинок продолжают работать
docker compose -f docker-compose.prod.yml --env-file .env.prod stop frontend collab backend

# 2. восстановите последний архив сервера; имя архива вместо latest — конкретную копию,
#    --remote — из хранилища копий вне сервера
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps backup restore latest

# 3. запустите приложение
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
```

**На новом сервере** после потери старого: скопируйте `docker-compose.prod.yml`, `deploy/` и `.env.prod`, поднимите
базу и хранилище картинок и восстановите последнюю копию из хранилища вне сервера:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait postgres s3
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm --no-deps backup restore latest --remote
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
```

Копия снимается раз в сутки, поэтому после восстановления пропадает работа с момента последней копии.

**Вручную, без сервиса `backup`**, — те же шаги, что он делает:

```bash
# копия базы, затем тома картинок
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U codraw -d codraw --format=custom > codraw-$(date +%F).dump
docker run --rm -v codraw-prod_s3-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/codraw-images-$(date +%F).tar.gz -C /data .

# восстановление в пустую базу; том картинок — при остановленном s3
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_restore -U codraw -d codraw --clean --if-exists < codraw-2026-10-05.dump
docker compose -f docker-compose.prod.yml --env-file .env.prod stop s3
docker run --rm -v codraw-prod_s3-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/codraw-images-2026-10-05.tar.gz -C /data'
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --wait
```

**Секреты.** Пароль базы, ключи хранилищ и пароль шифрования сервис получает только из окружения контейнера: их нет в
образе, архивах и журнале, а rclone и `pg_dump` получают их через окружение, а не аргументы. Как и у остальных сервисов,
их видит `docker inspect`: доступ к Docker на сервере — это доступ ко всему.

## Что проверяет CI

Задача `images` проверяет конфигурацию и правила Prometheus (`promtool`), собирает четыре образа, поднимает из них
этот же `docker-compose.prod.yml` с профилем `monitoring` (с хранилищем изображений, хранилищем копий вне сервера — бакетом
того же RustFS — и шифрованием копий), ждёт, пока Prometheus увидит `backend`, `collab` и `backup`, и в
браузере проверяет через nginx совместную работу двух гостей, изображение и версию доски, заголовки безопасности,
кеширование и закрытость внутреннего API и метрик (`pnpm --filter @codraw/e2e test:stack`). Тот же тест можно запустить
против своего стека: `STACK_URL=https://codraw.example.com pnpm --filter @codraw/e2e test:stack`.

Затем `deploy/backup/check-restore.sh` проверяет резервные копии: правило хранения (`retention.test.sh`), отказ
восстановления при работающем `backend`, неудачную копию в метриках и в оповещении `CodrawBackupFailed`, удаление старых
архивов на сервере и в хранилище копий, а потом снимает копию, теряет базу, картинки и архивы сервера, восстанавливает
последний архив из хранилища копий и сверяет каждую таблицу базы и каждый файл картинок с тем, что было; журнал `backup`
не должен содержать секретов. После этого стек снова поднимается, и проверка в браузере проходит ещё раз.
