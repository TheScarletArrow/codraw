# Tasks

## 1. Корень монорепы

- [x] 1.1 Создать `pnpm-workspace.yaml`, корневой `package.json` со скриптами `build`, `typecheck`, `lint`, `test`, а также `.gitignore` и `.nvmrc`; проверка: `pnpm install` в корне ставит зависимости `frontend` и `collab`

## 2. backend

- [x] 2.1 Создать Gradle-проект (Kotlin DSL, wrapper 9.8.0) на Spring Boot 4.1.1 и Kotlin 2.3.21 с toolchain JDK 25; проверка: `./gradlew build` в `backend/` проходит
- [x] 2.2 Подключить Actuator с health и probes liveness/readiness; проверка: `HealthEndpointTest` проходит для всех трёх путей

## 3. collab

- [x] 3.1 Создать TypeScript-проект на Hocuspocus 4 со скриптами `dev`, `build`, `start`, `typecheck`, `test`; проверка: `pnpm --filter @codraw/collab build` создаёт `dist/index.js`
- [x] 3.2 Добавить `GET /health`; проверка: тест «reports health» в `collab/test/server.test.ts`
- [x] 3.3 Проверить синхронизацию двух клиентов в памяти; проверка: тест «delivers changes from one client to another»

## 4. frontend

- [x] 4.1 Сгенерировать проект Vite + React + TypeScript и убрать демо-код шаблона; проверка: `pnpm --filter @codraw/frontend build`
- [x] 4.2 Настроить прокси dev-сервера `/api` → backend и `/collab` → collab; проверка: два клиента синхронизируются через `ws://localhost:5173/collab`
- [x] 4.3 Подключить Vitest и Testing Library; проверка: `App.test.tsx` проходит

## 5. CI и документация

- [x] 5.1 Добавить workflow GitHub Actions: backend, frontend + collab, `openspec validate --all --strict`; проверка: все три job зелёные на GitHub
- [x] 5.2 Описать локальный запуск в README (раздел «Разработка»); проверка: команды из README выполняются как написано
