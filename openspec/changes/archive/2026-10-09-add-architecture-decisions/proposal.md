# Proposal

## Why

Почему выбрали Kafka, а не RabbitMQ, сейчас остаётся в ветке комментариев, которую отмечают «Решено» и забывают, или в
документе, никак не связанном со схемой. Сам CoDraw ведёт решения в `docs/adr` — рядом с кодом, но не рядом со схемой.
Это шаг эпика «проектирование архитектуры систем» (#81), задача #92.

**До:** решение и его причины — вне доски или в забытой ветке комментариев.

**После:** у доски — решения в формате MADR, привязанные к элементам схемы, со значком у элемента, обсуждением,
выгрузкой файлами MADR и импортом папки `docs/adr`.

## What Changes

- `backend`: таблицы `decisions` и `decision_elements` (V21/U21), ветки комментариев с `decision_id`; API
  `/api/boards/{id}/decisions` — список, решение, новое (со следующим номером или номером файла), изменение, элементы,
  удаление; права как у правки доски, чтение — всем участникам; предел `codraw.limits.decisions-per-board` (500) с
  метрикой; решения гостя переходят к вошедшему.
- `collab`: сообщение `decisions-changed`, как `comments-changed`.
- `frontend`: кнопка и панель «Решения» с фильтром по статусу, формой MADR, элементами решения, предложением элементов
  «Нужно ревью» и обсуждением ветками комментариев; значки решений у элементов; выгрузка `.md` и `.zip`, импорт папки и
  файлов MADR; обсуждения решений вне панели комментариев, уведомление о них открывает решение.
- Политика конфиденциальности называет решения с их авторами.

## Capabilities

### New Capabilities

- `architecture-decisions`: решения доски, права, элементы, значки, панель, обсуждение, файлы MADR и импорт.

### Modified Capabilities

- `comments`: ветка обсуждения решения; панель комментариев без них.
- `notifications`: переход из уведомления об обсуждении решения к решению.
- `legal-pages`: решения в политике конфиденциальности.

## Impact

- `backend`: `decision/` (`Decisions`, `DecisionService`, `DecisionController`), миграции V21/U21, `comment/`
  (`decisionId` веток), `LimitProperties`, `CodrawMetrics`, `UserService`; тесты API и миграций.
- `collab`: `messages.ts`, `server.ts`.
- `frontend`: `api/decisions.ts`, `decisions/`, `lib/zip.ts`, `comments/` (`useThreadActions`, ветка решения),
  `board/useBoardConnection.ts`, `diagram/editor.ts` (`selectedCellIds`), `BoardPage`, политика; «Что нового» 0.18.0.
- `docs/deploy.md`, `docker-compose.prod.yml`: `CODRAW_LIMITS_DECISIONS_PER_BOARD`.
- Новых зависимостей нет: ZIP без сжатия пишется своим кодом.
- Вне рамок: синхронизация с репозиторием (коммит ADR из CoDraw), шаблоны, кроме MADR, отображение Markdown.
