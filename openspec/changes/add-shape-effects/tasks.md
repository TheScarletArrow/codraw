# Tasks

## 1. Редактор

- [ ] 1.1 frontend: `diagram/editor.ts` — `SelectionColors.gradient`/`gradientDirection`, `SelectionLine.shapes`,
  команда `setShapeEffects` (только незакреплённые фигуры, скругление — только у скругляемых, значения по умолчанию без
  ключей, один шаг отмены, `CHANGING_COMMANDS`); `test/fakeEditor.ts`; проверка: тесты редактора в `styles.test.ts`

## 2. Окна

- [ ] 2.1 frontend: `diagram/ColorPicker.tsx` — «Градиент» (флажок, второй цвет, направление); `EditorToolbar.tsx`;
  проверка: компонентные тесты `EditorToolbar.test.tsx`
- [ ] 2.2 frontend: `diagram/LineStylePicker.tsx` — «Тень», «Скругление», «Радиус, %»; проверка: компонентные тесты

## 3. Оформление везде

- [ ] 3.1 frontend: `diagram/styleCopy.ts` — тень и градиент в части `fill`; проверка: `styleCopy.test.ts`,
  `formatPainter.test.ts`
- [ ] 3.2 frontend: `diagram/canvasTheme.ts`, `diagram/extensions.ts` — тень на тёмном холсте; проверка:
  `canvasTheme.test.ts`
- [ ] 3.3 frontend: `diagram/legendShapes.ts` — тень образца; проверка: тест легенды
- [ ] 3.4 frontend: тесты `.drawio` туда и обратно, буфера обмена и SVG-экспорта с тенью, скруглением и градиентом
- [ ] 3.5 backend: тест `SvgSanitizer` — градиент и тень живой картинки проходят очистку

## 4. Документация и проверка

- [ ] 4.1 README (возможности, раздел «Тень, скругление и градиент», «Формат по образцу», пункт плана), «Что нового»
  0.31.0, версия фронтенда 0.31.0
- [ ] 4.2 e2e: `styles.spec.ts` — тень, скругление и градиент у второго участника, отмена
- [ ] 4.3 `openspec validate --all`, typecheck, lint, тесты, `vite build`, тесты backend; проверка в браузере (холст,
  тёмная тема, PNG, SVG, PDF)
