# CoDraw

**CoDraw** — веб-редактор диаграмм, аналог [draw.io](https://www.drawio.com), созданный для совместной работы.

Несколько человек одновременно редактируют одну диаграмму и в реальном времени видят изменения,
курсоры и выделения друг друга. Совместная работа здесь — основной сценарий, а не надстройка
над однопользовательским редактором.

## Возможности (план)

- **Редактор диаграмм** — фигуры, коннекторы, текст, группы, страницы, стили, сетка и привязка.
- **Совместное редактирование в реальном времени** — без блокировок и конфликтов (CRDT).
- **Присутствие** — курсоры, выделения и аватары участников.
- **Undo/redo для каждого участника** — отменяются только свои действия, а не чужие.
- **Офлайн-режим** — правки сохраняются локально и синхронизируются при восстановлении связи.
- **Доступ и роли** — приглашения и ссылки с ролями: владелец, редактор, комментатор, читатель.
- **Комментарии** к элементам диаграммы.
- **История версий** — просмотр и откат к предыдущим состояниям.
- **Импорт/экспорт** — `.drawio`, PNG, SVG, PDF.

## Технологический стек

> Статус: **предложение**, ожидает согласования.
> Обоснование и альтернативы — в [ADR-0001](docs/adr/0001-tech-stack.md).

| Слой               | Технологии                                                     |
|--------------------|----------------------------------------------------------------|
| Frontend           | TypeScript, React, Vite                                        |
| Холст диаграмм     | maxGraph (наследник mxGraph — движка draw.io)                  |
| UI                 | Tailwind CSS, shadcn/ui                                        |
| Совместная работа  | Yjs (CRDT), y-protocols awareness, y-indexeddb (офлайн)        |
| Collab-сервер      | Hocuspocus (Node.js, WebSocket)                                |
| Backend API        | Kotlin, Spring Boot 4, JDK 25                                  |
| Хранение           | PostgreSQL + Flyway, S3-совместимое хранилище (MinIO локально) |
| Аутентификация     | Вход через GitHub/Google, JWT от backend                       |
| Тесты              | JUnit 5, Testcontainers, Vitest, Playwright                    |
| Инфраструктура     | Docker, Docker Compose, GitHub Actions                         |

## Структура репозитория

```
codraw/
├── backend/    # Kotlin + Spring Boot: пользователи, доски, права, версии
├── collab/     # сервер синхронизации Yjs (Hocuspocus)
├── frontend/   # React-приложение с редактором
├── e2e/        # сквозные тесты (Playwright)
├── openspec/   # спецификации и запланированные изменения (OpenSpec)
└── docs/       # архитектурные решения (adr/) и инструкция по запуску
```

## Запуск

Нужны JDK 25, Node.js 22.12+, pnpm 10 (`corepack enable`) и Docker.

```bash
pnpm install
docker compose up -d postgres

# каждый сервис — в отдельном терминале
cd backend && ./gradlew bootRun    # API: http://localhost:8080
pnpm dev:collab                    # синхронизация: ws://localhost:1234
pnpm dev:frontend                  # приложение: http://localhost:5173
```

Подробная инструкция — проверки на каждом шаге, порты, запуск собранной версии, тесты и частые
проблемы — в [docs/running.md](docs/running.md).

## Вход через GitHub и Google

В CoDraw входят через GitHub или Google. В списке каждый видит только свои доски, а чужую доску открывает
и редактирует по ссылке на неё. Для входа нужны
OAuth-приложения у провайдеров: создайте их один раз и передайте backend их client id и secret.
Без них backend запускается, но работает только режим гостя.

**Без входа.** На странице входа можно нажать «Продолжить без входа»: CoDraw создаст гостя «Гость N»,
который работает с досками так же, как вошедший пользователь. Гостевой сеанс хранится в cookie браузера 30 дней
с последнего обращения. Если гость затем войдёт через GitHub или Google, его доски перейдут к аккаунту;
если очистит cookie, не войдя, доски станут ему недоступны.

Адрес возврата (callback URL) — адрес приложения, к которому добавлен путь
`/api/login/oauth2/code/<провайдер>`. Для локальной разработки это
`http://localhost:5173/api/login/oauth2/code/github` и `http://localhost:5173/api/login/oauth2/code/google`,
в продакшене — `https://<домен>/api/login/oauth2/code/github` и `…/google`. Порт 5173 — порт фронтенда:
вход идёт через него, как и остальные запросы к API.

### GitHub

1. Откройте [Settings → Developer settings → OAuth Apps](https://github.com/settings/developers)
   и нажмите **New OAuth App**.
2. **Application name** — любое, например `CoDraw local`; **Homepage URL** — `http://localhost:5173`;
   **Authorization callback URL** — `http://localhost:5173/api/login/oauth2/code/github`.
3. Нажмите **Register application**, скопируйте **Client ID**, затем нажмите **Generate a new client secret**
   и скопируйте секрет: GitHub показывает его один раз.

Для каждого адреса приложения (локально, продакшен) нужно отдельное OAuth-приложение: у приложения GitHub
один callback URL.

### Google

1. В [Google Cloud Console](https://console.cloud.google.com/) создайте проект или выберите существующий.
2. **APIs & Services → OAuth consent screen**: тип пользователей **External**, заполните название
   и контактный email. Дополнительные scopes не нужны: CoDraw запрашивает только `profile`. Пока приложение
   в статусе **Testing**, добавьте в **Test users** аккаунты, которыми будете входить.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**: тип **Web application**,
   в **Authorized redirect URIs** добавьте `http://localhost:5173/api/login/oauth2/code/google`
   (и адрес продакшена, если нужен).
4. Скопируйте **Client ID** и **Client secret**.

### Переменные окружения

| Переменная | Сервис | Что |
|---|---|---|
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | backend | OAuth-приложение GitHub |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | backend | OAuth-приложение Google |
| `CODRAW_COLLAB_TOKEN_SIGNING_KEY` | backend | RSA-ключ подписи токенов синхронизации (PEM, PKCS#8) |
| `CODRAW_COLLAB_TOKEN_PREVIOUS_SIGNING_KEY` | backend | предыдущий ключ подписи на время смены ключа |
| `BACKEND_JWKS_URL` | collab | открытые ключи backend: `<адрес backend>/.well-known/jwks.json` |

Локально достаточно задать переменные провайдеров при запуске backend; если нужен только один провайдер,
переменные другого можно не задавать. Вместо переменных можно положить значения в
`backend/config/application-dev.yaml` — backend читает его в профиле `dev`, а файл в `.gitignore`:

```bash
cd backend
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… ./gradlew bootRun
```

Затем откройте http://localhost:5173 и нажмите «Войти через GitHub» — после подтверждения доступа
у провайдера откроется список ваших досок, а в шапке появятся ваши имя и аватар.

В продакшене обязательны все переменные backend, кроме предыдущего ключа подписи. Ключ подписи — один
и тот же у всех экземпляров backend; без него backend генерирует ключ при каждом старте, и выданные токены
перестают действовать после перезапуска. Создать ключ:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out collab-signing-key.pem
```

и передать его содержимое: `CODRAW_COLLAB_TOKEN_SIGNING_KEY="$(cat collab-signing-key.pem)"`. При смене
ключа прежний перенесите в `CODRAW_COLLAB_TOKEN_PREVIOUS_SIGNING_KEY` хотя бы на 5 минут — срок жизни
токена.

## Спецификации

Работа ведётся по [OpenSpec](https://github.com/Fission-AI/OpenSpec):

- `openspec/specs/` — действующие требования к системе;
- `openspec/changes/` — запланированные изменения: зачем (`proposal.md`), как (`design.md`),
  что поменяется в требованиях (`specs/`) и задачи (`tasks.md`).

CLI ставится через `npm i -g @fission-ai/openspec`. В Claude Code доступны команды `/opsx:propose`,
`/opsx:apply` и `/opsx:archive`.

## План работ

1. ~~`bootstrap-monorepo` — каркасы подпроектов и CI~~ — готово.
2. ~~`add-board-sync` — доски в PostgreSQL и синхронизация в реальном времени~~ — готово.
3. ~~`add-diagram-editor` — холст maxGraph: фигуры, связи, подписи, undo, курсоры участников~~ — готово.
4. ~~`add-user-auth` — вход через GitHub/Google и доступ только к своим доскам~~ — готово.
5. ~~`add-board-pages` — страницы-вкладки как в draw.io, курсоры участников по страницам, переход к участнику~~ — готово.
6. ~~`add-drawio-import-export` — импорт `.drawio` в доску и в новую доску, экспорт доски в `.drawio`~~ — готово.

Дальше: совместный доступ и роли, экспорт в PNG, SVG и PDF, история версий, офлайн-режим, Docker-образы
и деплой.
