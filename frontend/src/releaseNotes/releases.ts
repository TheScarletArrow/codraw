/**
 * «Что нового»: what each version of CoDraw brought to its users, newest first. The first release is the current
 * version of the app, the one in `frontend/package.json`.
 *
 * Every change that users notice adds an item to the next release, written for users in both languages of the interface,
 * Russian and English: what they can do now and where to find it, in the words of the interface in that language, without
 * file names, keys of styles or APIs. The window shows the items in the language of the interface.
 */

/** A novelty in one language: a short title and a sentence or two about it. */
export interface ReleaseText {
  title: string
  text: string
}

/** One novelty of a release, in Russian and in English. */
export interface ReleaseItem {
  ru: ReleaseText
  en: ReleaseText
}

export interface Release {
  /** `major.minor.patch`. */
  version: string
  /** The day of the release, `YYYY-MM-DD`. */
  date: string
  items: ReleaseItem[]
}

export const releases: Release[] = [
  {
    version: '0.31.0',
    date: '2026-10-10',
    items: [
      {
        ru: {
          title: 'CoDraw по-английски',
          text: 'CoDraw говорит по-русски и по-английски: интерфейс открывается на языке браузера, а кнопка «Язык» рядом с «Темой» в шапке переключает его и запоминает выбор. На выбранном языке — всё приложение, ошибки, уведомления, «Что нового», даты и правовые страницы, а письма и сообщения уведомлений в чат приходят на языке, в котором вы пользуетесь CoDraw. Подписи на досках не переводятся: их написали люди.',
        },
        en: {
          title: 'CoDraw in English',
          text: 'CoDraw speaks Russian and English: the interface opens in the language of your browser, and the “Language” button next to “Theme” in the header switches it and remembers your choice. The whole app, errors, notifications, “What’s new”, dates and the legal pages follow the chosen language, and notification emails and chat messages come in the language you use CoDraw in. Labels on boards are not translated: people wrote them.',
        },
      },
    ],
  },
  {
    version: '0.30.0',
    date: '2026-10-10',
    items: [
      {
        ru: {
          title: 'Диаграммы вариантов использования',
          text: 'В палитре появился раздел «UML: варианты использования»: «Актёр» — человечек UML, «Вариант использования» — эллипс, в котором переносятся слова, и «Граница системы UML». Связь между актёром и вариантом использования сразу рисуется линией без стрелок, а «Отношение» на панели делает выделенные связи ассоциацией, включением «include», расширением «extend» или обобщением с полым треугольником. «Открытая стрелка» и «Полый треугольник» есть и в маркерах любой связи. Такие схемы открываются в draw.io и приходят из него без потерь, а готовый пример — шаблон «Варианты использования».',
        },
        en: {
          title: 'Use case diagrams',
          text: 'The palette has a new section, “UML: use cases”: “Actor” is the UML stick figure, “Use case” is an ellipse that wraps its words, and there is a “UML system boundary”. A connector between an actor and a use case is drawn as a line without arrows right away, and “Relationship” on the toolbar makes the selected connectors an association, an “include”, an “extend” or a generalization with a hollow triangle. “Open arrow” and “Hollow triangle” are also among the markers of any connector. Such diagrams open in draw.io and come back from it without losses, and a ready-made example is the “Use cases” template.',
        },
      },
    ],
  },
  {
    version: '0.29.0',
    date: '2026-10-10',
    items: [
      {
        ru: {
          title: 'Архитектура как код — на доску',
          text: '«SQL и Mermaid» → «Импорт архитектуры как кода…» превращает Structurizr DSL, C4-PlantUML и Mermaid C4 в схему, которую можно править вместе: люди, системы, контейнеры и компоненты — фигурами C4 с именами, технологиями, описаниями и тегами, системы с контейнерами — границами, отношения — связями. Можно открыть сразу несколько файлов, например контекст и контейнеры: повторяющийся элемент станет одной фигурой. До добавления видно, что появится, где в файлах ошибки и что пропущено; include и скрипты не выполняются, файлы не покидают браузер. «Обновить через предложение» сверяет элементы по идентификаторам, а выгрузка «Архитектура как код…» после импорта даёт тот же текст.',
        },
        en: {
          title: 'Architecture as code, onto the board',
          text: '“SQL and Mermaid” → “Import architecture as code…” turns Structurizr DSL, C4-PlantUML and Mermaid C4 into a diagram you can edit together: people, systems, containers and components become C4 shapes with names, technologies, descriptions and tags, systems with containers become boundaries, and relationships become connectors. You can open several files at once, for example the context and the containers: an element that repeats becomes one shape. Before anything is added, you see what will appear, where the files have errors and what is skipped; includes and scripts are not run, and the files do not leave the browser. “Update via a change proposal” matches elements by their identifiers, and after an import the “Architecture as code…” export gives the same text.',
        },
      },
    ],
  },
  {
    version: '0.28.0',
    date: '2026-10-10',
    items: [
      {
        ru: {
          title: 'Командные пространства',
          text: '«Создать пространство» на главной странице заводит общее место команды: проекты — общие папки, доски и участники с ролями «Владелец», «Администратор», «Редактор» и «Читатель». Людей приглашают ссылкой, а роль в пространстве сразу даёт права на все его доски: редакторы правят, читатели смотрят. «Перенести в пространство» в меню своей доски отдаёт её команде со всем, что на ней есть. В окне «Поделиться» доски пространства «Доступ участникам пространства» оставляет команде только просмотр или закрывает доску для всех, кроме приглашённых, а «Добавить участника пространства» даёт кому-то из команды больше прав. Ушедший из пространства теряет доступ ко всем его доскам, а доски остаются у команды.',
        },
        en: {
          title: 'Team workspaces',
          text: '“Create workspace” on the home page sets up a shared place for a team: projects (shared folders), boards and members with the roles “Owner”, “Admin”, “Editor” and “Viewer”. People are invited by a link, and a role in the workspace gives rights to all its boards at once: editors edit, viewers view. “Move to workspace” in the menu of your board hands it over to the team with everything on it. In the “Share” dialog of a workspace board, “Access for workspace members” leaves the team view-only access or closes the board to everyone but those invited, and “Add workspace member” gives someone from the team more rights. A member who leaves the workspace loses access to all its boards, and the boards stay with the team.',
        },
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Доска без входа',
          text: 'В окне «Поделиться» появился доступ «Все, у кого есть ссылка, без входа»: ссылку на доску открывает кто угодно — без входа, без гостевой учётной записи и без правки, со всеми страницами, масштабом и прокруткой. Так доску можно дать читателям README и вики, а код из «Встроить на страницу» показывает её во фрейме Confluence или сайта. Вошедшие по ссылке смотрят доску, как в режиме «Просмотр», а участники правят её со своими ролями.',
        },
        en: {
          title: 'Boards without signing in',
          text: 'The “Share” dialog has a new access level, “Anyone with the link, without signing in”: anyone can open the link to the board — without signing in, without a guest account and without editing, with all its pages, zoom and scrolling. This way you can give the board to the readers of a README or a wiki, and the code from “Embed in a page” shows it in a frame in Confluence or on a website. Those who are signed in see the board through the link as in “View” mode, and members edit it with their roles.',
        },
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Задачи GitHub у элементов и обсуждений',
          text: 'Кнопка «Подключения» рядом с вашим именем: вставьте токен GitHub — и в меню элемента появятся «Задачи…», а в каждой ветке комментариев — «Задача». Привяжите существующую задачу по номеру, ссылке или словам из названия или создайте новую: в ней будет описание и ссылка обратно на элемент или обсуждение. Номер, название и статус задачи видны в панели и значком у элемента, а щелчок открывает задачу в GitHub. Статус приходит из GitHub и обновляется сам; если задачу удалили или к ней пропал доступ, CoDraw так и скажет.',
        },
        en: {
          title: 'GitHub issues on elements and threads',
          text: 'The “Connections” button next to your name: paste a GitHub token, and the menu of an element gets “Issues…”, and every comment thread gets “Issue”. Link an existing issue by its number, its link or words from its title, or create a new one: it gets a description and a link back to the element or the thread. The number, title and status of the issue are shown in the panel and as a badge on the element, and a click opens the issue in GitHub. The status comes from GitHub and updates by itself; if the issue was deleted or access to it was lost, CoDraw says so.',
        },
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Схема инфраструктуры из Terraform',
          text: '«SQL и Mermaid» → «Импорт Terraform…» рисует схему по выводу terraform show -json — состояния или сохранённого плана: базы данных, кэши, очереди, балансировщики, серверы и функции AWS, Google Cloud, Azure и Yandex Cloud — знакомыми фигурами, остальные ресурсы — прямоугольниками, зависимости — связями, модули — рамками. До добавления видно, сколько ресурсов и связей появится и чего схеме может не хватать. Terraform не запускается, файл не покидает браузер, а секреты и значения, помеченные sensitive, на доску не попадают. «Обновить через предложение» сверяет ресурсы по адресам и показывает разницу с прежней схемой.',
        },
        en: {
          title: 'Infrastructure diagrams from Terraform',
          text: '“SQL and Mermaid” → “Import Terraform…” draws a diagram from the output of terraform show -json for a state or a saved plan: databases, caches, queues, load balancers, servers and functions of AWS, Google Cloud, Azure and Yandex Cloud become familiar shapes, other resources become rectangles, dependencies become connectors, and modules become frames. Before anything is added, you see how many resources and connectors will appear and what the diagram may be missing. Terraform is not run, the file does not leave the browser, and secrets and values marked sensitive do not get onto the board. “Update via a change proposal” matches resources by their addresses and shows the difference from the previous diagram.',
        },
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Модель архитектуры и представления',
          text: 'Кнопка со значком глаза рядом с «Добавить страницу» создаёт страницу-представление модели доски: ландшафт, систему и её окружение, контейнеры системы, компоненты контейнера или развёртывание окружения, со срезом по командам, тегам и технологиям. Модель — то, что нарисовано на всех страницах: контейнер в границе системы входит в неё (или в систему из поля «Входит в»), а «Узел развёртывания» из раздела C4 держит экземпляры контейнеров. Представление само следует за моделью у всех участников и сохраняет положения ячеек, связи компонентов поднимаются до контейнеров и систем с подписью-сводкой, удалённое на представлении скрывается, а «Скрыто» возвращает его. В панели «Элементы доски» появилась вкладка «Модель» с деревом элементов.',
        },
        en: {
          title: 'Architecture model and views',
          text: 'The eye button next to “Add page” creates a page that is a view of the board’s model: the landscape, a system and its context, the containers of a system, the components of a container or the deployment of an environment, narrowed down by teams, tags and technologies. The model is what is drawn on all the pages: a container inside a system boundary belongs to that system (or to the system in its “Part of” field), and a “Deployment node” from the C4 section holds container instances. A view follows the model by itself for all members and keeps the positions of its cells, relationships between components are lifted to containers and systems with a summary label, what you delete on a view is hidden, and “Hidden” brings it back. The “Board elements” panel has a new “Model” tab with a tree of the elements.',
        },
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Уведомления на почту и в чат',
          text: 'Колокольчик → «Настройки уведомлений»: укажите почту и подтвердите её ссылкой из письма или вставьте входящий вебхук Slack, Mattermost или Rocket.Chat, — и упоминания, ответы, назначенные ветки, запросы доступа и ревью будут приходить туда со ссылкой на ветку или доску. События выбираются для каждого канала отдельно, а «Не присылать уведомления» в меню доски выключает их для одной доски. Что вы успели прочитать в колокольчике, на почту не придёт.',
        },
        en: {
          title: 'Notifications by email and in chat',
          text: 'Bell → “Notification settings”: enter your email address and confirm it with the link from the email, or paste an incoming webhook of Slack, Mattermost or Rocket.Chat, and mentions, replies, assigned threads, access requests and reviews will arrive there with a link to the thread or the board. Events are chosen for each channel separately, and “Mute notifications” in the board menu turns them off for one board. What you have already read in the bell will not arrive by email.',
        },
      },
    ],
  },
  {
    version: '0.22.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Представления в схемах баз данных',
          text: 'Кнопка «Представление» на панели таблицы делает её представлением со значком VIEW в заголовке, «Материализованное» — материализованным (MAT VIEW, у него бывают индексы), а «Запрос…» хранит его SELECT. «Импорт SQL» и «Подключиться к базе…» теперь рисуют представления из CREATE VIEW, дампов pg_dump и mysqldump и живой базы: столбцы и их типы берутся из запроса, а пунктирные связи ведут к таблицам, из которых оно читает. «Скопировать SQL» выгружает представления после таблиц.',
        },
        en: {
          title: 'Views in database diagrams',
          text: 'The “View” button on the table toolbar makes a table a database view with a VIEW badge in its header, “Materialized” makes it a materialized one (MAT VIEW, which can have indexes), and “Query…” keeps its SELECT. “Import SQL” and “Connect to database…” now draw views from CREATE VIEW, from pg_dump and mysqldump dumps and from a live database: the columns and their types come from the query, and dashed connectors lead to the tables it reads from. “Copy SQL” exports views after the tables.',
        },
      },
    ],
  },
  {
    version: '0.21.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Логотипы технологий',
          text: 'Фигура с технологией Redis, Kotlin или PostgreSQL показывает в углу логотип этой технологии — у всех участников и на картинках. В панели «Свойства» поле «Значок» выбирает другой логотип или убирает его, а «Поиск фигур» находит логотипы почти трёх с половиной тысяч технологий и кладёт их на холст картинкой.',
        },
        en: {
          title: 'Technology logos',
          text: 'A shape with the technology Redis, Kotlin or PostgreSQL shows the logo of that technology in its corner, for all members and in images. In the “Properties” panel, the “Icon” field picks another logo or removes it, and “Search shapes” finds the logos of almost three and a half thousand technologies and puts them on the canvas as images.',
        },
      },
    ],
  },
  {
    version: '0.20.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Архитектурные решения',
          text: 'Кнопка «Решения» в шапке ведёт решения доски в формате MADR: почему выбрали Kafka, а не RabbitMQ, — с контекстом, вариантами, итогом и последствиями, статусом и датой. Решение привязывается к элементам схемы, и у них появляется значок; обсуждают решение комментариями. Решения выгружаются файлами .md по одному или архивом .zip, а папка docs/adr импортируется целиком.',
        },
        en: {
          title: 'Architecture decisions',
          text: 'The “Decisions” button in the header keeps the board’s decisions in the MADR format: why Kafka was chosen over RabbitMQ, with the context, the options, the outcome and the consequences, a status and a date. A decision is linked to elements of the diagram, and they get a badge; decisions are discussed in comments. Decisions are exported as .md files one by one or as a .zip archive, and a docs/adr folder is imported as a whole.',
        },
      },
    ],
  },
  {
    version: '0.19.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Как есть и как будет',
          text: 'В меню правого щелчка элемента — «Изменение»: отметьте, что «Появится» и что «Уйдёт». Новое обведено зелёным, уходящее — красным пунктиром, а кнопка «Как есть и как будет» на панели инструментов показывает страницу без нового или без уходящего — только вам, и картинки сохраняются в выбранном виде. «Применить целевое состояние» удаляет уходящее и снимает отметки одним шагом отмены.',
        },
        en: {
          title: 'As is and to be',
          text: 'The right-click menu of an element has “Change”: mark what “Will appear” and what “Will go away”. New things are outlined in green and outgoing ones with a red dashed line, and the “As is and to be” button on the toolbar shows the page without the new or without the outgoing things, only to you, and images are saved as shown. “Apply target state” deletes the outgoing things and clears the marks in one undo step.',
        },
      },
    ],
  },
  {
    version: '0.18.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Детализация элемента',
          text: '«Детализировать» в меню системы, контейнера или сервиса создаёт следующий уровень C4 на новой странице: границу этого элемента и соседей со связями вокруг неё, а у фигуры — ссылку на страницу, у границы — обратно. Повторно команда просто открывает страницу детализации, а «хлебные крошки» над холстом ведут обратно: «Контекст › Payments › API». Создание страницы отменяется одним Ctrl+Z.',
        },
        en: {
          title: 'Drilling down into an element',
          text: '“Drill down” in the menu of a system, a container or a service creates the next C4 level on a new page: the boundary of that element and its neighbors with the connectors around it, plus a link to the page on the shape and a link back on the boundary. Run again, the command just opens the drill-down page, and the breadcrumbs above the canvas lead back: “Context › Payments › API”. Creating the page is undone with a single Ctrl+Z.',
        },
      },
    ],
  },
  {
    version: '0.17.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Проверки схемы',
          text: 'Кнопка «Проверки» в шапке доски показывает замечания к схеме архитектуры по всем страницам: связь без подписи или технологии, контейнер без технологии, элемент C4 без описания или вне своей границы, элемент без связей, циклы зависимостей, общая база данных у нескольких сервисов и вероятные дубли, которые можно сразу объединить. Щелчок по замечанию открывает элемент. Замечание можно скрыть, а правило — выключить для всей доски на вкладке «Правила»: это видят все участники.',
        },
        en: {
          title: 'Diagram checks',
          text: 'The “Checks” button in the board header shows findings about the architecture diagram across all pages: a connector without a label or a technology, a container without a technology, a C4 element without a description or outside its boundary, an element without connectors, dependency cycles, a database shared by several services and likely duplicates that can be merged right away. A click on a finding opens the element. A finding can be hidden, and a rule can be turned off for the whole board on the “Rules” tab; all members see this.',
        },
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Анализ влияния',
          text: '«Зависимости» в меню фигуры или таблицы подсвечивают, от чего элемент зависит и что зависит от него, на один, два или все шаги, а панель справа перечисляет это по всем страницам доски с переходом к элементу. «Путь между» для двух выделенных элементов подсвечивает кратчайшие пути по связям. Подсветка видна только вам; Escape её убирает.',
        },
        en: {
          title: 'Impact analysis',
          text: '“Dependencies” in the menu of a shape or a table highlights what the element depends on and what depends on it, one, two or all steps away, and the panel on the right lists them across all pages of the board, with a jump to each element. “Path between” for two selected elements highlights the shortest paths along connectors. Only you see the highlight; Escape removes it.',
        },
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Фильтр схемы',
          text: 'Кнопка «Фильтр» на панели инструментов показывает срез схемы: элементы с выбранными тегами, типами, технологиями или владельцами и связи выбранного вида. Остальное становится полупрозрачным или, по флажку «Скрывать неподходящее», пропадает с холста — только у вас. Фильтр хранится в адресе доски: поделитесь ссылкой, и коллега увидит тот же срез. «Только видимое» в окне экспорта сохраняет срез в PNG, SVG или PDF.',
        },
        en: {
          title: 'Diagram filter',
          text: 'The “Filter” button on the toolbar shows a slice of the diagram: elements with the selected tags, types, technologies or owners and connectors of the selected kind. Everything else becomes semi-transparent or, with the “Hide non-matching” checkbox, disappears from the canvas, only for you. The filter is kept in the address of the board: share the link, and a colleague sees the same slice. “Only visible” in the export dialog saves the slice to PNG, SVG or PDF.',
        },
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-10-09',
    items: [
      {
        ru: {
          title: 'Свои библиотеки фигур',
          text: 'Выделите фигуры и выберите «Сохранить в библиотеку…» в меню правого щелчка: фигуры со стилями, свойствами и связями между ними станут компонентом вашей библиотеки. «Мои библиотеки» вверху панели фигур есть на каждой вашей доске: щелчок или перетаскивание добавляет независимую копию, поиск фигур находит компоненты по названию, а меню компонента заменяет его выделенным, применяет его стиль к выделенным фигурам или удаляет — вставленные копии не меняются. «Добавить изображения или SVG…» в меню библиотеки делает компоненты из своих логотипов и иконок; SVG остаётся векторным и попадает в PNG, SVG, PDF и файл draw.io. Библиотеки видите только вы.',
        },
        en: {
          title: 'Your own shape libraries',
          text: 'Select shapes and choose “Save to library…” in the right-click menu: the shapes with their styles, properties and the connectors between them become a component of your library. “My libraries” at the top of the shapes panel is there on each of your boards: a click or a drag adds an independent copy, shape search finds components by name, and the component menu replaces the selection with it, applies its style to the selected shapes or deletes it; copies already placed do not change. “Add images or SVG…” in the library menu makes components of your own logos and icons; SVG stays vector and goes into PNG, SVG, PDF and the draw.io file. Only you see your libraries.',
        },
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-10-08',
    items: [
      {
        ru: {
          title: 'Слои страницы',
          text: 'Кнопка «Слои» в шапке доски делит страницу на слои — например, инфраструктура, сервисы и заметки. Новые фигуры попадают в активный слой, а «Перенести выделенное сюда» в меню слоя переносит выделенное на тех же местах. Глаз скрывает слой только у вас, «Скрыть для всех» — у всех участников и в живой картинке, а замок защищает элементы слоя от случайной правки. Слои переносятся в файлы draw.io и обратно, а изображения рисуют то, что видно на холсте.',
        },
        en: {
          title: 'Page layers',
          text: 'The “Layers” button in the board header divides a page into layers, for example infrastructure, services and notes. New shapes go into the active layer, and “Move selection here” in the layer menu moves the selection without changing its place. The eye hides a layer only for you, “Hide for everyone” hides it for all members and in the live image, and the lock protects the layer’s elements from accidental edits. Layers carry over into draw.io files and back, and images show what is visible on the canvas.',
        },
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-10-08',
    items: [
      {
        ru: {
          title: 'Легенда схемы',
          text: 'В разделах «Архитектура» и «C4» палитры — «Легенда»: она сама перечисляет виды фигур, цвета и виды связей страницы с маленькими образцами и обновляется у всех участников после каждой правки. «Свойства…» в меню легенды открывают её пункты: переименуйте пункт, например «Пунктир — асинхронный вызов», или скройте его. Легенда попадает в PNG, SVG, PDF, живую картинку и файл draw.io.',
        },
        en: {
          title: 'Diagram legend',
          text: 'The “Architecture” and “C4” sections of the palette have a “Legend”: it lists the kinds of shapes, the colors and the kinds of connectors of the page by itself, with small samples, and updates for all members after every edit. “Properties…” in the legend menu opens its entries: rename an entry, for example “Dashed — asynchronous call”, or hide it. The legend goes into PNG, SVG, PDF, the live image and the draw.io file.',
        },
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-10-08',
    items: [
      {
        ru: {
          title: 'Диаграммы последовательности',
          text: 'В разделе «UML» палитры — «Диаграмма последовательности»: участники, сообщения, рамки alt, opt, loop и par и заметки раскладываются сами. «Сообщение» на панели вставляет новое под выделенным, а Enter в тексте сообщения сразу открывает следующее. Активации, нумерация и виды участников — на панели инструментов. Текст Mermaid sequenceDiagram, вставленный на холст, становится такой диаграммой, «Скопировать Mermaid» выгружает её обратно, а файл draw.io получает её фигурами draw.io.',
        },
        en: {
          title: 'Sequence diagrams',
          text: 'The “UML” section of the palette has a “Sequence diagram”: participants, messages, alt, opt, loop and par frames and notes lay themselves out. “Message” on the toolbar inserts a new message below the selected one, and Enter in the text of a message opens the next one right away. Activations, numbering and kinds of participants are on the toolbar. Mermaid sequenceDiagram text pasted onto the canvas becomes such a diagram, “Copy Mermaid” exports it back, and a draw.io file gets it as draw.io shapes.',
        },
      },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-10-08',
    items: [
      {
        ru: {
          title: 'Один элемент на нескольких страницах',
          text: 'Скопируйте фигуру и выберите «Вставить как тот же элемент» (Ctrl+Shift+V) на другой странице: теперь это один элемент, и переименование или правка свойств на любой странице меняет его везде у всех участников. Кнопка «Элементы доски» в шапке показывает все элементы доски с поиском и страницами, их можно перетаскивать на холст, а значок у фигуры говорит, на скольких ещё страницах она есть. В меню фигуры — «Где используется…», «Отделить от элемента» и «Удалить со всех страниц…», а нескольких фигур — «Объединить в один элемент…».',
        },
        en: {
          title: 'One element on several pages',
          text: 'Copy a shape and choose “Paste as the same element” (Ctrl+Shift+V) on another page: now it is one element, and renaming it or editing its properties on any page changes it everywhere for all members. The “Board elements” button in the header shows all the elements of the board with search and their pages, they can be dragged onto the canvas, and a badge on a shape tells on how many other pages it appears. The shape menu has “Where used…”, “Detach from element” and “Delete from all pages…”, and the menu of several shapes has “Merge into one element…”.',
        },
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-07',
    items: [
      {
        ru: {
          title: 'Свойства элементов',
          text: 'Кнопка «Свойства» в шапке доски и «Свойства…» в меню правого щелчка показывают у фигуры имя, тип, технологию, описание, владельца и теги, а у связи — технологию и вид: синхронная или асинхронная. Подпись фигур C4 собирается из свойств и меняет их, когда её правят на холсте; у остальных фигур технологию можно показать второй строкой. Поиск на доске находит элементы по технологии, описанию, владельцу и тегам, а «Архитектура как код» и файлы draw.io берут свойства с собой.',
        },
        en: {
          title: 'Element properties',
          text: 'The “Properties” button in the board header and “Properties…” in the right-click menu show the name, type, technology, description, owner and tags of a shape, and the technology and kind of a connector: synchronous or asynchronous. The label of C4 shapes is built from their properties and changes them when it is edited on the canvas; other shapes can show the technology as a second line. Search on the board finds elements by technology, description, owner and tags, and “Architecture as code” and draw.io files take the properties along.',
        },
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-07',
    items: [
      {
        ru: {
          title: 'Описание API у связи',
          text: 'В меню правого щелчка связи — «Описание API…»: метод, путь, параметры, заголовки, тело запроса и ответы, как в Swagger. Щелчок по связи открывает описание справа на холсте, подпись связи становится «POST /payments», а «Копировать как OpenAPI» даёт готовый фрагмент спецификации.',
        },
        en: {
          title: 'API description on a connector',
          text: 'The right-click menu of a connector has “API description…”: the method, path, parameters, headers, request body and responses, as in Swagger. A click on the connector opens the description on the right of the canvas, the connector label becomes “POST /payments”, and “Copy as OpenAPI” gives a ready-made fragment of the specification.',
        },
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-07',
    items: [
      {
        ru: {
          title: 'Импорт docker-compose',
          text: 'В меню «SQL и Mermaid» — «Импорт docker-compose…»: сервисы из docker-compose.yml становятся базами данных, кэшами, очередями и контейнерами с образом и портами в подписи, зависимости и адреса других сервисов в переменных окружения — связями с протоколом, а сети — рамками. Несколько файлов сливаются, как в docker compose.',
        },
        en: {
          title: 'Import docker-compose',
          text: 'The “SQL and Mermaid” menu has “Import docker-compose…”: the services of docker-compose.yml become databases, caches, queues and containers with the image and ports in the label, dependencies and addresses of other services in environment variables become connectors with a protocol, and networks become frames. Several files are merged as in docker compose.',
        },
      },
      {
        ru: {
          title: 'Импорт Kubernetes',
          text: 'В меню «SQL и Mermaid» — «Импорт Kubernetes…»: манифесты, вывод helm template или kustomize build становятся схемой развёртывания — нагрузки с образом, репликами и портами, Ingress и HTTPRoute шлюзами со связями по хостам и путям, внешние сервисы, связи по адресам сервисов в переменных и пространства имён рамками.',
        },
        en: {
          title: 'Import Kubernetes',
          text: 'The “SQL and Mermaid” menu has “Import Kubernetes…”: manifests and the output of helm template or kustomize build become a deployment diagram: workloads with their image, replicas and ports, Ingress and HTTPRoute as gateways with connectors by hosts and paths, external services, connectors by service addresses in variables, and namespaces as frames.',
        },
      },
      {
        ru: {
          title: 'Импорт Gradle',
          text: 'В меню «SQL и Mermaid» — «Импорт Gradle…»: модули многомодульной сборки становятся компонентами с технологиями — Kotlin, Spring Boot, Android, — зависимости между ними связями с конфигурацией, а папки модулей рамками. Точнее всего — граф из скрипта codraw.gradle, который окно даёт скачать; можно открыть и папку проекта.',
        },
        en: {
          title: 'Import Gradle',
          text: 'The “SQL and Mermaid” menu has “Import Gradle…”: the modules of a multi-module build become components with technologies such as Kotlin, Spring Boot and Android, dependencies between them become connectors with their configuration, and module folders become frames. The most accurate is the graph from the codraw.gradle script, which the dialog lets you download; you can also open the project folder.',
        },
      },
      {
        ru: {
          title: 'Архитектура как код',
          text: 'В меню «SQL и Mermaid» — «Архитектура как код…»: схема архитектуры страницы выгружается в Structurizr DSL, C4-PlantUML или Mermaid C4 — с системами, контейнерами, людьми, связями и их технологиями, — чтобы положить её в репозиторий рядом с кодом.',
        },
        en: {
          title: 'Architecture as code',
          text: 'The “SQL and Mermaid” menu has “Architecture as code…”: the architecture diagram of the page is exported to Structurizr DSL, C4-PlantUML or Mermaid C4, with systems, containers, people, relationships and their technologies, so you can keep it in the repository next to the code.',
        },
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-07',
    items: [
      {
        ru: {
          title: 'Миграция SQL',
          text: 'При сравнении версии с текущей доской и в предложении изменений кнопка «Миграция SQL» пишет миграцию схемы базы данных: переименованное поле остаётся переименованием, а не удалением. Для PostgreSQL, MySQL, Oracle, SQL Server, SQLite и ClickHouse — SQL, пара файлов Flyway или changeset Liquibase.',
        },
        en: {
          title: 'SQL migration',
          text: 'When you compare a version with the current board and in a change proposal, the “SQL migration” button writes a migration of the database schema: a renamed field stays a rename, not a deletion. For PostgreSQL, MySQL, Oracle, SQL Server, SQLite and ClickHouse: SQL, a pair of Flyway files or a Liquibase changeset.',
        },
      },
      {
        ru: {
          title: 'Импорт OpenAPI и AsyncAPI',
          text: 'В меню «SQL и Mermaid» — «Импорт OpenAPI / AsyncAPI…»: спецификации API становятся сервисами со списком эндпоинтов, топиками с отправителями и получателями сообщений и таблицами моделей данных, разложенными автоматически.',
        },
        en: {
          title: 'Import OpenAPI and AsyncAPI',
          text: 'The “SQL and Mermaid” menu has “Import OpenAPI / AsyncAPI…”: API specifications become services with a list of endpoints, topics with the senders and receivers of messages, and tables of data models, laid out automatically.',
        },
      },
      {
        ru: {
          title: 'Поиск, теги и папки досок',
          text: 'Над списком досок — «Поиск досок» по названию и по тексту на досках, порядок «Недавно открытые», «По названию» или «Недавно изменённые», а в меню доски — «Теги» и «Переместить в папку». Теги и папки видите только вы.',
        },
        en: {
          title: 'Board search, tags and folders',
          text: 'Above the list of boards there is “Search boards” by title and by the text on the boards, the order “Recently opened”, “By title” or “Recently changed”, and the board menu has “Tags” and “Move to folder”. Only you see your tags and folders.',
        },
      },
      {
        ru: {
          title: 'Статусы элементов',
          text: 'В меню правого щелчка фигуры, таблицы или группы — «Черновик», «Нужно ревью» и «Готово»: значок у элемента видят все участники, а кнопка «N на ревью» в шапке доски показывает, что ждёт проверки на всех страницах, и переходит к нужному элементу. Когда участник отмечает элемент «Нужно ревью», владелец доски получает уведомление.',
        },
        en: {
          title: 'Element statuses',
          text: 'The right-click menu of a shape, a table or a group has “Draft”, “Needs review” and “Done”: all members see the badge on the element, and the “N in review” button in the board header shows what awaits review on all pages and jumps to the element. When a member marks an element “Needs review”, the board owner gets a notification.',
        },
      },
      {
        ru: {
          title: 'Схема из готовой базы',
          text: '«Импорт SQL» понимает дампы pg_dump --schema-only и mysqldump --no-data: откройте файл — и таблицы со связями и индексами появятся на странице. Если администратор CoDraw разрешил, схему PostgreSQL можно загрузить и прямо из базы кнопкой «Подключиться к базе…».',
        },
        en: {
          title: 'Diagram from an existing database',
          text: '“Import SQL” understands pg_dump --schema-only and mysqldump --no-data dumps: open the file, and the tables with their connectors and indexes appear on the page. If the CoDraw administrator allows it, a PostgreSQL schema can also be loaded straight from the database with the “Connect to database…” button.',
        },
      },
      {
        ru: {
          title: 'Тёмная тема',
          text: 'Кнопка «Тема» рядом с вашим именем в шапке: «Как в системе», «Светлая» или «Тёмная». В тёмной теме тёмными становятся окна, панели и холст, а схема у других участников и в сохранённых файлах остаётся прежней.',
        },
        en: {
          title: 'Dark theme',
          text: 'The “Theme” button next to your name in the header: “As in the system”, “Light” or “Dark”. In the dark theme, dialogs, panels and the canvas become dark, while the diagram stays the same for other members and in saved files.',
        },
      },
      {
        ru: {
          title: 'Формат по образцу',
          text: '«Копировать стиль» и «Вставить стиль» в меню правого щелчка, на панели или клавишами Ctrl+Alt+C и Ctrl+Alt+V переносят заливку, линию и текст одного элемента на все выделенные.',
        },
        en: {
          title: 'Format painter',
          text: '“Copy style” and “Paste style” in the right-click menu, on the toolbar or with Ctrl+Alt+C and Ctrl+Alt+V carry the fill, line and text of one element over to all the selected ones.',
        },
      },
      {
        ru: {
          title: 'Стикеры',
          text: 'Клавиша N или двойной щелчок с Ctrl по пустому месту ставят стикер и сразу дают его написать, а длинный текст в нём уменьшается, чтобы поместиться. Панель под стикерами перекрашивает их, а внизу стикера видно, кто его написал.',
        },
        en: {
          title: 'Sticky notes',
          text: 'The N key or a Ctrl+double-click on an empty spot places a sticky note and lets you write in it right away, and long text in it shrinks to fit. The toolbar under sticky notes recolors them, and the bottom of a sticky note shows who wrote it.',
        },
      },
      {
        ru: {
          title: 'Ссылки у фигур',
          text: '«Ссылка…» в меню правого щелчка ведёт фигуру на другую страницу, другую доску или сайт. Щелчок по значку у фигуры или Ctrl+щелчок по ней открывают ссылку.',
        },
        en: {
          title: 'Links on shapes',
          text: '“Link…” in the right-click menu points a shape to another page, another board or a website. A click on the icon on the shape or a Ctrl+click on the shape opens the link.',
        },
      },
      {
        ru: {
          title: 'Карандаш',
          text: 'Кнопка «Карандаш» на панели инструментов или клавиша P: обведите область или набросайте стрелку прямо на схеме — линия останется на доске, и её сразу увидят все участники.',
        },
        en: {
          title: 'Pencil',
          text: 'The “Pencil” button on the toolbar or the P key: circle an area or sketch an arrow right on the diagram; the line stays on the board, and all members see it at once.',
        },
      },
      {
        ru: {
          title: 'Мини-карта',
          text: 'В правом нижнем углу холста — уменьшенная страница с рамкой видимой области: щелчок или перетаскивание рамки переносят туда холст, а цветные точки показывают, куда смотрят другие участники. Свернуть её можно кнопкой в углу или клавишей M.',
        },
        en: {
          title: 'Minimap',
          text: 'The bottom right corner of the canvas shows a small copy of the page with a frame around the visible area: a click or dragging the frame moves the canvas there, and colored dots show where other members are looking. Collapse it with the button in the corner or the M key.',
        },
      },
      {
        ru: {
          title: 'Изображения на доске',
          text: 'Скриншот, логотип или макет можно вставить на холст (Ctrl+V), перетащить файлом или добавить кнопкой «Изображение» в панели фигур. Картинку двигают и меняют её размер с сохранением пропорций, а в .drawio, PNG, SVG и PDF она попадает внутрь файла.',
        },
        en: {
          title: 'Images on the board',
          text: 'A screenshot, a logo or a mockup can be pasted onto the canvas (Ctrl+V), dropped as a file or added with the “Image” button in the shapes panel. An image is moved and resized keeping its proportions, and it goes inside the file in .drawio, PNG, SVG and PDF.',
        },
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-07',
    items: [
      {
        ru: {
          title: 'Экспорт в PDF',
          text: 'В окне «Экспорт в изображение» — «Сохранить PDF»: текущая страница, выделенное или все страницы доски в векторном PDF, где подписи остаются текстом.',
        },
        en: {
          title: 'Export to PDF',
          text: 'The “Export as image” dialog has “Save PDF”: the current page, the selection or all the pages of the board as a vector PDF in which labels stay text.',
        },
      },
      {
        ru: {
          title: 'Поворот фигур',
          text: 'Фигуру поворачивает поле «Поворот» в окне «Размер» или круглая стрелка у её угла: шагами по 15°, а если зажать Alt во время поворота — по градусу.',
        },
        en: {
          title: 'Rotating shapes',
          text: 'A shape is rotated with the “Rotation” field in the “Size” dialog or with the round arrow at its corner: in steps of 15°, or by single degrees if you hold Alt while rotating.',
        },
      },
      {
        ru: {
          title: 'Поиск на доске',
          text: 'Ctrl+F (на Mac — Cmd+F) ищет текст фигур, связей и таблиц на всех страницах доски, а Enter переходит к следующему совпадению.',
        },
        en: {
          title: 'Search on the board',
          text: 'Ctrl+F (Cmd+F on a Mac) searches the text of shapes, connectors and tables on all pages of the board, and Enter goes to the next match.',
        },
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-06',
    items: [
      {
        ru: {
          title: 'Что нового',
          text: 'После обновления CoDraw показывает, что в нём появилось. Открыть список снова можно кнопкой со звёздочками в шапке.',
        },
        en: {
          title: 'What’s new',
          text: 'After an update, CoDraw shows what is new in it. You can open the list again with the sparkles button in the header.',
        },
      },
      {
        ru: {
          title: 'Прозрачность заливки',
          text: 'В окне «Заливка» — ползунок «Прозрачность»: фигура становится полупрозрачной, а её линия и текст остаются чёткими.',
        },
        en: {
          title: 'Fill transparency',
          text: 'The “Fill” dialog has a “Transparency” slider: the shape becomes semi-transparent, while its line and text stay crisp.',
        },
      },
      {
        ru: {
          title: 'Шрифты',
          text: 'Выбор «Шрифт» в блоке текста: Arial, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman и Courier New.',
        },
        en: {
          title: 'Fonts',
          text: 'The “Font” choice in the text section: Arial, Verdana, Tahoma, Trebuchet MS, Georgia, Times New Roman and Courier New.',
        },
      },
      {
        ru: {
          title: 'Перенос текста',
          text: 'Кнопка «Перенос» разбивает длинную подпись на строки по ширине фигуры и пересчитывает их, когда фигуру растягивают.',
        },
        en: {
          title: 'Text wrapping',
          text: 'The “Wrap” button breaks a long label into lines by the width of the shape and rewraps them when the shape is stretched.',
        },
      },
      {
        ru: {
          title: 'Базовые таблицы',
          text: 'Общие поля вроде id и created_at можно вынести в базовую таблицу: таблицы, выбравшие её «Базой», получают эти поля и их изменения.',
        },
        en: {
          title: 'Base tables',
          text: 'Common fields such as id and created_at can be moved to a base table: tables that choose it as their “Base” get these fields and their changes.',
        },
      },
      {
        ru: {
          title: 'Индексы таблиц',
          text: '«Добавить индекс» на панели таблицы: составные, уникальные и частичные индексы видны под полями, попадают в выгрузку SQL и читаются при импорте.',
        },
        en: {
          title: 'Table indexes',
          text: '“Add index” on the table toolbar: composite, unique and partial indexes are shown below the fields, go into the SQL export and are read on import.',
        },
      },
      {
        ru: {
          title: 'Таблицы как SQL',
          text: 'Скопированные таблицы вставляются в редактор кода или чат как CREATE TABLE, а в CoDraw — снова таблицами.',
        },
        en: {
          title: 'Tables as SQL',
          text: 'Copied tables are pasted into a code editor or a chat as CREATE TABLE, and into CoDraw as tables again.',
        },
      },
      {
        ru: {
          title: 'Поле одной строкой',
          text: 'Enter заканчивает ввод поля, а «id uuid primary key not null» превращается в «id uuid PK NOT NULL».',
        },
        en: {
          title: 'A field in one line',
          text: 'Enter finishes entering a field, and “id uuid primary key not null” turns into “id uuid PK NOT NULL”.',
        },
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-06',
    items: [
      {
        ru: {
          title: 'Участники и приглашения',
          text: 'Владелец доски даёт людям роль «Редактирование» или «Просмотр» и создаёт ссылки-приглашения с ролью.',
        },
        en: {
          title: 'Members and invitations',
          text: 'The board owner gives people the role “Edit” or “View” and creates invitation links with a role.',
        },
      },
      {
        ru: {
          title: 'Запрос доступа',
          text: 'На закрытой доске можно запросить просмотр или правку, а владелец одобряет запрос в окне «Поделиться».',
        },
        en: {
          title: 'Access requests',
          text: 'On a closed board you can request viewing or editing, and the owner approves the request in the “Share” dialog.',
        },
      },
      {
        ru: {
          title: 'Уведомления',
          text: 'Колокольчик в шапке сообщает об упоминаниях, ответах в ветках, запросах доступа и новых правах.',
        },
        en: {
          title: 'Notifications',
          text: 'The bell in the header tells you about mentions, replies in threads, access requests and new rights.',
        },
      },
      {
        ru: {
          title: 'Комментарии на холсте',
          text: 'Кнопка «Комментарий» или клавиша C ставят ветку в любую точку страницы. К комментариям можно добавлять реакции и назначать ответственного.',
        },
        en: {
          title: 'Comments on the canvas',
          text: 'The “Comment” button or the C key places a thread anywhere on the page. Comments can get reactions, and threads can get an assignee.',
        },
      },
      {
        ru: {
          title: 'Указка и сообщения у курсора',
          text: 'Клавиша K включает лазерную указку, след которой видят все, а клавиша / открывает короткое сообщение прямо у курсора.',
        },
        en: {
          title: 'Laser pointer and messages at the cursor',
          text: 'The K key turns on a laser pointer whose trail everyone sees, and the / key opens a short message right at the cursor.',
        },
      },
      {
        ru: {
          title: 'Показ всем',
          text: 'Кнопка «Показать всем» ведёт остальных участников за вашим видом: страница, место и масштаб.',
        },
        en: {
          title: 'Presenting to everyone',
          text: 'The “Present to everyone” button makes the other members follow your view: the page, the place and the zoom.',
        },
      },
      {
        ru: {
          title: 'Кто правит и кто менял',
          text: 'Видно, кто сейчас редактирует подпись, кто и когда последним изменил элемент, а закреплённые элементы не сдвинуть случайно.',
        },
        en: {
          title: 'Who is editing and who changed it',
          text: 'You see who is editing a label right now and who changed an element last and when, and locked elements cannot be moved by accident.',
        },
      },
      {
        ru: {
          title: 'Что изменилось с прошлого визита',
          text: 'При возвращении на доску CoDraw показывает, кто что поменял, и подсвечивает изменения.',
        },
        en: {
          title: 'What changed since your last visit',
          text: 'When you return to a board, CoDraw shows who changed what and highlights the changes.',
        },
      },
      {
        ru: {
          title: 'Версии',
          text: 'Версия называет, кто её изменил, сравнивается с текущей доской, а выделенные элементы из неё можно восстановить по одному.',
        },
        en: {
          title: 'Versions',
          text: 'A version names who changed the board, can be compared with the current board, and selected elements can be restored from it one by one.',
        },
      },
      {
        ru: {
          title: 'Предложения изменений',
          text: 'Любой участник предлагает изменения в черновике доски, а владелец или редактор сравнивает и принимает их.',
        },
        en: {
          title: 'Change proposals',
          text: 'Any member proposes changes in a draft of the board, and the owner or an editor compares and accepts them.',
        },
      },
      {
        ru: {
          title: 'Работа без связи',
          text: 'Открытые доски хранятся в браузере: без интернета правки сохраняются и уходят, когда связь вернётся.',
        },
        en: {
          title: 'Working offline',
          text: 'Opened boards are kept in the browser: without the internet, edits are saved and sent when the connection returns.',
        },
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-05',
    items: [
      {
        ru: {
          title: 'Доски и доступ по ссылке',
          text: 'Доски можно переименовывать и удалять, а для ссылки выбрать «Только я», «Просмотр» или «Редактирование».',
        },
        en: {
          title: 'Boards and link access',
          text: 'Boards can be renamed and deleted, and the link can be set to “Only me”, “View” or “Edit”.',
        },
      },
      {
        ru: {
          title: 'Шаблоны',
          text: 'Новую доску можно начать с ER-диаграммы, схемы C4, микросервисов или деплоя в Kubernetes.',
        },
        en: {
          title: 'Templates',
          text: 'A new board can start from an ER diagram, a C4 diagram, microservices or a Kubernetes deployment.',
        },
      },
      {
        ru: {
          title: 'История версий',
          text: 'CoDraw сохраняет версии доски по ходу работы, их можно посмотреть и вернуть.',
        },
        en: {
          title: 'Version history',
          text: 'CoDraw saves versions of the board as you work, and you can view and restore them.',
        },
      },
      {
        ru: {
          title: 'Комментарии',
          text: 'Ветки комментариев к элементам с упоминаниями участников и отметкой «Решено».',
        },
        en: {
          title: 'Comments',
          text: 'Comment threads on elements, with mentions of members and a “Resolved” mark.',
        },
      },
      {
        ru: {
          title: 'Следовать за участником',
          text: 'Щелчок по участнику в списке — и ваш холст повторяет его страницу, место и масштаб.',
        },
        en: {
          title: 'Following a member',
          text: 'Click a member in the list, and your canvas follows their page, place and zoom.',
        },
      },
      {
        ru: {
          title: 'Стили линий и текста',
          text: 'Толщина и вид линии, форма связи, жирный, курсив, подчёркивание и выравнивание текста.',
        },
        en: {
          title: 'Line and text styles',
          text: 'Line width and style, connector shape, bold, italic, underline and text alignment.',
        },
      },
      {
        ru: {
          title: 'Размер фигур и текста',
          text: 'Ширину, высоту и положение фигуры можно задать числом, размер текста — полем и кнопками, а автоширина подгоняет фигуру под подпись.',
        },
        en: {
          title: 'Shape and text size',
          text: 'The width, height and position of a shape can be set as numbers and the text size with a field and buttons, and auto width fits the shape to its label.',
        },
      },
      {
        ru: {
          title: 'Быстрое построение схем',
          text: 'Стрелки вокруг фигуры добавляют соседнюю фигуру сразу со связью, поиск находит фигуры по словам вроде «redis» или «kafka».',
        },
        en: {
          title: 'Quick diagramming',
          text: 'Arrows around a shape add a neighboring shape together with a connector, and search finds shapes by words like “redis” or “kafka”.',
        },
      },
      {
        ru: {
          title: 'Раскладка и выравнивание',
          text: '«Автораскладка» расставляет связанные фигуры слоями, есть выравнивание, распределение, направляющие и сдвиг стрелками.',
        },
        en: {
          title: 'Layout and alignment',
          text: '“Auto layout” arranges connected shapes in layers, and there are alignment, distribution, guides and nudging with the arrow keys.',
        },
      },
      {
        ru: {
          title: 'Связи обходят фигуры',
          text: 'Ортогональные связи сами прокладываются вокруг фигур и подходят к нужному полю таблицы.',
        },
        en: {
          title: 'Connectors route around shapes',
          text: 'Orthogonal connectors route themselves around shapes and attach to the right field of a table.',
        },
      },
      {
        ru: {
          title: 'SQL и Mermaid',
          text: 'Импорт схемы из SQL и миграций Flyway, выгрузка в SQL, вставка схем Mermaid прямо на холст.',
        },
        en: {
          title: 'SQL and Mermaid',
          text: 'Importing a schema from SQL and Flyway migrations, exporting to SQL, and pasting Mermaid diagrams right onto the canvas.',
        },
      },
      {
        ru: {
          title: 'Буфер обмена и изображения',
          text: 'Копирование между вкладками и с draw.io, меню правого щелчка, экспорт страницы в PNG и SVG и «живая картинка» доски для README.',
        },
        en: {
          title: 'Clipboard and images',
          text: 'Copying between tabs and to and from draw.io, a right-click menu, exporting a page to PNG and SVG, and a “live image” of the board for a README.',
        },
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-04',
    items: [
      {
        ru: {
          title: 'Совместный редактор диаграмм',
          text: 'Несколько человек одновременно правят одну доску и сразу видят изменения друг друга.',
        },
        en: {
          title: 'Collaborative diagram editor',
          text: 'Several people edit one board at the same time and see each other’s changes right away.',
        },
      },
      {
        ru: {
          title: 'Фигуры',
          text: 'Основные фигуры, таблицы баз данных с полями и связями между ними, фигуры архитектуры, C4 и инфраструктуры.',
        },
        en: {
          title: 'Shapes',
          text: 'Basic shapes, database tables with fields and connectors between them, and architecture, C4 and infrastructure shapes.',
        },
      },
      {
        ru: {
          title: 'Страницы',
          text: 'У доски может быть несколько страниц, и ссылка открывает нужную.',
        },
        en: {
          title: 'Pages',
          text: 'A board can have several pages, and a link opens the one you need.',
        },
      },
      {
        ru: {
          title: 'Цвета',
          text: 'Заливка, цвет линии и текста из палитры или любой свой.',
        },
        en: {
          title: 'Colors',
          text: 'Fill, line and text colors from the palette or any color of your own.',
        },
      },
      {
        ru: {
          title: 'Файлы draw.io',
          text: 'Доску можно сохранить в .drawio и загрузить файл draw.io в доску.',
        },
        en: {
          title: 'draw.io files',
          text: 'A board can be saved as .drawio, and a draw.io file can be loaded into a board.',
        },
      },
      {
        ru: {
          title: 'Вход',
          text: 'Через GitHub, Google или без входа, гостем.',
        },
        en: {
          title: 'Sign-in',
          text: 'With GitHub, with Google or without signing in, as a guest.',
        },
      },
    ],
  },
]
