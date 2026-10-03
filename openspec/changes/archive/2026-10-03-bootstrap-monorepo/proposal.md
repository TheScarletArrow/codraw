# Proposal

## Why

В репозитории есть только README и ADR-0001. Чтобы начать работу над функциональностью, нужны каркасы
трёх подпроектов из ADR-0001 с общей сборкой, тестами и CI, которые с первого коммита ловят поломки.

## What Changes

- Корень монорепы: pnpm-workspace для `frontend` и `collab`, общие скрипты `build`, `typecheck`, `lint`,
  `test`, а также `.gitignore` и `.nvmrc`.
- `backend`: Spring Boot 4.1, Kotlin 2.3, JDK 25, Gradle 9.8 (wrapper), Actuator с проверками
  работоспособности.
- `collab`: Hocuspocus 4 на TypeScript с эндпоинтом `/health` и синхронизацией Yjs в памяти, пока без
  хранения.
- `frontend`: Vite 8, React 19, TypeScript, oxlint, Vitest; dev-сервер проксирует `/api` в backend и
  `/collab` в collab.
- CI на GitHub Actions: сборка и тесты всех подпроектов, проверка спецификаций OpenSpec.
- Раздел «Разработка» в README.

## Capabilities

### New Capabilities

- `service-health`: проверки работоспособности серверных сервисов для оркестратора, балансировщика
  и разработчика.

### Modified Capabilities

Нет.

## Impact

- Новые каталоги `backend/`, `collab/`, `frontend/`, `.github/workflows/`.
- Локальные порты: `frontend` — 5173, `backend` — 8080, `collab` — 1234.
- Для локальной разработки нужны JDK 25, Node.js 22.12+ и pnpm 10.
