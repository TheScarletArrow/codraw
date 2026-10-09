# Tasks

## 1. Правила без maxGraph

- [x] 1.1 frontend: `diagram/impact.ts` — узлы, связи-зависимости с правилом каналов, область на N шагов, все кратчайшие
  пути, сводка по доске с местами, имя ячейки; проверка: unit-тесты

## 2. Холст

- [x] 2.1 frontend: `diagram/impactView.ts` и `diagram/editor.ts` — роли, хук стиля, пересчёт, `showDependencies`,
  `showPathBetween`, `clearImpact`, `canAnalyze`, `canShowPath`, состояние `impact`, изображение без анализа;
  `test/fakeEditor.ts`; проверка: тесты редактора

## 3. Интерфейс

- [x] 3.1 frontend: меню (`diagram/canvasMenu.ts`, `CanvasMenu.tsx`) и панель `board/ImpactPanel.tsx` в `BoardPage` и
  `ProposalPage`; проверка: тесты меню и панели

## 4. Документация и проверка

- [x] 4.1 docs: README (возможности, раздел «Анализ влияния»), «Что нового» и `version`; проверка: тесты «Что нового»
- [x] 4.2 e2e: `impact-analysis.spec.ts` и списки меню в `context-menu.spec.ts`; проверка: `pnpm --filter @codraw/e2e
  typecheck` и прогон
- [x] 4.3 Проверка: `pnpm typecheck`, `pnpm lint`, `pnpm --filter @codraw/frontend test`, `pnpm --filter
  @codraw/frontend build`, `openspec validate --all --strict`

## Workflow follow-up

- Архивировать изменение после проверки.
