# Tasks

## 1. Фигуры

- [x] 1.1 frontend: фигуры `process`, `cube`, `card`, `internalStorage`, `datastore`, `parallelogram`, `component`, `folder`, `note` и `codraw.server`, `codraw.firewall`, `codraw.bucket`, `codraw.topic`, `codraw.clock`, `codraw.browser`, `codraw.mobile`, `codraw.desktop`, `codraw.chip` в `extensions.ts`; проверка: unit-тест регистрации
- [x] 1.2 frontend: пресеты разделов «Инфраструктура», «Данные и сообщения», «Клиенты», «UML»; кластер Kubernetes пропускает щелчки к фигурам внутри; проверка: unit-тест пресетов

## 2. Палитра

- [x] 2.1 frontend: сворачиваемые разделы палитры с иконками новых фигур; проверка: компонентный тест палитры

## 3. Сквозная проверка и документация

- [x] 3.1 e2e: каждая новая фигура добавляется, рисуется и видна второму участнику с нужным стилем и подписью; щелчок внутри кластера Kubernetes выделяет фигуру под ним; проверка: job e2e зелёный в CI
- [x] 3.2 Описать новые разделы и сворачивание палитры в `docs/running.md`; проверка: job e2e зелёный в CI
