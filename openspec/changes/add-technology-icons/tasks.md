# Tasks

## 1. Набор и сопоставление

- [x] 1.1 frontend: `vite/techIcons.ts` — каталог и пути simple-icons виртуальными модулями; `diagram/techIcons.ts` —
  ленивая загрузка, ключ имени, сопоставление технологии, поиск, картинки значка и логотипа; проверка: unit-тесты на
  своём каталоге и на настоящем наборе

## 2. Холст и панели

- [x] 2.1 `diagram/iconBadges.ts` — overlays значков, пересчёт по изменениям модели, `ready`; `editor.ts` — `iconsReady`,
  `addLogo`, `icon` в свойствах и `setElementProperties`; `svgExport.ts` — overlays в картинке; `renderPage.ts` — ждёт
  значки; проверка: тесты редактора, картинки, читателя, отмены
- [x] 2.2 `elements/IconField.tsx`, `PropertiesPanel` — поле «Значок»; `ShapePalette`, `DiagramCanvas` — логотипы в
  поиске и перетаскивание; проверка: компонентные тесты
- [x] 2.3 `.drawio`: `codrawIcon` и облачные фигуры draw.io без потерь; проверка: тесты стиля

## 3. Документация и проверка

- [x] 3.1 README, «Что нового» 0.19.0, версия фронтенда
- [x] 3.2 e2e: `technology-icons.spec.ts` — значок у двух участников, выбор и «Без значка», логотип из поиска
- [x] 3.3 `openspec validate --all`, typecheck, lint, тесты, `vite build`
