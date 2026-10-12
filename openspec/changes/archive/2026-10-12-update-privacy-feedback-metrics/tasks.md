# Tasks

## 1. frontend

- [x] 1.1 frontend: `legal/PrivacyPage.ru.tsx` — пункты «Обратная связь» и «Дни активности и статистика» в «Какие данные мы обрабатываем», отзывы в «Технических данных», начало текста отзыва в «Журнале администраторов», «Зачем», «Cookie» (нет сторонней аналитики), сроки отзывов (`adminRetentionDays`) и статистики (`STATISTICS_RETENTION_DAYS` в `legal/LegalPage.tsx`), получатели, выгрузка и удаление учётной записи; дата `PRIVACY_UPDATED` 2026-10-12 в `legal/PrivacyPage.tsx`; комментарий к `adminRetentionDays` в `api/legal.ts`; проверка: `LegalPages.test.tsx` (пункты, срок 180 дней из установки, 42 дня, получатели, выгрузка, удаление, дата)
- [x] 1.2 frontend: `legal/PrivacyPage.en.tsx` — то же по-английски, как перевод русской версии; проверка: `LegalPages.test.tsx` (английская политика с отзывами, статистикой, 42 днями и без кириллицы), `pnpm --filter @codraw/frontend typecheck`, `lint`, `test`

## 2. Документация

- [x] 2.1 README: отзывы и дни активности в разделе «Персональные данные», пункт 119 «Плана работ»; проверка: строки README, которые меняют `add-feedback` и `add-product-metrics`, не задеты (`git diff origin/main origin/<ветка> -- README.md`), `openspec validate --all --strict`
