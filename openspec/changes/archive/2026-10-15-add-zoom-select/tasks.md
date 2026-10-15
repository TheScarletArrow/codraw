# Tasks

## 1. frontend

- [x] 1.1 frontend: список «Масштаб» вместо кнопки с процентом в `EditorToolbar.tsx` — уровни 25–400 %, текущий масштаб между ними на своём месте, выбор через `editor.zoomTo`; `zoomActual` убран из `DiagramEditor`; проверка: `EditorToolbar.test.tsx`, `BoardPage.test.tsx`
- [x] 1.2 frontend: абзац темы справки «Мини-карта и масштаб», «Что нового» 0.50.0 и версия в `package.json`; проверка: тесты словарей, справки и версий, `typecheck`, `lint`, `test`

## 2. e2e

- [x] 2.1 e2e: выбор 200 % в «Масштабе» держит середину вида и не меняет масштаб другого участника, а 167 % после «Уменьшить» стоит в списке на своём месте (`arrange.spec.ts`); масштаб читается из списка в `arrange.spec.ts` и `public-view.spec.ts`

## 3. Документация

- [x] 3.1 `docs/running.md`, README (раздел «Масштаб», пункт 128 «Плана работ»); проверка: `openspec validate --all --strict`
