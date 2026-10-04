# Запуск CoDraw

Инструкция для локального запуска: от установки инструментов до открытой доски в двух браузерах.

## Коротко

Если всё нужное уже установлено:

```bash
git clone https://github.com/TheScarletArrow/codraw.git && cd codraw
corepack enable && pnpm install
docker compose up -d postgres

# каждый сервис — в отдельном терминале, в таком порядке
cd backend && GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… ./gradlew bootRun   # API: http://localhost:8080
pnpm dev:collab                    # синхронизация:  ws://localhost:1234
pnpm dev:frontend                  # приложение:     http://localhost:5173
```

Откройте http://localhost:5173 и войдите. Client id и secret выдаёт OAuth-приложение GitHub или Google — как его
создать, описано в [README](../README.md#вход-через-github-и-google).

## 1. Что установить

| Инструмент | Версия | Зачем | Проверка |
|---|---|---|---|
| JDK | 25 | backend | `java -version` |
| Node.js | 22.12 или новее, рекомендуется версия из `.nvmrc` | frontend и collab | `node --version` |
| pnpm | 10, ставится через Corepack из Node.js | зависимости frontend и collab | `pnpm --version` |
| Docker с Compose v2 | любая актуальная | PostgreSQL; тесты backend | `docker compose version` |
| Git | любая | получить код | `git --version` |

- JDK 25 подойдёт любой: Temurin, Liberica, Corretto и т. п. Gradle находит его сам, даже если по умолчанию
  в системе другая Java (Gradle при этом должен запускаться на JDK 17 или новее).
- `corepack enable` включает pnpm той версии, что указана в `package.json`. При первом запуске Corepack
  может спросить разрешения скачать pnpm — ответьте `Y`. На Linux и macOS команде могут понадобиться права
  администратора (`sudo corepack enable`).
- Gradle и Maven-зависимости скачиваются при первом запуске backend автоматически, ставить Gradle не нужно.

## 2. Код и зависимости

```bash
git clone https://github.com/TheScarletArrow/codraw.git
cd codraw
corepack enable
pnpm install
```

`pnpm install` ставит зависимости всех JS-подпроектов: `frontend`, `collab` и `e2e`.

## 3. PostgreSQL

```bash
docker compose up -d postgres
docker compose ps
```

В выводе `docker compose ps` у `postgres` должен быть статус `healthy`. База `codraw` (пользователь и пароль
тоже `codraw`) доступна на `localhost:5432`, данные лежат в Docker-томе и переживают перезапуск.

## 4. Сервисы

Запускайте каждый сервис в отдельном терминале, из корня репозитория, в этом порядке.

### backend

```bash
cd backend
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… ./gradlew bootRun          # Windows: gradlew.bat bootRun
```

Переменные `GITHUB_*` и `GOOGLE_*` — client id и secret OAuth-приложений, через которые входят в CoDraw
(см. [README](../README.md#вход-через-github-и-google)). Достаточно одного провайдера. Без них backend
запускается, но работает только режим гостя.

Первый запуск дольше: Gradle скачивает себя и зависимости. Backend готов, когда в логе появится
`Started CodrawApplicationKt`. Таблицы в базе создаются при старте автоматически (миграции Flyway).
Доски, созданные до появления входа в систему, при этом удаляются: у них нет владельца.

Проверка:

```bash
curl http://localhost:8080/actuator/health
# {"groups":["liveness","readiness"],"status":"UP"}
```

### collab

```bash
pnpm dev:collab
```

Готов, когда в логе `Hocuspocus v… running at`. Проверка:

```bash
curl http://localhost:1234/health
# {"status":"UP"}
```

### frontend

```bash
pnpm dev:frontend
```

Готов, когда Vite напишет `Local: http://localhost:5173/`. Dev-сервер проксирует `/api` в backend
и `/collab` в collab, поэтому приложение нужно открывать именно на порту 5173.

## 5. Проверка

1. Откройте http://localhost:5173: откроется страница входа. Войдите через GitHub или Google — откроется
   список досок, а в шапке появятся ваши имя и аватар. Без OAuth-приложений нажмите «Продолжить без входа»:
   вы войдёте гостем «Гость N».
2. Нажмите «Создать доску». Статус рядом с названием доски должен смениться на «Синхронизировано».
3. Откройте тот же адрес в другом браузере или в окне инкогнито и войдите под любым аккаунтом или гостем:
   ссылка даёт доступ к доске, и в списке участников появится второй участник. В его списке досок
   эта доска не появится: там только собственные доски.
4. Добавьте фигуру в одном окне — она сразу появится во втором.

Как работать в редакторе:

| Действие | Как |
|---|---|
| Добавить фигуру | перетащить из панели слева на холст или щёлкнуть по ней в панели |
| Соединить фигуры | навести на фигуру и тянуть синюю точку у её правой границы к другой фигуре |
| Подпись | двойной щелчок по фигуре или связи; сохраняется щелчком вне её |
| Удалить | выделить и нажать Delete или Backspace |
| Отменить и повторить | Ctrl+Z и Ctrl+Shift+Z (на macOS — Cmd), отменяются только свои действия |
| Масштаб | Ctrl + колесо мыши или кнопки на панели инструментов |
| Цвет | выделить фигуры или связи и выбрать «Заливка», «Линия» или «Текст» на панели инструментов: цвет из палитры, «Без заливки», «Без линии» или «Свой цвет»; у связей заливки нет |
| Таблица БД | «Таблица» в разделе «База данных»; имя таблицы и поля меняются двойным щелчком |
| Поле таблицы | выделить таблицу или поле и нажать «Добавить поле» на панели инструментов: новое поле появится под выделенным; удалить — выделить поле и нажать Delete; таблица выделяется щелчком по заголовку |
| Связь между полями | навести на поле и тянуть синюю точку у его правой границы к полю другой таблицы |
| Маркеры связи | выделить связь и выбрать «Начало» и «Конец» на панели инструментов: стрелка, без маркера или нотация «воронья лапка» (один, много, ноль или один и т. д.) |
| Архитектура и C4 | разделы «Архитектура» и «C4» панели фигур; щелчок внутри границы выделяет фигуру под ней, а саму границу — щелчок по рамке |
| Системный дизайн | разделы «Инфраструктура», «Данные и сообщения», «Клиенты» и «UML»; кластер Kubernetes, как и граница, пропускает щелчки к фигурам внутри |
| Разделы панели фигур | щелчок по заголовку раздела сворачивает его, повторный — разворачивает |
| Страницы | вкладки под холстом: щелчок переключает страницу, «+» добавляет новую после текущей, двойной щелчок переименовывает; в меню вкладки (стрелка на вкладке или правый щелчок) — «Переименовать», «Дублировать», «Переместить влево/вправо» и «Удалить» с подтверждением; вкладки можно перетаскивать. Каждый участник работает на своей странице, она видна в адресе (`?page=`); undo действует в пределах страницы |
| Где другие участники | курсоры и выделения видны только участникам той же страницы; у участника на другой странице в списке участников написано имя его страницы, а на вкладке страницы — точка его цвета. Курсор за краем видимой области показывается меткой у края холста: щелчок по ней или по участнику в списке переводит к его курсору, при необходимости — на его страницу |

## Порты и настройки

| Порт | Что |
|---|---|
| 5173 | frontend, dev-сервер Vite |
| 8080 | backend |
| 1234 | collab |
| 5432 | PostgreSQL |
| 4173 | frontend в режиме `vite preview` (сборка и e2e) |
| 1235 | второй collab в e2e-тесте перезапуска |

Для локальной разработки нужны только переменные OAuth-приложений, остальные значения по умолчанию
согласованы между собой:

- `./gradlew bootRun` включает профиль `dev` — `backend/src/main/resources/application-dev.yaml`;
- `pnpm dev:collab` читает `collab/.env.development`;
- `docker compose` использует значения по умолчанию из `docker-compose.yml`.

Полный список переменных для других окружений — в `.env.example`.

## Остановка и сброс

- Сервисы останавливаются через Ctrl+C в их терминалах.
- `docker compose stop` останавливает PostgreSQL, данные сохраняются.
- `docker compose down -v` удаляет контейнер вместе с данными: все доски пропадут.

## Запуск собранной версии

Так можно проверить production-сборку локально. Каждая команда — в отдельном терминале, токен
`CODRAW_INTERNAL_TOKEN` должен совпадать у backend и collab. Вход работает, если в OAuth-приложении указан
callback URL с портом 4173, например `http://localhost:4173/api/login/oauth2/code/github`; переменные
провайдера, которым не пользуетесь, можно задать любыми непустыми значениями.

```bash
# сборка
(cd backend && ./gradlew bootJar)
pnpm --filter @codraw/collab --filter @codraw/frontend build

# backend
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/codraw \
SPRING_DATASOURCE_USERNAME=codraw SPRING_DATASOURCE_PASSWORD=codraw \
CODRAW_INTERNAL_TOKEN=local-secret \
GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
java -jar backend/build/libs/codraw-backend.jar

# collab
BACKEND_URL=http://localhost:8080 BACKEND_JWKS_URL=http://localhost:8080/.well-known/jwks.json \
CODRAW_INTERNAL_TOKEN=local-secret node collab/dist/index.js

# frontend: http://localhost:4173, проксирует /api и /collab так же, как dev-сервер
pnpm --filter @codraw/frontend exec vite preview --port 4173
```

В PowerShell переменные задаются иначе: `$env:CODRAW_INTERNAL_TOKEN="local-secret"` перед командой.

`vite preview` — средство проверки, а не production-сервер. Docker-образы и nginx появятся отдельным
изменением.

## Тесты

```bash
pnpm typecheck && pnpm lint && pnpm test   # frontend и collab
cd backend && ./gradlew test               # backend
```

Тестам backend нужен запущенный Docker: Testcontainers сам поднимает PostgreSQL 18 в контейнере,
`docker compose` для них не нужен.

Сквозные тесты (Playwright) запускают собранные сервисы и ходят в PostgreSQL из docker compose. Dev-серверы
перед этим нужно остановить: порты 8080, 1234, 1235 и 4173 должны быть свободны. Backend в них работает
в профиле `e2e`: тесты входят через тестовый эндпоинт, а не через GitHub или Google. В остальных профилях
этого эндпоинта нет.

```bash
docker compose up -d postgres
(cd backend && ./gradlew bootJar)
pnpm --filter @codraw/collab --filter @codraw/frontend build
pnpm --filter @codraw/e2e exec playwright install chromium   # один раз
pnpm test:e2e
```

## Частые проблемы

**Backend не стартует: `Connection to localhost:5432 refused`.**
PostgreSQL не запущен. Выполните `docker compose up -d postgres` и дождитесь `healthy` в `docker compose ps`.

**Порт 5432 занят локальным PostgreSQL.**
Поднимите контейнер на другом порту и передайте адрес backend:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres
cd backend && SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/codraw ./gradlew bootRun
```

**Gradle пишет `Cannot find a Java installation on your machine … languageVersion=25`.**
Не установлен JDK 25. Если он установлен в нестандартное место, укажите путь в `~/.gradle/gradle.properties`:
`org.gradle.java.installations.paths=/путь/к/jdk-25`.

**`pnpm: command not found`.**
Выполните `corepack enable` (возможно, с `sudo`). Если Corepack недоступен — `npm install -g pnpm@10`.

**Главная страница показывает «Не удалось загрузить профиль» или «Не удалось загрузить доски».**
Не запущен backend или frontend открыт не на порту 5173.

**GitHub или Google пишут, что адрес возврата (redirect_uri) не совпадает.**
В OAuth-приложении указан другой callback URL. Для dev-сервера он должен быть
`http://localhost:5173/api/login/oauth2/code/github` (или `…/google`): именно порт фронтенда, а не 8080.

**После входа снова открывается страница входа с сообщением «Вход не выполнен».**
Провайдер не подтвердил вход: доступ отменён, неверный client secret или, для Google, аккаунт не добавлен
в Test users. Подробности — в логе backend.

**Backend не стартует: `Client id of registration 'github' must not be empty`.**
Backend запущен не в профиле `dev`, а там переменные OAuth-приложений обязательны. Задайте `GITHUB_*`
и `GOOGLE_*` или запускайте через `./gradlew bootRun`.

**На доске «Нет связи», а вместо холста «Загрузка доски…».**
Не запущен collab: `pnpm dev:collab`.

**Доска висит в статусе «Подключение».**
Collab не может получить документ у backend. Если в логе collab есть `backend responded with 401`,
у backend и collab разные `CODRAW_INTERNAL_TOKEN`. По умолчанию в dev-режиме они совпадают, так что это
бывает, только если токен задавали вручную. Если в логе `[onAuthenticate] Access to board … denied`,
collab не принял токен доступа: проверьте `BACKEND_JWKS_URL` и что collab видит тот же backend, что
и фронтенд.

**Ошибка «порт уже занят» при запуске сервиса.**
Порт занят другим процессом, часто — ранее запущенной копией того же сервиса. Остановите её: dev-сервер
Vite проксирует запросы на фиксированные порты 8080 и 1234.
