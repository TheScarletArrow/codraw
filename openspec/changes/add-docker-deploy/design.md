# Design

## Context

Сервисы собираются так: `backend` — `./gradlew bootJar` (JDK 25, Spring Boot 4), `collab` — `tsc` в `collab/dist`,
`frontend` — `vite build` в `frontend/dist`. `collab` и `frontend` — пакеты одного pnpm workspace с общим
`pnpm-lock.yaml` в корне. В разработке Vite проксирует `/api` в `backend` и `/collab` в `collab`, сохраняя заголовок
`Host`: по нему `backend` строит адрес возврата OAuth (`{baseUrl}/api/login/oauth2/code/{registrationId}`).
`collab` ходит в `backend` напрямую — во внутренний API и за JWKS. Требования — в `specs/`.

## Goals / Non-Goals

**Goals:**

- Образы собираются из чистой копии репозитория одной командой и не зависят от того, что собрано на машине.
- Конфигурация, развёрнутая на сервере, проверяется в CI так же, как её увидит пользователь: в браузере, через nginx,
  с Content Security Policy.

**Non-Goals:**

- Выпуск TLS-сертификатов и сам TLS-прокси: CoDraw ставится за любой прокси (Caddy, Traefik, балансировщик облака);
  пример для Caddy — в документации.
- Kubernetes, Helm, несколько экземпляров `collab` (нужен Redis, см. ADR-0001).
- Автоматическое развёртывание на сервер из CI.

## Decisions

### Образы

- `backend/Dockerfile`, контекст `backend/`: этап сборки на `eclipse-temurin:25-jdk-noble` — сначала файлы Gradle
  и `./gradlew dependencies` (слой с зависимостями переживает изменения кода), затем `bootJar` и распаковка jar
  по слоям (`java -Djarmode=tools … extract --layers --launcher`). Итоговый образ — `eclipse-temurin:25-jre-noble`,
  слои Spring Boot копируются по отдельности, запуск через `JarLauncher` от системного пользователя `codraw`.
  `-XX:MaxRAMPercentage=75` — память JVM следует лимиту контейнера.
- Проверка `backend` — `bash` с `/dev/tcp` к `/actuator/health/readiness`: в образе JRE нет ни `curl`, ни `wget`,
  а ставить пакет ради проверки — лишний вес и лишние уязвимости.
- `collab/Dockerfile` и `frontend/Dockerfile`, контекст — корень репозитория: нужен общий lockfile. Этап сборки на
  `node:24-alpine` (версия из `.nvmrc`) с pnpm через corepack копирует `package.json` всех пакетов workspace,
  ставит зависимости только своего пакета с `--frozen-lockfile`, потом копирует исходники и собирает.
- `collab` в итоговом образе — `node:24-alpine`, `dist/` и только продакшен-зависимости (`pnpm deploy --prod`),
  пользователь `node`, проверка — `wget` к `/health`.
- `frontend` в итоговом образе — `nginxinc/nginx-unprivileged` (nginx без root, порт 8080) со статикой из `dist/`.
  Адреса `backend` и `collab` подставляются в шаблон конфигурации из переменных `BACKEND_URL` и `COLLAB_URL`
  штатным механизмом образа (`/etc/nginx/templates`), по умолчанию — имена сервисов в Compose.
- `.dockerignore` в корне и в `backend/` отсекают `node_modules`, результаты сборки и кеши: контекст маленький,
  а локальные артефакты не попадают в образ.

### nginx

- `location /api/` — `proxy_pass` в `backend` с `Host`, `X-Forwarded-For` и `X-Forwarded-Proto`. Схема берётся
  из `X-Forwarded-Proto` внешнего прокси, если он её прислал, иначе — своя (`map`).
- `location = /collab` — WebSocket: `proxy_http_version 1.1`, `Upgrade` и `Connection`, таймауты чтения
  и отправки — час, чтобы простаивающее соединение не рвалось (Hocuspocus сам шлёт ping).
- `location ^~ /internal/` и `^~ /actuator/` отвечают 404. Через nginx они и так не проксируются — без этих правил
  на них ответил бы `index.html`, а явный 404 не оставляет сомнений.
- `location /assets/` — файлы с хешем в имени: `Cache-Control: public, max-age=31536000, immutable`. Остальное —
  `try_files $uri /index.html` с `Cache-Control: no-cache`: после обновления пользователь получает новую сборку.
