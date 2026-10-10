# Tasks

## 1. Модель и редактор

- [x] 1.1 frontend: `diagram/edgeApi.ts` — данные описания, ключ `codrawApi`, разбор недоверенного значения с пределами, запись, подпись «МЕТОД /путь», параметры из пути, OpenAPI; проверка: unit-тесты, в том числе неверный JSON, чужой метод, слишком длинное значение
- [x] 1.2 frontend: `diagram/editor.ts` — состояние `edgeApi`, команда `setEdgeApi` (одна связь, не закреплённая, подпись по описанию, один шаг отмены, `CHANGING_COMMANDS`); `test/fakeEditor.ts`, `useEditorState.ts`; проверка: тесты редактора — шаг отмены, второй участник, подпись, закреплённая, просмотр
- [x] 1.3 frontend: «описание API» в описании изменений версии (`board/changes.ts`); проверка: тест описаний

## 2. Файлы

- [x] 2.1 frontend: атрибут `codrawApi` в `.drawio` и буфере обмена (`drawio/style.ts`, `serialize.ts`, `parse.ts`); проверка: тесты обмена и разбора

## 3. Интерфейс

- [x] 3.1 frontend: пункт «Описание API…» в меню связи (`diagram/canvasMenu.ts`, `CanvasMenu.tsx`); проверка: тесты меню
- [x] 3.2 frontend: панель `edgeApi/EdgeApiPanel.tsx` — просмотр, форма, удаление, копирование как OpenAPI; подключение в `pages/BoardPage.tsx` и `pages/ProposalPage.tsx`; проверка: компонентные тесты

## 4. Документация

- [x] 4.1 docs: README (возможности, пункт плана), «Что нового» 0.8.0 и `version` в `frontend/package.json`; проверка: тесты «Что нового»
