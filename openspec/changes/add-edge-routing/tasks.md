# Tasks

## 1. Маршрутизатор

- [x] 1.1 frontend: зависимость `libavoid-js` 0.4.5, алиас Vite для `libavoid.wasm`, типы `diagram/routing/libavoid.d.ts`, `test/setup.ts` без `document`; проверка: typecheck, загрузка в Vitest (node)
- [x] 1.2 frontend: `diagram/routing/routingInput.ts` — препятствия, связи, пины полей и фигур, исключения; проверка: unit-тесты в jsdom
- [x] 1.3 frontend: `diagram/routing/routeEdges.ts` — расчёт на libavoid; проверка: unit-тесты в node — обход таблицы, подход к полю сбоку, разведение связей к одному полю

## 2. Встраивание

- [x] 2.1 frontend: `diagram/routing/routing.worker.ts` и `diagram/routing/edgeRouter.ts` — worker, расписание, устаревшие ответы, хранение и инвалидация маршрутов; стиль `orthogonalEdgeStyle` с маршрутом и откатом; подключение в `diagram/editor.ts`; проверка: unit-тесты стиля и сервиса с подменённым worker

## 3. Поставка и документация

- [x] 3.1 deploy: `'wasm-unsafe-eval'` в CSP `frontend/nginx/security-headers.conf`; проверка: сборка, CSP в конфиге
- [x] 3.2 docs: ADR-0004 о маршрутизаторе, README; проверка: документы описывают маршруты и ограничения
- [ ] 3.3 e2e: связь между таблицами обходит третью таблицу у второго участника; проверка: `edge-routing.spec.ts` зелёный
- [x] 3.4 frontend: проверка в браузере — обход, подход к полю, разведение, ручной излом, перетаскивание
