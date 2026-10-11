# Proposal

## Why

Логотипы технологий — набор simple-icons, а в нём нет того, что чаще всего рисуют на схемах: simple-icons убрал по
просьбам владельцев логотипы AWS и её сервисов, Microsoft, Azure, SQL Server, C#, Oracle, OpenAI, Slack, Salesforce и
других, а российских сервисов и технологий в нём почти нет: у «Оплаты» с технологией «СБП», «Кэша» на Tarantool или
интеграции с «1С», «Госуслугами» и Ozon значка нет, и в «Поиске фигур» их логотипов не найти. Русские названия
(«Яндекс Облако», «ВКонтакте», «Сбер») логотип тоже не находят.

**До:** около 3460 логотипов simple-icons, только по их английским названиям.

**После:** ещё 100 логотипов — популярные сервисы и технологии, которых нет в simple-icons, в том числе 36 российских
и популярных в России, — и русские названия логотипов.

## What Changes

- Дополнительный набор логотипов CoDraw в формате simple-icons (один путь в квадрате 24 × 24 и цвет бренда) рядом с
  плагином Vite: 55 логотипов, которые simple-icons убрал (AWS и её сервисы, Microsoft, Azure, SQL Server, C#, Windows,
  PowerShell, VS Code, Teams, Excel, Power BI, Oracle, OpenAI, Slack, IBM, Salesforce, SonarQube, Heroku и другие), 36
  российских и популярных в России (Сбер, Т-Банк, Альфа-Банк, ВТБ, Мир, СБП, Госуслуги, 1С, Saby, Почта России, МТС, Билайн, МегаФон,
  Яндекс, Яндекс 360, Яндекс Карты, Яндекс Маркет, Ozon, Wildberries, Авито, hh.ru, 2ГИС, RUTUBE, MAX, RuStore,
  Cloud.ru, VK Cloud, VK WorkSpace, GigaChat, Tarantool, YDB, Greenplum, Deckhouse, werf, userver, Picodata) и 9
  технологий (gRPC, HAProxy, Memcached, YouTrack, YugabyteDB, Akka, Zabbix, Valkey, Apache Camel — без логотипов в
  simple-icons). У каждого — источник и лицензия.
- Плагин `techIcons` собирает каталог и группы путей из simple-icons и дополнительного набора; совпадение имени
  логотипа набора с логотипом simple-icons — ошибка сборки.
- Другие имена логотипов simple-icons на русском («Яндекс Облако», «ВКонтакте», «Телеграм», «Касперский», «Кафка»,
  «Постгрес») и российских дистрибутивов Linux («Astra Linux», «РЕД ОС», «ALT Linux») — логотип Linux вместо чужого
  логотипа «Astra».
- Названия логотипов набора важнее названий simple-icons: «MAX» — мессенджер, а не HBO Max.
- Технология сначала сравнивается целиком, как написана, и только потом без версии: «Яндекс 360» и «Amazon Route 53»
  больше не теряют число из названия.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `technology-icons`: логотипы на фигурах, в поле «Значок» и в «Поиске фигур» — из simple-icons и дополнительного
  набора, по английским и русским названиям.

## Impact

- `frontend`: `vite/techIcons.ts`, `vite/logos/` (набор, имена, источники и лицензии), `diagram/techIcons.ts`, тесты
  плагина и `diagram/techIcons.test.ts`; справка, «Что нового» 0.42.0, README.
- Каталог логотипов вырастает примерно на 10 КБ, пути — на 130 КБ, распределённые по группам; когда они грузятся, не
  меняется.
- `backend` и `collab` не меняются.
- Вне рамок: многоцветные логотипы, логотипы без открытого источника, до которого дотягивается сборка (Postgres Pro,
  Astra Linux, Битрикс24, ЮMoney, Дзен, Ростелеком, Selectel, Angie, Positive Technologies), облачные наборы значков
  AWS, Azure, Google Cloud и Yandex Cloud, раздел логотипов в палитре без поиска.
