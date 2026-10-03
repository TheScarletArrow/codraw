# Design

## Context

Репозиторий пустой, стек зафиксирован в `docs/adr/0001-tech-stack.md`. Мотивация — в `proposal.md`.

## Goals / Non-Goals

**Goals:**

- Каждый подпроект собирается, тестируется и запускается одной командой.
- В режиме разработки фронтенд, API и синхронизация доступны с одного origin — так же, как в продакшене
  за nginx.
- CI проверяет все подпроекты и спецификации на каждый push.

**Non-Goals:**

- Docker-образы и полный `docker-compose.yml` — отдельное изменение.
- База данных — появится в `add-board-sync`.
- Общий пакет типов для `frontend` и `collab` — появится, когда будет что делить.

## Decisions

### pnpm workspaces для TypeScript, Gradle отдельно

`frontend` и `collab` — пакеты одного pnpm-workspace с общим lock-файлом. `backend` — самостоятельный
Gradle-проект с wrapper.

Альтернативы:

- Gradle как корневой оркестратор с плагином для Node — лишняя связка, JS-инструменты привычнее
  запускать напрямую.
- Nx или Turborepo — избыточно для двух TS-пакетов.

### Версия Kotlin берётся из BOM Spring Boot

Kotlin 2.3.21 — это версия, которой управляет Spring Boot 4.1.1. Так компилятор и `kotlin-stdlib`
совпадают, и dependency management не понижает stdlib.

### Пакет `io.github.thescarletarrow.codraw`

У проекта нет собственного домена, поэтому пакет строится по GitHub-аккаунту.

### Проверки работоспособности

- `backend` — Spring Boot Actuator: `/actuator/health` и отдельные probes `liveness` и `readiness`
  для оркестратора.
- `collab` — `GET /health` через хук `onRequest` Hocuspocus. Остальные HTTP-запросы Hocuspocus
  обрабатывает сам.

Оба сервиса отвечают одинаково: `{"status":"UP"}`.

### Прокси dev-сервера

Vite на порту 5173 проксирует `/api` → `localhost:8080` и `/collab` → `ws://localhost:1234`.
Код фронтенда обращается к относительным путям и не знает о портах сервисов.

### Инструменты проверки

- `frontend` — oxlint (линтер по умолчанию в шаблоне Vite) и Vitest с Testing Library в jsdom.
- `collab` — проверка типов `tsc` и Vitest. Тесты поднимают настоящий сервер на случайном порту
  и подключают к нему клиентов Hocuspocus.
- TypeScript 6.0 — одна версия на оба пакета, та же, что ставит шаблон Vite.

## Risks / Trade-offs

- [В CI Node.js 24, локально может быть 22] → `engines` требует `>=22.12`, обе версии поддерживаются
  всеми инструментами.
- [Gradle toolchain требует установленный JDK 25] → в CI его ставит `actions/setup-java`, локальная
  установка описана в README.
- [Hocuspocus отвечает приветствием на любой HTTP-запрос] → health отдаётся только на `GET /health`,
  остальное не трогаем.
