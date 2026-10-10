# Tasks

## 1. Редактор

- [x] 1.1 frontend: `diagram/editor.ts` — `SelectionColors.gradient`/`gradientDirection`, `SelectionLine.shapes`,
  команда `setShapeEffects` (только незакреплённые фигуры, скругление — только у скругляемых, значения по умолчанию без
  ключей, один шаг отмены, `CHANGING_COMMANDS`); `test/fakeEditor.ts`; проверка: тесты редактора в `styles.test.ts`

## 2. Окна

- [x] 2.1 frontend: `diagram/ColorPicker.tsx` — «Градиент» (флажок, второй цвет, направление); `EditorToolbar.tsx`;
  проверка: компонентные тесты `EditorToolbar.test.tsx`
- [x] 2.2 frontend: `diagram/LineStylePicker.tsx` — «Тень», «Скругление», «Радиус, %»; проверка: компонентные тесты

## 3. Оформление везде

- [x] 3.1 frontend: `diagram/styleCopy.ts` — тень и градиент в части `fill`; проверка: `styleCopy.test.ts`,
  `formatPainter.test.ts`
- [x] 3.2 frontend: `diagram/canvasTheme.ts`, `diagram/extensions.ts` — тень на тёмном холсте; проверка:
  `canvasTheme.test.ts`
- [x] 3.3 frontend: `diagram/legendShapes.ts` — тень образца; проверка: тест легенды
- [x] 3.4 frontend: тесты `.drawio` туда и обратно, буфера обмена, SVG- и PDF-экспорта с тенью, скруглением и
  градиентом; `editor.ts` — градиент без направления сверху вниз, `svgExport.ts` — концы градиента долями для PDF
- [x] 3.5 backend: тест `SvgSanitizer` — градиент и тень живой картинки проходят очистку

## 4. Документация и проверка

- [x] 4.1 README (возможности, раздел «Тень, скругление и градиент», «Формат по образцу», пункт плана), «Что нового»
  0.31.0, версия фронтенда 0.31.0
- [x] 4.2 e2e: `styles.spec.ts` — тень, скругление и градиент у второго участника, отмена
- [x] 4.3 `openspec validate --all`, typecheck, lint, тесты, `vite build`, тесты backend; проверка в браузере (холст,
  тёмная тема, PNG, SVG, PDF)
