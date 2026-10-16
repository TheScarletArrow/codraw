# Tasks

## 1. frontend

- [x] 1.1 frontend: двенадцать SVG значков в `diagram/integrationIcons/` (глифы Lucide на плашке цвета группы), лицензия
  Lucide и описание источников; `svgImage` в `images.ts`, провайдеры через неё же; проверка: `imageExport.test.ts`
  (адреса провайдеров прежние)
- [x] 1.2 frontend: `integrations.ts` и раздел «Интеграции» перед «Провайдерами» в `shapes.ts`, названия и подписи на
  двух языках в `shapes.messages.ts`, слова поиска в `shapeSearch.ts`; проверка: `shapes.test.ts`, `shapeSearch.test.ts`,
  `ShapePalette.test.tsx`, `BoardPage.test.tsx`
- [x] 1.3 frontend: `shapeOf` узнаёт картинку любой фигуры палитры, `ShapeIcon` показывает её значок без
  `providerImage`; проверка: `imageExport.test.ts` (SVG и `.drawio` значков интеграций), `legend.test.ts`
- [x] 1.4 frontend: раздел в теме справки о панели фигур, «Что нового» 0.55.0 и версия в `package.json`; проверка: тесты
  словарей, справки и версий, `typecheck`, `lint`, `test`

## 2. Проверка и документация

- [x] 2.1 frontend: раздел «Интеграции» в браузере — значки в палитре и на холсте, поиск «rest», на русском и английском
- [x] 2.2 README (палитра фигур, пункт 132 «Плана работ»); проверка: `openspec validate --all --strict`
