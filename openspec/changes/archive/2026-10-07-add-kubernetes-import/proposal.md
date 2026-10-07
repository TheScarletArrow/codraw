# Proposal

## Why

Развёртывание в Kubernetes уже описано манифестами — рабочими нагрузками, сервисами, Ingress и маршрутами, — а схему
развёртывания по ним рисуют руками, начиная с шаблона «Деплой в Kubernetes». CoDraw уже строит схему контейнеров по
docker-compose (`infrastructure-import`), но не по манифестам Kubernetes, выводу `helm template` и `kustomize build`
(issue #97, эпик #81).

## What Changes

- В меню «SQL и Mermaid» появляется «Импорт Kubernetes…» (только у тех, кто правит доску) — то же окно, что у импорта
  docker-compose: поле для текста, «Открыть файлы» (`.yaml`, `.yml`, `.json`, несколько сразу, в файле — несколько
  документов через `---` и списки `kind: List`), галочки «Связи по переменным окружения» и «Фигуры C4», сводка
  «Рабочих нагрузок: N, шлюзов: N, внешних сервисов: N, связей: N, пространств имён: N», ошибки и «Добавить на
  страницу».
- Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob и Pod становятся фигурами по образу первого контейнера,
  как сервисы docker-compose («База данных», «Кэш», «Очередь», …, «Контейнер»), с подписью из имени, образа и строки
  о виде нагрузки, числе реплик и портах сервисов, которые на неё указывают.
- Service не рисуется отдельной фигурой: связи к нему ведут к нагрузкам, которые он выбирает по `selector`;
  `type: ExternalName` — «Внешняя система» с внешним адресом.
- Ingress и HTTPRoute (Gateway API) — «API-шлюз» со связями к нагрузкам за сервисами своих правил, подписанными хостом и
  путём (`shop.example.com/api`).
- Связи по переменным окружения контейнеров — в том числе из ConfigMap через `envFrom` и `configMapKeyRef` — по адресам
  сервисов (`http://billing:8080`, `billing.payments.svc.cluster.local`), подписанные протоколом.
- Каждое пространство имён — рамка «Кластер Kubernetes» с его именем; объекты без `namespace` — в `default`.
- Шаблон Helm без рендеринга (`{{ … }}`) даёт понятную ошибку с подсказкой выполнить `helm template`.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `infrastructure-import`: импорт манифестов Kubernetes рядом с импортом docker-compose.
- `sql-schema`: меню «SQL и Mermaid» предлагает «Импорт Kubernetes…», его фигуры не считаются таблицами.
- `diagram-editing`: элементы из импорта Kubernetes отмечены участником, который их добавил.

## Impact

- `frontend`: модуль `infra/` — разбор манифестов, граф Kubernetes, окно импорта общее для двух форматов; чтение файла
  YAML с несколькими документами в `apiSpec/loadDocument.ts`; пункт меню в `sql/SqlMenu.tsx`.
- `backend`, `collab` и документ доски не меняются: файлы разбираются в браузере.
- Вне объёма: CRD и операторы (кроме HTTPRoute), Gateway как отдельная фигура, тома и PersistentVolumeClaim (в палитре
  нет фигуры диска), NetworkPolicy, подключение к живому кластеру, шаблоны Helm без рендеринга.
