# Tasks

## 1. Backend и collab

- [x] 1.1 backend: миграции V25/U25 — `issue_tracker_connections`, `issue_links`, `issue_creations`; проверка:
  `IssueLinkMigrationTest`
- [x] 1.2 backend: `issue/GitHubClient` — запросы только к API установки, перенаправления в его пределах, разбор задач,
  ошибки GitHub; проверка: `GitHubClientTest`
- [x] 1.3 backend: подключение, поиск и просмотр задач своим токеном, отметка отвергнутого токена; проверка:
  `IssueTrackerApiTest`
- [x] 1.4 backend: привязка, создание с `requestId` и ссылкой обратно, обновление токеном привязавшего, передача
  привязки, отвязка, предел и метрика; проверка: `IssueLinkApiTest`
- [x] 1.5 backend: вебхук задач с подписью, повторы и порядок событий, перенос и удаление; `issues` в `/api/legal`;
  проверка: `GitHubWebhookApiTest`, `LegalApiTest`
- [x] 1.6 collab: `issues-changed`; проверка: тест сервера

## 2. Frontend

- [x] 2.1 `api/issues.ts`, `issues/issues.ts` (разбор ссылок, статусы, устаревшие привязки, ошибки); проверка: unit-тесты
- [x] 2.2 `IssueLinkList`, `AddIssue` (привязка и создание), `IssuesPanel`, `IssueBadges`, `ThreadIssues`; проверка:
  компонентные тесты
- [x] 2.3 пункт меню «Задачи…», `BoardPage`, `useBoardConnection`, `ThreadCard`; проверка: тест меню
- [x] 2.4 страница «Подключения» и ссылка в шапке; проверка: тест страницы

## 3. Документация и проверка

- [x] 3.1 ADR-0009, README, `docs/deploy.md`, `docker-compose.prod.yml`, `.env.prod.example`, политика
  конфиденциальности, «Что нового» 0.25.0, версия фронтенда
- [x] 3.2 `./gradlew build`, typecheck, lint, тесты и сборка `frontend` и `collab`
