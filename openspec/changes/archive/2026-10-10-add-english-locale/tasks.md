# Tasks

## 1. Инфраструктура

- [x] 1.1 frontend: `i18n/i18n.ts` — языки, определение по браузеру и `localStorage`, `defineMessages`, `pluralRu`,
  `pluralEn`, `perLocale`, `chooseLocale` с перезагрузкой; `test/setup.ts` — русский после каждого теста; проверка:
  `i18n/i18n.test.ts`
- [x] 1.2 frontend: `i18n/dictionaries.test.ts` (полнота словарей) и `i18n/hardcodedText.test.ts` (строки мимо
  словарей) с исключениями `i18n/allowedRussian.ts`
- [x] 1.3 frontend: `i18n/LanguageMenu.tsx` в меню пользователя (`Layout.tsx`); `api/http.ts` — `Accept-Language`;
  проверка: `LanguageMenu.test.tsx`, `Layout.test.tsx`
- [x] 1.4 e2e: `locale: 'ru-RU'` в `playwright.config.ts` и `playwright.stack.config.ts`

## 2. Перенос строк фронтенда

- [x] 2.1 frontend: `diagram/` — палитра, фигуры, меню холста, цвета, легенда, горячие клавиши, панели и инструменты
- [x] 2.2 frontend: `board/`, `boardList/`
- [x] 2.3 frontend: `pages/`, `workspaces/`, `theme/`, `Layout.tsx`
- [x] 2.4 frontend: импорты и экспорт — `sql/`, `infra/`, `architecture/`, `apiSpec/`, `mermaid/`, `drawio/`, `image/`
- [x] 2.5 frontend: `decisions/`, `elements/`, `templates/`, `comments/`
- [x] 2.6 frontend: `issues/`, `links/`, `views/`, `notifications/`, `proposals/`, `checks/`, `edgeApi/`,
  `libraries/`, `lib/` (относительное время), `embed/`, `offline/`, `errors/`
- [x] 2.7 frontend: «Что нового» — новинки на двух языках, даты по языку; проверка: `whatsNew.test.ts`
- [x] 2.8 frontend: правовые страницы `*.ru.tsx`/`*.en.tsx`, язык в политике конфиденциальности; проверка:
  `LegalPages.test.tsx`
- [x] 2.9 frontend: сторож без замечаний — все строки в словарях или в исключениях с причиной

## 3. Backend

- [x] 3.1 backend: миграция V28/U28 `users.language`; проверка: `UserLanguageMigrationTest`
- [x] 3.2 backend: `Language`, `language` в `/api/me`, `PUT /api/me/language`, имя гостя по `Accept-Language`;
  проверка: `LanguageTest`, `UserAuthApiTest`
- [x] 3.3 backend: `NotificationWords`, язык получателя в `NotificationDelivery` и `NotificationSettingsService`;
  проверка: `NotificationMessagesTest`
- [x] 3.4 backend: заглушка встроенной картинки и обратная ссылка задачи GitHub на языке запроса; проверка:
  `GitHubClientTest`
- [x] 3.5 frontend: `api/auth.ts` — `saveLanguage`, `Layout.tsx` сообщает язык, отличный от сохранённого

## 4. Документация и проверка

- [x] 4.1 e2e: английский интерфейс по языку браузера и переключатель «Язык»
- [x] 4.2 README (возможности, раздел «Языки интерфейса», пункт плана), «Что нового» 0.31.0, версия фронтенда 0.31.0
- [x] 4.3 Проверки: backend, typecheck, lint, vitest, сборка frontend и collab, e2e, `openspec validate --strict`
