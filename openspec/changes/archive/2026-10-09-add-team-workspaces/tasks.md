# Tasks

## 1. Модель и пространства

- [x] 1.1 backend: миграция V26 и откат U26 — `workspaces`, `workspace_members`, `workspace_invites`, `workspace_projects`, столбцы `boards.workspace_id`, `project_id`, `workspace_access` с проверками и индексами; проверка: `WorkspaceMigrationTest`
- [x] 1.2 backend: пределы `workspaces-per-user`, `members-per-workspace`, `invites-per-workspace`, `projects-per-workspace`, `boards-per-workspace` и метки метрики; проверка: `WorkspaceApiTest`
- [x] 1.3 backend: пакет `workspace` — создание, список, переименование, участники с полномочиями и последним владельцем, приглашения и их принятие, проекты; 403 гостю, 404 не участнику; проверка: `WorkspaceApiTest`

## 2. Права на доски пространства

- [x] 2.1 backend: `Board.roleOf` с ролью в пространстве и `workspaceAccess`, `BoardService.roleOf`, управление по роли `owner` (`ownedBy`), `workspaceAccess` в `PATCH /api/boards/{id}`, `workspace`, `projectId` и `workspaceAccess` в ответе доски; проверка: `WorkspaceBoardApiTest`
- [x] 2.2 backend: роль в пространстве во всех расчётах роли по строкам базы — общие доски, уведомления и заглушённые доски, удовлетворённые запросы, забывание без доступа, проверяющие предложений, упоминания, поиск, «Открывали по ссылке», исключения для участников пространства, передача владения; проверка: `WorkspaceBoardApiTest`
- [x] 2.3 backend: `GET /internal/boards/{id}/access` и доступ черновиков с `workspace`; проверка: `BoardAccessApiTest`
- [x] 2.4 collab: `BoardAccess.workspace` и правило в `accessOf`, проверка соединений; проверка: тесты `server.test.ts`

## 3. Доски, перенос, удаление

- [x] 3.1 backend: доски пространства — создание, список, `PUT /api/boards/{id}/workspace` (в пространство, в личные, в проект), личный список и предел только личных досок, корзина досок пространства; проверка: `WorkspaceBoardApiTest`
- [x] 3.2 backend: удаление и уход участника (наследник досок, снятие личных ролей, забывание без доступа) и удаление пространства (доски в корзину удалившего); проверка: `WorkspaceApiTest`, `WorkspaceBoardApiTest`

## 4. Интерфейс

- [x] 4.1 frontend: `api/workspaces.ts`; раздел «Пространства» и «Создать пространство» на главной, «Перенести в пространство» в меню доски; проверка: тесты `BoardsPage`
- [x] 4.2 frontend: страница `/workspaces/:id` — проекты, доски, создание доски, меню доски, участники, приглашения, уход и удаление; страница `/workspace-invite/:token`; проверка: тесты `WorkspacePage`, `WorkspaceInvitePage`
- [x] 4.3 frontend: «Доступ участникам пространства» и «Добавить участника пространства» в окне «Поделиться», пространство в шапке доски и в корзине; проверка: тесты `ShareButton`, `BoardTrash`

## 5. Проверка и документация

- [x] 5.1 e2e: владелец создаёт пространство и приглашает редактора, переносит туда доску, редактор правит её, ограничение доступа делает его соединение только для чтения, удаление из пространства закрывает доступ; проверка: `team-workspaces.spec.ts` зелёный
- [x] 5.2 README, политика конфиденциальности, «Что нового» 0.27.0 и версия приложения; проверка: тесты «Что нового» и политики, `openspec validate --all --strict`
