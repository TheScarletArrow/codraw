# Tasks

## 1. Отметки и виды

- [x] 1.1 frontend: `diagram/plan.ts` — отметки, виды, параметр адреса, общая отметка выделения; проверка: unit-тесты
- [x] 1.2 frontend: `diagram/planView.ts` — хук стиля разницы, скрытие видов со связями и вложенным, запрет выделения
  скрытого, пересчёт по правкам; `diagram/editor.ts` — `setPlan`, `setPlanView`, `applyTargetState`, состояния;
  проверка: тесты редактора — отметки одним шагом отмены, разница, виды у одного участника, экспорт, чужая отметка,
  применение целевого состояния, «Просмотр»

## 2. Меню, панель и страницы

- [x] 2.1 frontend: `canvasMenu.ts`, `CanvasMenu.tsx` — группа «Изменение»; проверка: тесты меню
- [x] 2.2 frontend: `PlanViewPicker.tsx`, `EditorToolbar`, `board/usePlanView.ts`, `BoardPage`, `ProposalPage`;
  `renderPage.ts`, `image/pdf.ts`; проверка: компонентные тесты и тест хука

## 3. Документация и проверка

- [x] 3.1 README, «Что нового» 0.17.0, версия фронтенда
- [x] 3.2 e2e: `architecture-plan.spec.ts` — разница у двух участников, личный вид в адресе, применение и отмена
- [x] 3.3 `openspec validate --all`, typecheck, lint, тесты фронтенда
