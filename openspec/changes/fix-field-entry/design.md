# Design

## Context

Редактор подписи maxGraph заканчивает ввод по F2 или, если `graph.isEnterStopsCellEditing()`, по Enter; в CoDraw это
выключено, потому что у фигур многострочные подписи. Поэтому Enter в поле таблицы вставляет перенос строки, а ввод
заканчивается только уходом фокуса. `renameField(text, entered)` берёт введённое больше имени текстом поля как есть;
`splitField` при этом читает его верно (`not null` → `notNull`), а `fieldText` пишет поле в виде CoDraw.

## Goals / Non-Goals

**Goals:**

- Поле вводится одной строкой и сразу показывается колонками; текст поля — в виде CoDraw.

**Non-Goals:**

- Связь из `REFERENCES users(id)`, введённого в поле: текст остаётся текстом, связь проводят мышью.
- Enter у подписей других фигур: они многострочные, Enter переносит строку, как раньше.
- Создание следующего поля по Enter.

## Decisions

- `cellEditor.isStopEditingEvent` — исходная проверка или Enter без Shift и Ctrl, когда правится поле таблицы,
  таблица или строка индекса из `add-table-indexes`, если она уже есть (`isColumnField`, `isTable`, `isIndexRow`).
  Альтернатива — `graph.setEnterStopsCellEditing(true)`. Отклонено: Enter перестал бы переносить строки в подписях
  фигур.
- `renameField`: введённое больше имени становится `normalizeField(entered)` — `fieldText(splitField(entered))` с
  остатком, в котором ключевые слова вне скобок и строк написаны в верхнем регистре (`DEFAULT`, `CHECK`, `COLLATE`,
  `GENERATED`, `ALWAYS`, `BY`, `AS`, `IDENTITY`, `STORED`, `REFERENCES`, `ON`, `DELETE`, `UPDATE`, `CASCADE`,
  `RESTRICT`, `SET`, `NULL`, `NO`, `ACTION`). Имя, тип, выражения и строки — как введены. Ввод одного имени, как и
  раньше, меняет только имя.
- `fieldText` не меняется: правка через панель (`setFieldProps`) сохраняет остаток поля как есть.

## Risks / Trade-offs

- [Имя столбца или функции из списка ключевых слов в остатке, например `DEFAULT set`] → только слова вне скобок и
  строк; такие имена в `DEFAULT` редки и остаются верными SQL в любом регистре.
