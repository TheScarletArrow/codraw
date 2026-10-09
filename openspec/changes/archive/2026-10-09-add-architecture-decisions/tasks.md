# Tasks

## 1. Backend и collab

- [x] 1.1 backend: миграции V21/U21 — `decisions`, `decision_elements`, `comment_threads.decision_id`; проверка:
  `MigrationsTest`
- [x] 1.2 backend: `decision/` — репозиторий, сервис (номера, предел, заменившее), контроллер (права, проверки,
  ProblemDetail); ветки с `decisionId`; перенос решений гостя; проверка: `DecisionApiTest`
- [x] 1.3 collab: `decisions-changed`; проверка: тест сервера

## 2. Frontend

- [x] 2.1 `api/decisions.ts`, `decisions/decisions.ts`, `decisions/madr.ts`, `lib/zip.ts`, `decisions/importDecisions.ts`;
  проверка: unit-тесты MADR туда и обратно, MADR 2–4 и русских записей, ZIP, импорта
- [x] 2.2 `DecisionsPanel`, `DecisionCard`, `DecisionForm`, `DecisionDiscussion`, `DecisionBadges`, `DecisionsButton`;
  `useThreadActions` из панели комментариев; `selectedCellIds` редактора; проверка: компонентные тесты
- [x] 2.3 `BoardPage`: панель вместо комментариев, значки, ветки решений вне комментариев, `?thread=` ветки решения,
  `decisions-changed`; проверка: тесты страницы

## 3. Документация и проверка

- [x] 3.1 README, политика конфиденциальности, `docs/deploy.md`, `docker-compose.prod.yml`, «Что нового» 0.18.0, версия
  фронтенда
- [x] 3.2 e2e: `architecture-decisions.spec.ts` — решение у двух участников с обсуждением и выгрузкой, импорт и `.zip`
- [x] 3.3 `openspec validate --all`, typecheck, lint, тесты
