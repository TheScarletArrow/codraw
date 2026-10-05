# Design

## Context

Стек (ADR-0001) — `backend` на Spring Boot 4 с Actuator (открыт только `health`), `collab` на Hocuspocus 4, nginx
впереди и PostgreSQL; всё поднимается `docker-compose.prod.yml`. Наружу проксируются только `/api/` и `/collab`,
`/actuator/` закрыт явно. `collab` пишет ошибки через `console.error`, Hocuspocus — свои сообщения так же.

## Goals / Non-Goals

**Goals:**

- Метрики, по которым видно нагрузку, ошибки и работу пределов, без своего кода сбора в каждом месте.
- Журналы, которые разбирает любой сборщик без регулярных выражений.
- Мониторинг, который поднимается одной командой вместе со стеком.

**Non-Goals:**

- Трассировка запросов между сервисами (OpenTelemetry) — когда сервисов и экземпляров станет больше.
- Доставка оповещений (Alertmanager, почта, мессенджеры) и дашборды Grafana: правила готовы, куда слать — решает
  тот, кто разворачивает.
- Сбор журналов в хранилище (Loki, ELK).

## Decisions

### Prometheus

- Формат и система — Prometheus: стандарт для контейнеров, есть у любого облачного мониторинга, а Spring Boot и
  Node.js отдают его готовыми библиотеками. `backend` — Micrometer (`micrometer-registry-prometheus`, версия из BOM
  Spring Boot), `collab` — `prom-client`. Альтернатива — OTLP-экспорт в коллектор OpenTelemetry. Отклонено для MVP:
  ещё один сервис в стеке ради того же результата.
- Решение фиксирует ADR-0002, так как ADR-0001 стек наблюдаемости не описывает.

### `backend`

- `management.endpoints.web.exposure.include: health,prometheus`, общий тег `application=codraw-backend`.
  `/actuator/prometheus` открыт без входа, как health: снаружи его закрывает nginx, а в сети стека его читает
  Prometheus. Отдельный порт управления отклонён: пришлось бы менять проверки контейнеров и e2e, а защиты не прибавит.
- Свои метрики (Micrometer, имена через точку, в Prometheus — через подчёркивание):
  - `codraw.board.creations`, `codraw.guest.creations` — счётчики (не `…created`: суффикс `_created` в
    Prometheus зарезервирован);
  - `codraw.documents.stored` — размер сохранённого состояния документа (`DistributionSummary`, байты): и число
    сохранений, и их объём;
  - `codraw.limits.reached{limit=boards|guests|document|version}` — сработавшие пределы;
  - `codraw.guests.cleanup.deleted{kind=boards|guests}` — удалённое уборкой.
- HTTP (`http.server.requests`), JVM, Hikari, Tomcat и процесс Micrometer отдаёт сам.

### `collab`

- `/metrics` в `onRequest` рядом с `/health`; nginx проксирует только `location = /collab`, так что снаружи его нет.
- `prom-client` со своим реестром и метриками процесса (`collectDefaultMetrics`), префикс `codraw_collab_`:
  - `connections`, `documents` — текущие значения, которые считаются в момент сбора из Hocuspocus;
  - `stores_total{result=stored|failed|board_deleted}` и `store_duration_seconds` — сохранения в `backend`;
  - `rejections_total{reason}` — отказы в подключении (`permission-denied`, `no-access`, `board-not-found`) и в
    правке (`document-too-large`), а также закрытия при смене доступа (`access-changed`).
- Реестр создаётся на каждый сервер, а не глобальный: тесты поднимают несколько серверов в одном процессе.

### Журналы

- `backend` — встроенное структурированное журналирование Spring Boot: `LOGGING_STRUCTURED_FORMAT_CONSOLE=ecs` в
  `docker-compose.prod.yml`. В разработке остаётся обычный текст.
- `collab` — модуль `log.ts`: `LOG_FORMAT=json` даёт строку JSON с полями ECS (`@timestamp`, `log.level`, `message`,
  `error.type`, `error.message`, `error.stack_trace` и свои поля), без неё — прежний вывод в консоль. Сообщения
  самого Hocuspocus остаются текстом: в продакшене он запускается с `quiet`, так что это только ошибки обработки.

### Мониторинг в стеке

- Сервис `prometheus` в `docker-compose.prod.yml` под профилем `monitoring`: без профиля стек прежний. Конфигурация
  и правила — `deploy/prometheus/prometheus.yml` и `alerts.yml`, данные — том, порт 9090 — только на `127.0.0.1`
  сервера.
- Правила: цель недоступна 2 минуты; доля ответов 5xx `backend` больше 5% 10 минут; хоть одно неудачное сохранение
  документа за 10 минут; запросы ждут соединения с базой 5 минут.
- Конфигурация и правила проверяются `promtool` в CI задачей `images`.

## Risks / Trade-offs

- [Метрики без входа во внутренней сети] → в них нет данных пользователей, только счётчики; сеть стека закрыта.
- [Счётчики живут в памяти процесса] → после перезапуска начинаются с нуля, Prometheus это учитывает в `rate` и
  `increase`.
- [JSON-журналы хуже читать глазами в `docker compose logs`] → переменные журналов можно убрать из окружения, тогда
  вывод снова текстовый.

## Migration Plan

Схема не меняется. Новые переменные журналов действуют после пересоздания контейнеров. Мониторинг включается
`docker compose -f docker-compose.prod.yml --profile monitoring up -d`.
