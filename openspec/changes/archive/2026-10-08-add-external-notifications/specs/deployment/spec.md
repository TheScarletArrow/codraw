# Spec Delta

## ADDED Requirements

### Requirement: Почта и чаты для уведомлений

Стек `docker-compose.prod.yml` SHALL передавать `backend` из переменных окружения адрес приложения для ссылок в
сообщениях (`CODRAW_APP_URL`), SMTP-сервер (`CODRAW_SMTP_HOST`, `CODRAW_SMTP_PORT`, `CODRAW_SMTP_USERNAME`,
`CODRAW_SMTP_PASSWORD`), адрес отправителя писем (`CODRAW_MAIL_FROM`) и хосты вебхуков чатов
(`CODRAW_WEBHOOK_ALLOWED_HOSTS`). Без SMTP-сервера стек SHALL запускаться, а почта — оставаться выключенной.

#### Scenario: Стек без почты

- **WHEN** администратор запускает стек без `CODRAW_SMTP_HOST`
- **THEN** стек запускается, и страница настроек уведомлений говорит, что почта на этом сервере не настроена

#### Scenario: Стек с почтой

- **WHEN** заданы `CODRAW_APP_URL`, `CODRAW_SMTP_HOST` и `CODRAW_MAIL_FROM`
- **THEN** пользователь подтверждает адрес почты письмом со ссылкой на `CODRAW_APP_URL`
