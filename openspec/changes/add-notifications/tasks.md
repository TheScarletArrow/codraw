# Tasks

## 1. backend: уведомления

- [x] 1.1 backend: миграция `V10`/`U10` — `notifications`; проверка: `MigrationsTest` применяет V10, откатывает U10 и применяет снова, известный вид, комментарий ровно у упоминания и ответа, роль ровно у уведомлений о доступе, не самому себе, одно на комментарий и получателя, уходит с доской, комментарием и получателем, а автор становится `NULL`
- [x] 1.2 backend: `Notifications` и `NotificationService` — запись уведомлений всех видов без действовавшего, упоминание выигрывает у ответа, замена и отмена уведомления о запросе, отметка при ответе, предел `codraw.limits.notifications-per-user`; страницы с проверкой доступа, число непрочитанных, прочтение; проверка: интеграционные тесты `NotificationApiTest` и `LimitsApiTest`
- [x] 1.3 backend: вызовы из `CommentService` (новый комментарий, правка), `AccessRequestService` (запрос, отмена, ответ, отказ), `BoardMemberService.give` и `BoardService.transferOwnership`; проверка: интеграционные тесты `NotificationApiTest`
- [x] 1.4 backend: `NotificationController` — `/api/notifications`, `/unread-count`, `/{id}/read`, `/read-all`, только свои, CSRF; проверка: интеграционные тесты `NotificationApiTest`
- [x] 1.5 backend: `NotificationCleanup` по `codraw.notifications.cleanup-cron` со сроком `codraw.notifications.retention`; проверка: тесты `NotificationApiTest` и `NotificationCleanupScheduleTest`
- [x] 1.6 backend: перенос уведомлений гостя при входе и уборка гостей; проверка: тесты `NotificationApiTest` и `GuestCleanupTest`
- [x] 1.7 backend: сроки уведомлений в `GET /api/legal`; проверка: `LegalApiTest`

## 2. frontend

- [x] 2.1 frontend: `api/notifications.ts`, тексты, ссылки и давность уведомлений; проверка: unit-тесты `notifications.test.ts`
- [x] 2.2 frontend: колокольчик в шапке — число с опросом, список со страницами, переход и прочтение, «Прочитать все»; проверка: компонентные тесты `NotificationBell` и `Layout`
- [x] 2.3 frontend: страница доски открывает панель комментариев на ветке по `?thread=` и «Поделиться» по `?share=requests`; панель выделяет одну ветку и выбирает её фильтр; проверка: тесты `BoardPage` и `CommentsPanel`
- [x] 2.4 frontend: политика конфиденциальности — уведомления, получатель и сроки установки; проверка: тест `LegalPages`

## 3. Сквозная проверка и документация

- [x] 3.1 e2e: Зоя упоминает Илью, Илья на списке досок видит число, открывает уведомление и попадает на ветку, отвечает — Зоя получает уведомление об ответе, «Прочитать все» убирает число; запрос доступа ведёт владельца в «Поделиться», а отказ доходит до просившего без названия доски; проверка: job e2e зелёный в CI
- [x] 3.2 README («Уведомления», «Комментарии», «Запросы доступа», «Пределы», «Персональные данные», «План работ»), `docs/running.md`, `docs/deploy.md` и `docker-compose.prod.yml` с настройками; проверка: документация описывает уведомления и их пределы
