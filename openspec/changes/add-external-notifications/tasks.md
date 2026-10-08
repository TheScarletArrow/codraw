# Tasks

## 1. Каналы и настройки

- [x] 1.1 backend: миграция V20 и откат U20 — `notification_channels`, `notification_board_mutes`, `notification_deliveries` с проверками и индексами; проверка: `MigrationsTest`
- [x] 1.2 backend: настройки `codraw.notifications.app-url`, `email.*`, `webhook.*`, `delivery.*` и предел `confirmation-emails-per-user-per-hour`; `spring-boot-starter-mail`, тайм-ауты SMTP; `EmailTransport` через SMTP и доступность почты и чата; проверка: сборка, тесты доступности
- [x] 1.3 backend: `GET /api/notification-settings`, `PUT`/`DELETE` каналов почты и чата, проверка адресов и хостов вебхуков, подсказка вместо адреса вебхука, 403 гостю, 404 недоступному каналу; проверка: `NotificationSettingsApiTest`
- [x] 1.4 backend: письмо подтверждения, `confirm` и `resend`, срок токена, предел писем с 429; проверка: `NotificationSettingsApiTest`
- [x] 1.5 backend: `PUT`/`DELETE /api/boards/{id}/notification-mute` и список отключённых досок; проверка: `NotificationSettingsApiTest`

## 2. Доставка

- [x] 2.1 backend: постановка в очередь в транзакции уведомления (`Notifications.add` и `addReviewRequest` с `RETURNING`, группы событий, каналы, отключённые доски); проверка: `NotificationDeliveryTest`
- [x] 2.2 backend: `NotificationDelivery` — задача по расписанию, захват `FOR UPDATE SKIP LOCKED` с арендой, проверки перед отправкой (прочитано, настройки, доступ), повторы, отказ получателя, состояние канала, метрика; проверка: `NotificationDeliveryTest`
- [x] 2.3 backend: `NotificationMessages` (тексты и ссылки как в колокольчике, экранирование для чата), письмо с `List-Unsubscribe`, `WebhookSender` без перенаправлений, «Проверить»; проверка: `NotificationMessagesTest`, `NotificationDeliveryTest`
- [x] 2.4 backend: запись писем профиля `e2e` и `GET /api/e2e/emails`; проверка: `TestLoginTest`

## 3. Интерфейс

- [x] 3.1 frontend: `api/notificationSettings.ts`, страница `/settings/notifications` (почта, чат, отключённые доски, подтверждение по ссылке, состояние и ошибки, гость); проверка: тесты страницы
- [x] 3.2 frontend: ссылка «Настройки уведомлений» в колокольчике; пункт «Не присылать уведомления» / «Присылать уведомления» в меню доски; проверка: тесты `NotificationBell` и `BoardPage` (читатель отключает и включает уведомления доски)

## 4. Проверка и документация

- [x] 4.1 e2e: участник подтверждает почту по ссылке из письма, получает письмо об упоминании, которое ведёт к ветке, отключает доску и не получает следующего; вебхук получает пробное сообщение, а его адрес не возвращается; проверка: `external-notifications.spec.ts` зелёный, `notifications.spec.ts` зелёный
- [x] 4.2 ADR-0008, README, `docs/deploy.md`, `docs/running.md`, `.env.prod.example`, `docker-compose.prod.yml`; «Что нового» 0.13.0 и версия приложения; политика конфиденциальности; проверка: тесты «Что нового» и политики, `openspec validate --all --strict`
