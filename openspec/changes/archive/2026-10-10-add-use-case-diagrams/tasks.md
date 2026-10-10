# Tasks

## 1. Фигуры раздела

- [x] 1.1 frontend: `diagram/shapes.ts` — раздел «UML: варианты использования», группа `usecase`, пресеты `uml-actor`,
  `uml-use-case`, `uml-system-boundary` (в `UNGROUPED_SHAPES`); `ShapeIcon.tsx` — значки; `shapeSearch.ts` — слова
  поиска; проверка: тесты `shapes.test.ts`, `shapeSearch.test.ts`, `ShapePalette.test.tsx`, `quickConnect.test.ts`

## 2. Маркеры и отношения

- [x] 2.1 frontend: `diagram/extensions.ts` — «Открытая стрелка» и «Полый треугольник» в `EDGE_MARKERS` с заливкой;
  `editor.ts` — `markerOf` и `setEdgeMarker` с `…Fill`; проверка: тесты маркеров редактора и `.drawio` туда и обратно
- [x] 2.2 frontend: `diagram/useCase.ts` — `relationOf`, `relationChanges`, стереотипы; проверка: unit-тесты узнавания
  подписей `«include»`, `<<extend>>`, `include` и стилей из draw.io
- [x] 2.3 frontend: `editor.ts` — `edgeRelation` в состоянии, `setEdgeRelation` одним шагом отмены, ассоциация у новых
  связей актёр — вариант использования (`ConnectionHandler.insertEdge`, `addConnectedShape`); `EditorToolbar.tsx` —
  «Отношение»; `test/fakeEditor.ts`; проверка: тесты редактора (отмена, закреплённые, разные отношения, видимость) и
  панели
- [x] 2.4 frontend: `diagram/legend.ts` — заливка в ключе и названия «открытая стрелка», «полый треугольник»; проверка:
  тесты легенды

## 3. Шаблон

- [x] 3.1 frontend: `templates/templates.ts` — «Варианты использования» через `relationChanges`; проверка:
  `templates.test.ts` и карточки шаблонов

## 4. Документация и проверка

- [x] 4.1 README (возможности, раздел «Диаграммы вариантов использования», пункт плана 97), «Что нового» 0.29.0, версия
  фронтенда 0.29.0
- [x] 4.2 e2e: `use-case-diagrams.spec.ts` — актёр и вариант использования у двух участников, ассоциация без стрелки,
  «Отношение», `.drawio` туда и обратно
- [x] 4.3 `openspec validate --all`, typecheck, lint, тесты, `vite build`

## Workflow follow-up

- Архивировать изменение (`openspec archive add-use-case-diagrams`) и проверить основные спецификации.
- Открыть PR, связанный с issue #153.
