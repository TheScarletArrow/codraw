# Spec Delta

## ADDED Requirements

### Requirement: Импорт Kubernetes

Меню «SQL и Mermaid» SHALL предлагать участнику, который правит доску, «Импорт Kubernetes…» — окно с полем для текста,
«Открыть файлы» для одного или нескольких файлов `.yaml`, `.yml` и `.json`, галочками «Связи по переменным
окружения» (включена) и «Фигуры C4» (выключена) и «Добавить на страницу». Файл SHALL читаться целиком: несколько
документов YAML через `---` и объекты из `items` списка `kind: List`. Объекты всех файлов и текста SHALL разбираться
вместе. Перед добавлением участник SHALL видеть сводку «Рабочих нагрузок: N, шлюзов: N, внешних сервисов: N, связей: N,
пространств имён: N», которая считает ровно то, что будет добавлено, и ошибку каждого файла, который не будет добавлен.
«Добавить на страницу» SHALL ставить схему справа от фигур страницы, разложенную автораскладкой слева направо, одним
шагом отмены у всех участников, и SHALL быть недоступно, пока нет ни одной фигуры или разбор не закончен. Участнику в
режиме «Просмотр» пункт SHALL не показываться.

#### Scenario: Манифесты магазина

- **WHEN** участник открывает в «Импорт Kubernetes…» файл с Deployment `frontend` и `backend`, StatefulSet `postgres`,
  их Service и Ingress `shop`, и нажимает «Добавить на страницу»
- **THEN** справа от схемы страницы появляются «Контейнеры» `frontend` и `backend`, «База данных» `postgres`,
  «API-шлюз» `shop` и рамка пространства имён, второй участник видит то же, а `Ctrl+Z` убирает их все

#### Scenario: Только просмотр

- **WHEN** участник в режиме «Просмотр» открывает меню «SQL и Mermaid»
- **THEN** пункта «Импорт Kubernetes…» в меню нет

### Requirement: Рабочие нагрузки Kubernetes

Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob и Pod SHALL становиться фигурой палитры по образу первого
контейнера пода по тем же правилам, что сервис docker-compose. Подпись SHALL состоять из строк: имя; образ первого
контейнера и `+N`, если контейнеров больше; вид нагрузки, кроме Deployment, расписание CronJob, `×N` при числе реплик
больше одного и порты `:порт` сервисов, которые выбирают нагрузку, — через запятую, если что-то из этого есть. С
галочкой «Фигуры C4» нагрузка SHALL становиться Container или Database C4 с подписью из имени, `[Container: образ]` и
той же строки о нагрузке.

#### Scenario: StatefulSet базы данных

- **WHEN** импортирован StatefulSet `postgres` с образом `postgres:16`, тремя репликами и Service `postgres` с портом 5432
- **THEN** на странице «База данных» с подписью «postgres», «postgres:16» и «StatefulSet, ×3, :5432»

#### Scenario: CronJob

- **WHEN** импортирован CronJob `report` с расписанием `0 3 * * *` и двумя контейнерами `app:1` и `sidecar:2`
- **THEN** на странице «Контейнер» с подписью «report», «app:1 +1» и «CronJob 0 3 * * *»

### Requirement: Сервисы и шлюзы Kubernetes

Service SHALL NOT становиться фигурой: связь к сервису SHALL вести к каждой нагрузке, метки пода которой содержат все
метки его `selector`. Service `type: ExternalName` SHALL становиться «Внешней системой» с подписью из имени и
`externalName`. Ingress и HTTPRoute SHALL становиться «API-шлюзом» с подписью из имени и вида объекта и давать связь от
шлюза к нагрузкам или внешней системе за сервисом каждого правила; подпись связи SHALL быть хостом и путём правила
(`shop.example.com/api`, без хоста — путём), подписи правил к одной цели — через запятую. Правило к сервису, которого
нет в файлах или который не выбирает ни одной нагрузки, SHALL не давать связи.

#### Scenario: Ingress

- **WHEN** у Ingress `shop` правила `shop.example.com` `/` к Service `frontend` и `/api` к Service `backend`
- **THEN** от «API-шлюза» `shop` к `frontend` идёт связь «shop.example.com/», а к `backend` — «shop.example.com/api»

#### Scenario: Внешний сервис

- **WHEN** импортирован Service `payments` с `type: ExternalName` и `externalName: api.stripe.com`
- **THEN** на странице «Внешняя система» с подписью «payments» и «api.stripe.com» вне рамок пространств имён

### Requirement: Связи и пространства имён Kubernetes

С галочкой «Связи по переменным окружения» значение переменной окружения контейнера нагрузки — заданное в `value`,
взятое из ConfigMap через `configMapKeyRef` или все значения ConfigMap из `envFrom` — SHALL давать связь от нагрузки к
нагрузкам или внешней системе сервиса, имя которого стоит в значении адресом по тем же правилам, что у docker-compose:
`имя`, `имя.пространство`, `имя.пространство.svc` или `имя.пространство.svc.cluster.local`; имя без пространства SHALL
искаться сначала в пространстве нагрузки. Каждое пространство имён SHALL становиться рамкой «Кластер Kubernetes» с его
именем вокруг его нагрузок и шлюзов; объект без `metadata.namespace` SHALL быть в `default`.

#### Scenario: Адрес из ConfigMap

- **WHEN** у Deployment `backend` переменная `DB_URL: jdbc:postgresql://postgres:5432/shop` и `envFrom` ConfigMap с
  `PAYMENTS_URL: https://payments.billing.svc.cluster.local`, а Service `payments` в пространстве `billing`
- **THEN** от `backend` к `postgres` идёт связь «JDBC», а к нагрузке за `payments` — связь «HTTPS»

#### Scenario: Два пространства имён

- **WHEN** импортированы Deployment `backend` в пространстве `shop` и Deployment `prometheus` в `monitoring`
- **THEN** на странице рамки «Кластер Kubernetes» `shop` вокруг `backend` и `monitoring` вокруг `prometheus`, и сводка
  называет 2 пространства имён

### Requirement: Ошибки и пределы Kubernetes

Ошибка синтаксиса YAML или JSON SHALL называть файл, строку и столбец. Файл, в котором нет ни одного объекта с
`apiVersion` и `kind`, SHALL давать ошибку, что это не манифесты Kubernetes. Файл с шаблонами Helm (`{{ … }}`) SHALL
давать ошибку с подсказкой выполнить `helm template` и открыть результат. Остальные файлы SHALL можно добавить. Файл
больше 5 МБ SHALL отклоняться. Если фигур больше 300, участник SHALL видеть, сколько их, и SHALL NOT добавлять схему.
Файлы SHALL разбираться в браузере и никуда не отправляться.

#### Scenario: Шаблон Helm

- **WHEN** участник открывает `deployment.yaml` с `replicas: {{ .Values.replicas }}`
- **THEN** участник видит «deployment.yaml: это шаблон Helm — выполните helm template и откройте результат»

#### Scenario: Не манифесты

- **WHEN** участник открывает `docker-compose.yml`
- **THEN** участник видит «docker-compose.yml: это не манифесты Kubernetes — нет объектов с apiVersion и kind»