- Заголовки безопасности — в отдельном файле, который подключают обе `location` со статикой: `add_header` во вложенной
  `location` отменяет заголовки уровня `server`. Ответы API их не получают: Spring Security ставит свои.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:` плюс домены аватаров
  GitHub и Google; `connect-src 'self'` (по CSP3 включает `ws:`/`wss:` того же адреса); `object-src 'none';
  base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. Ничего inline: сборка Vite не содержит инлайн-скриптов,
  а React, Radix и maxGraph задают стили через DOM (`element.style`), что CSP разрешает. Это проверено прогоном всего
  набора e2e через nginx с этой политикой и `report-uri`: отчётов о нарушениях не было. `img-src data:` — значки
  maxGraph в виде data-URI.
- `server_tokens off`, gzip для текста, `client_max_body_size` — 10 МБ: импорт `.drawio` разбирается в браузере,
  а через API идут только короткие JSON.

### backend за прокси

- `server.forward-headers-strategy: native` — `RemoteIpValve` Tomcat берёт схему из `X-Forwarded-Proto` и хост из
  `Host`/`X-Forwarded-Host`, но только от доверенных адресов (внутренние сети, куда входят сети Docker). Отсюда
  правильный `{baseUrl}` для OAuth и `request.isSecure()` — Spring Session ставит `Secure` на cookie.
- Альтернатива `framework` (`ForwardedHeaderFilter`) доверяет заголовкам от любого клиента. Отклонено: `native`
  проверяет адрес прокси, а в разработке ничего не меняет — прокси Vite этих заголовков не шлёт.

### Docker Compose для продакшена

- Отдельный `docker-compose.prod.yml`, а `docker-compose.yml` остаётся для разработки (только PostgreSQL на порту
  хоста): смешивать их значило бы открыть базу наружу или менять привычный локальный запуск.
- Образы — `${CODRAW_IMAGE_PREFIX:-ghcr.io/thescarletarrow/codraw-}{backend,collab,frontend}:${CODRAW_VERSION:-latest}`,
  у каждого есть и `build`, так что `docker compose -f docker-compose.prod.yml build` собирает их на месте.
- Обязательные переменные — `${VAR:?сообщение}`: Compose отказывается запускаться и называет переменную. OAuth
  не обязателен: без него работает вход гостем.
- `depends_on` с `condition: service_healthy`: `backend` ждёт PostgreSQL, `collab` — `backend` (ему нужен JWKS),
  `frontend` — оба. `restart: unless-stopped`. Наружу публикуется только `${CODRAW_HTTP_PORT:-8080}` у `frontend`.
- Пример переменных — `.env.prod.example`; ключ подписи генерируется `openssl` и передаётся в переменной целиком.

### CI

- Одна задача `images`: `docker/build-push-action` собирает три образа с кешем GitHub Actions и загружает их в Docker
  раннера, Compose поднимает из них стек (`--no-build --wait`) с тестовыми секретами, затем Playwright прогоняет
  проверку стека в браузере. Только после неё, и только на `main`,
  те же образы с тегами коммита и `latest` уходят в GHCR. Альтернатива — отдельные задачи сборки и публикации —
  собирала бы образы дважды или публиковала непроверенные.
- Проверка стека — отдельная конфигурация Playwright без `webServer` с адресом приложения из `STACK_URL`: два гостя
  работают на одной доске через nginx, заголовки и закрытые пути проверяются запросами, а любое сообщение браузера
  о нарушении CSP проваливает тест. Вход гостем есть и в продакшене, поэтому стек проверяется ровно в той
  конфигурации, что разворачивается, без тестового входа профиля `e2e`.

## Risks / Trade-offs

- [CSP ломает новую функцию, например загрузку картинок с другого домена] → проверка стека в CI падает на любом
  нарушении CSP; политика меняется в одном файле.
- [Docker Hub ограничивает частоту скачиваний] → кеш слоёв GitHub Actions; базовые образы скачиваются один раз на
  сборку.
- [Ключ подписи в переменной окружения виден через `docker inspect`] → как и остальные секреты Compose; для большего
  нужен менеджер секретов, это за рамками MVP.

## Migration Plan

1. Слить изменение: CI собирает и проверяет образы, на `main` публикует их.
2. На сервере: `.env` по `.env.prod.example`, `docker compose -f docker-compose.prod.yml up -d`, TLS-прокси перед
   портом приложения, адреса возврата OAuth на домен.
3. Откат — `CODRAW_VERSION` с тегом предыдущего коммита и `up -d`; данные остаются в томе.
