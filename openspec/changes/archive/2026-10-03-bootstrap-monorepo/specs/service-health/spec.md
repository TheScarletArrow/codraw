# Spec Delta

## Purpose

Позволяет оркестратору, балансировщику и разработчику проверить, что серверный сервис запущен и готов
принимать запросы.

## ADDED Requirements

### Requirement: Проверка работоспособности backend

Backend SHALL отвечать на `GET /actuator/health` статусом 200 и JSON-телом, в котором поле `status`
равно `UP`, когда сервис готов принимать запросы.

#### Scenario: Backend запущен

- **WHEN** клиент отправляет `GET /actuator/health` работающему backend
- **THEN** ответ имеет статус 200, а поле `status` в теле равно `UP`

### Requirement: Проверки liveness и readiness backend

Backend SHALL отдавать отдельные проверки `GET /actuator/health/liveness` и
`GET /actuator/health/readiness`, чтобы оркестратор мог отличить зависший процесс от процесса,
который ещё не готов принимать трафик.

#### Scenario: Backend жив и готов

- **WHEN** клиент отправляет `GET /actuator/health/liveness` или `GET /actuator/health/readiness`
  работающему backend
- **THEN** ответ имеет статус 200, а поле `status` в теле равно `UP`

### Requirement: Проверка работоспособности collab

Collab SHALL отвечать на `GET /health` статусом 200 и телом `{"status":"UP"}`, когда сервис готов
принимать подключения.

#### Scenario: Collab запущен

- **WHEN** клиент отправляет `GET /health` работающему collab
- **THEN** ответ имеет статус 200, тип `application/json` и тело `{"status":"UP"}`

### Requirement: Проверки доступны без аутентификации

Эндпоинты проверки работоспособности SHALL быть доступны без аутентификации, чтобы ими могли
пользоваться оркестратор и балансировщик.

#### Scenario: Запрос без учётных данных

- **WHEN** клиент без cookie и токенов отправляет запрос к эндпоинту проверки любого сервиса
- **THEN** сервис отвечает статусом 200, а не 401 или 403
