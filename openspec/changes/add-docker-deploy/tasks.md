# Tasks

## 1. Образы

- [x] 1.1 backend: `backend/Dockerfile` (сборка на JDK 25, слои Spring Boot, JRE, пользователь `codraw`, проверка через `/actuator/health/readiness`) и `backend/.dockerignore`; проверка: образ собирается, контейнер становится `healthy`
- [x] 1.2 collab: `collab/Dockerfile` (сборка в workspace, `pnpm deploy --prod`, пользователь `node`, проверка `/health`) и корневой `.dockerignore`; проверка: образ собирается, контейнер становится `healthy`
- [x] 1.3 frontend: `frontend/Dockerfile` и конфигурация nginx в `frontend/nginx/` — статика, прокси `/api/` и `/collab`, 404 для `/internal/` и `/actuator/`, заголовки безопасности, кеширование; проверка: образ собирается, контейнер становится `healthy`

## 2. backend за прокси

- [x] 2.1 backend: `server.forward-headers-strategy: native`; проверка: тест по HTTP — адрес возврата OAuth и `Secure` у cookie сеанса при `X-Forwarded-Proto: https`, без заголовков — как раньше

## 3. Стек

- [x] 3.1 `docker-compose.prod.yml` и `.env.prod.example`: четыре сервиса, проверки, порядок запуска, обязательные переменные, том PostgreSQL, наружу только порт приложения; проверка: `docker compose config` без ключа подписи называет переменную, с переменными стек поднимается `--wait`
- [x] 3.2 e2e: `playwright.stack.config.ts` и `stack/stack.spec.ts` — два гостя на одной доске через nginx без нарушений CSP, глубокая ссылка, заголовки и кеширование, 404 внутренних путей; проверка: проходит против стека из 3.1

## 4. CI и документация

- [x] 4.1 CI: задача `images` — сборка трёх образов с кешем, подъём стека, проверка стека, публикация в GHCR только на `main`, логи контейнеров при падении; проверка: задача зелёная на ветке и ничего не публикует
- [x] 4.2 `docs/deploy.md` (переменные, TLS-прокси на примере Caddy, OAuth, обновление и откат, резервные копии PostgreSQL), ссылки из README и `docs/running.md`, отметка в «Плане работ»; проверка: документация описывает развёртывание от чистого сервера до входа по https
