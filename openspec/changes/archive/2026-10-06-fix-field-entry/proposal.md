# Proposal

## Why

Поле таблицы удобно вводить одной строкой: «Добавить поле», `id uuid not null`, Enter. Сейчас Enter в поле переносит
строку, а не заканчивает ввод: поле остаётся в правке, а следующая введённая строка склеивается с первой в одно поле.
Введённый текст к тому же хранится как набран — `id uuid not null`, `primary key` — и так попадает в `.drawio` и в
текст поля при правке.

## What Changes

- Enter заканчивает ввод имени поля, всего поля одной строкой и названия таблицы; Escape по-прежнему отменяет.
- Поле, введённое целиком, приводится к виду, в котором его пишет CoDraw: имя и тип как набраны, затем `PK` (вместо
  `primary key`), `FK`, `NOT NULL`, `UNIQUE` и остальной текст с ключевыми словами SQL в верхнем регистре:
  `email varchar(255) unique not null default ''` → `email varchar(255) NOT NULL UNIQUE DEFAULT ''`.

## Capabilities

### New Capabilities

- нет

### Modified Capabilities

- `diagram-shapes`: «Имя поля редактируется отдельно» — Enter завершает ввод, введённое поле приводится к виду CoDraw.

## Impact

- `frontend`: `sql/tableField.ts` (`normalizeField`, `renameField` приводит введённое поле к виду CoDraw), `diagram/editor.ts`
  (`isStopEditingEvent` для полей и названий таблиц).
- `backend`, `collab` не меняются; новых зависимостей нет.
