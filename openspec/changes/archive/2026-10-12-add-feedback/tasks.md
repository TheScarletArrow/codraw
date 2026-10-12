# Tasks

## 1. backend

- [x] 1.1 backend: миграция `V31__claude_beautiful_wright_pbif75_feedback.sql` — таблица `feedback` с проверками и индексами, `RESOLVE_FEEDBACK` и цель `FEEDBACK` в проверках `admin_actions`; откат `U31`; проверка: `FeedbackMigrationTest` (вперёд, `SET NULL` автора, откат и повторный накат)
- [x] 1.2 backend: `POST /api/feedback` для любого сеанса — вид, текст, страница без параметров, версия, `User-Agent` из заголовка; пределы `feedback-per-address-per-hour` и `feedback-per-user-per-day` с метками `feedback` и `feedback-per-user`; счётчик `codraw.feedback.received{kind}`; проверка: `FeedbackApiTest` (гость, 401, 400, CSRF, оба предела, метрика)
- [x] 1.3 backend: `GET /api/admin/feedback?status=` и `POST /api/admin/feedback/{id}/resolve` с записью `resolve-feedback` в журнал, уборка закрытых отзывов в `AdminCleanup` по `CODRAW_ADMIN_RETENTION`; проверка: `FeedbackApiTest` (очередь, закрытие, журнал, 403, уборка), `AdminApiTest`
- [x] 1.4 backend: отзывы в `POST /api/me/export`, перенос отзывов гостя при входе, отзыв без автора после удаления учётной записи; проверка: `FeedbackApiTest`, `AccountExportApiTest`, `AccountDeletionApiTest`

## 2. frontend

- [x] 2.1 frontend: `feedback/` — кнопка «Обратная связь» в шапке `Layout` с окном отзыва (вид, текст до 4000, что приложится, успех, предел, ошибка, текст после закрытия), пункт в меню «Тема» на телефоне; проверка: `FeedbackButton.test.tsx`
- [x] 2.2 frontend: вкладка «Отзывы» в `AdminPage` — открытые и закрытые, автор со ссылкой во вкладку «Пользователи» или «Удалённый пользователь», «Закрыть», «Закрыть отзыв» в журнале; проверка: `AdminFeedback.test.tsx`
- [x] 2.3 frontend: тема «Обратная связь» в справке, новинка «Что нового» 0.43.0 и версия 0.43.0 в `package.json`; проверка: тесты словарей, справки и версий, `pnpm --filter @codraw/frontend typecheck`, `lint`, `test`

## 3. e2e и документация

- [x] 3.1 e2e: `feedback.spec.ts` — отзыв с доски доходит до администратора, который закрывает его, и окно на телефоне без горизонтальной прокрутки; пределы отзывов в профиле `e2e`; проверка: `pnpm --filter @codraw/e2e exec tsc --noEmit` локально и прогон в CI
- [x] 3.2 README («Возможности», администрирование, выгрузка, пункт 117 «Плана работ»), `docs/deploy.md` (вкладка «Отзывы», пределы, срок хранения), `docker-compose.prod.yml`; проверка: `openspec validate --all --strict`
