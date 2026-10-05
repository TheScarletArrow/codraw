# Proposal

## Why

CoDraw запускается только из исходников: три процесса в трёх терминалах и `vite preview`, который не годится для
продакшена. ADR-0001 определяет MVP как четыре контейнера — `frontend` (nginx), `backend`, `collab` и PostgreSQL, —
но образов, конфигурации nginx и описания развёртывания нет, поэтому доску нельзя показать никому за пределами
машины разработчика.

## What Changes

- `backend`, `collab`, `frontend`: Dockerfile для каждого сервиса — многоэтапная сборка из исходников, запуск
  не от root, проверка работоспособности контейнера.
- `frontend`: образ на nginx отдаёт собранное приложение и с того же адреса проксирует `/api/` в `backend`
  и `/collab` (WebSocket) в `collab`; глубокие ссылки вроде `/boards/{id}` открывают приложение; внутренний API
  `backend` снаружи недоступен. Ответы несут заголовки безопасности (CSP и другие), файлы сборки с хешем в имени
  кешируются на год, `index.html` — нет.
- `backend`: адреса возврата OAuth и признак `Secure` у cookie строятся по заголовкам `X-Forwarded-*` от прокси,
  так что за TLS-прокси вход работает по `https`.
- `docker-compose.prod.yml`: четыре сервиса в порядке зависимостей, данные PostgreSQL в томе, наружу открыт только
  порт приложения; без обязательных секретов (`POSTGRES_PASSWORD`, `CODRAW_INTERNAL_TOKEN`,
  `CODRAW_COLLAB_TOKEN_SIGNING_KEY`) запуск отказывается стартовать.
- CI: новая задача собирает три образа, поднимает из них стек и прогоняет сквозную проверку через nginx в браузере;
  при пуше в `main` публикует образы в GitHub Container Registry с тегами `latest` и коммитом.
- `docs/deploy.md`: развёртывание на сервере — переменные, TLS-прокси, OAuth, обновление, резервные копии.

## Capabilities

### New Capabilities

- `deployment`: образы сервисов, единый адрес приложения за nginx, заголовки безопасности, работа за TLS-прокси,
  запуск стека одной командой и публикация образов.

### Modified Capabilities

Нет.

## Impact

- Новые файлы: `backend/Dockerfile`, `collab/Dockerfile`, `frontend/Dockerfile`, конфигурация nginx в
  `frontend/nginx/`, `.dockerignore`, `docker-compose.prod.yml`, `.env.prod.example`, `docs/deploy.md`,
  проверка стека в `e2e` (`playwright.stack.config.ts`, `stack/`).
- `backend`: `application.yaml` (`server.forward-headers-strategy`), тест на адреса за прокси.
- `.github/workflows/ci.yml`: задача `images`; публикации нужен `packages: write`.
- Локальная разработка не меняется: `docker-compose.yml` по-прежнему поднимает только PostgreSQL.
