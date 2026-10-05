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

Задача `images` собирает три образа, поднимает из них этот же `docker-compose.prod.yml` и в браузере проверяет
через nginx совместную работу двух гостей, заголовки безопасности, кеширование и закрытость внутреннего API
(`pnpm --filter @codraw/e2e test:stack`). Тот же тест можно запустить против своего стека:
`STACK_URL=https://codraw.example.com pnpm --filter @codraw/e2e test:stack`.
