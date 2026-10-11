# Tasks

## 1. Набор

- [x] 1.1 frontend: `vite/logos/logos.json` — 100 логотипов в формате simple-icons с источником; `vite/logos/names.json`
  — русские и другие имена логотипов simple-icons; `vite/logos/README.md` — источники, лицензии, как добавить логотип;
  проверка: каждый логотип сверен с оригиналом на значке и картинке

## 2. Сборка и сопоставление

- [x] 2.1 frontend: `vite/techIcons.ts` — каталог и группы путей из simple-icons и набора, логотипы набора первыми,
  ошибка сборки при повторе slug и неизвестном slug в `names.json`, перезагрузка при правке набора; `diagram/techIcons.ts`
  — название целиком, как написано, до среза версии («Яндекс 360»); проверка:
  `vite/techIcons.test.ts` — данные набора и ошибки сборки, `diagram/techIcons.test.ts` — русские названия, AWS, MS SQL,
  MAX, Astra Linux на настоящем каталоге

## 3. Документация и проверка

- [x] 3.1 README, справка («Фигуры и палитра», «Логотипы технологий»), «Что нового» 0.42.0, версия фронтенда
- [x] 3.2 `openspec validate --all`, typecheck, lint, тесты, `vite build`
