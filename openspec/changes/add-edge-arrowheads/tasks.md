# Tasks

## 1. Наконечники

- [x] 1.1 frontend: `diagram/edgeMarkers.ts` — новые наконечники и порядок `EDGE_MARKERS`, полые `diamondHollow` и
  `ovalHollow`, общий `markerOf` для полых, `MARKER_KEYS` с размером, `swappedMarkers`; названия в
  `edgeMarkers.messages.ts`; проверка: `edgeMarkers.test.ts`, `.drawio` туда и обратно
- [x] 1.2 frontend: `diagram/extensions.ts` — маркеры `dash` и `cross` по геометрии draw.io; проверка:
  `extensions.test.ts` (регистрация всех наконечников, путь черты и креста, конец связи не сдвигается)

## 2. Редактор

- [x] 2.1 frontend: `diagram/editor.ts` — `setEdgeMarkers` и `swapEdgeMarkers` одним шагом отмены, в
  `CHANGING_COMMANDS`; `test/fakeEditor.ts`; проверка: тесты редактора (оба конца, перестановка с заливкой и размером,
  терминалы не меняются, закреплённые, отмена)

## 3. Панель

- [x] 3.1 frontend: `diagram/EdgeMarkerPicker.tsx` — кнопка «Стрелки» с образцом, «Направление», сетки начала и конца,
  «Поменять местами»; `EditorToolbar.tsx` — кнопка после «Стиля» вместо списков; тексты в `pickers.messages.ts`;
  проверка: `EditorToolbar.test.tsx`

## 4. Документация и проверка

- [x] 4.1 Справка (`help/topics.messages.ts`), «Что нового» 0.53.0, версия фронтенда 0.53.0, README (возможности,
  пункт плана 130)
- [x] 4.2 e2e: `shapes.spec.ts` — наконечники через окно «Стрелки» у двух участников, «В обе стороны»
- [x] 4.3 `openspec validate --all`, typecheck, lint, тесты, `vite build`, проверка в приложении

## Workflow follow-up

- Архивировать изменение (`openspec archive add-edge-arrowheads`) и проверить основные спецификации.
