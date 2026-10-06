# Design

## Context

`copyCells` клонирует ячейки в буфер вкладки (`clipboard.put(clones, text)`) и пишет `clipboardText(clones)` —
закодированный `<mxGraphModel>` — в `text/plain`: в событие `copy` или через `navigator.clipboard.writeText` (меню).
Вставка берёт буфер вкладки, если `text/plain` совпадает с записанным текстом, иначе разбирает текст
(`readClipboardText`: draw.io, Mermaid, иначе текст). «Вставить» из меню читает только `readText`. Выгрузка SQL —
`schemaSql(diagramSchema(cells))`, импорт — `parseSql` и `schemaCells`.

## Goals / Non-Goals

**Goals:**

- Таблицы снаружи — SQL, внутри CoDraw — те же ячейки, что раньше, в любой вкладке и браузере.

**Non-Goals:**

- SQL для смеси таблиц и других фигур: она копируется в формате draw.io, как раньше.
- Вставка таблиц CoDraw в draw.io через буфер: draw.io получит SQL; таблицы переносит экспорт `.drawio`.
- SQL других СУБД: текст — PostgreSQL, как у «Скопировать SQL».

## Decisions

### Два формата буфера

- `clipboardContent(cells)` в `clipboardFormat.ts` возвращает `{ text, html }`. Если вершины верхнего уровня — только
  таблицы, а `diagramSchema` их данных даёт хотя бы одну таблицу (базовые она пропускает): `text` — `schemaSql`, `html`
  — `<meta charset="utf-8"><pre data-codraw="…">SQL</pre>`, где атрибут — тот же закодированный `<mxGraphModel>`, что
  сейчас уходит в `text/plain`, а SQL экранирован. Иначе `text` — `<mxGraphModel>`, `html` — `null`.
- Атрибут, а не комментарий или скрытый элемент: редакторы с форматированием (Google Docs, Notion) вставляют видимое
  содержимое — блок SQL, — а браузеры сохраняют атрибуты в `text/html` между вкладками и программами.
- Альтернатива — свой MIME-тип (`application/x-codraw`). Отклонено: `DataTransfer` переносит его только внутри одного
  браузера, а Clipboard API пишет такие типы только в Chromium (`web …`).

### Запись и чтение

- `copy`/`cut`: `setData('text/plain', text)` и, если есть, `setData('text/html', html)`. Меню:
  `writeSystemClipboard(text, html)` через `navigator.clipboard.write` с `ClipboardItem`, без него — `writeText`.
- Буфер вкладки по-прежнему хранит клоны и `text`; совпадение `text/plain` с ним вставляет клоны без разбора.
- `paste(at, text, html)`: если в `html` есть `data-codraw` (читается `DOMParser`, без выполнения кода), его значение
  разбирается, как текст draw.io, иначе — `text`. «Вставить» из меню читает `navigator.clipboard.read()` (`text/html`
  и `text/plain`), без него или при отказе — `readText`.
- `readClipboardText`: после draw.io и Mermaid — SQL: `parseSql(text)` с хотя бы одной таблицей даёт
  `{ kind: 'diagram', cells }` из `schemaCells`, как вставка Mermaid (центр видимой области или точка щелчка); иначе
  текст.

## Risks / Trade-offs

- [«Вставить» из меню в браузере без `clipboard.read()` получает только SQL] → таблицы появятся из SQL, но без стиля,
  положения и СУБД; Ctrl+V переносит всё.
- [Safari и Firefox спрашивают разрешение на `clipboard.read()`] → так же, как сейчас на `readText`.
- [Чужой HTML с `data-codraw`] → значение проходит тот же разбор draw.io, что и вставленный текст, и даёт только ячейки.
