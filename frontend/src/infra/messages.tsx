import type { ReactNode } from 'react'
import { defineMessages } from '../i18n/i18n.ts'

export const infraMessages = defineMessages({
  ru: {
    parseFailed: 'Не удалось разобрать файлы',
    environmentTitle: 'Адреса других сервисов в переменных окружения — связями с протоколом',
    environment: 'Связи по переменным окружения',
    c4Title: 'Фигуры Container и Database нотации C4',
    c4: 'Фигуры C4',
    limits: 'Ограничения формата',
    warnings: 'Предупреждения',
    sourceFiles: (count: number) => `${count} файлов`,
    compose: {
      title: 'Импорт docker-compose',
      source: 'docker-compose',
      filesLabel: 'Файлы docker-compose',
      hint: 'docker-compose.yml или compose.yaml; несколько файлов сливаются, как docker compose -f a.yml -f b.yml',
      summary: (services: number, links: number, networks: number) =>
        `Сервисов: ${services}, связей: ${links}, сетей: ${networks}`,
      tooMany: (count: number, max: number) =>
        `Слишком много сервисов: ${count}, за раз можно добавить не больше ${max} — откройте меньше файлов`,
      notCompose: (name: string) => `${name}: это не docker-compose — нет раздела services`,
    },
    kubernetes: {
      title: 'Импорт Kubernetes',
      source: 'Kubernetes',
      textLabel: 'Манифесты Kubernetes',
      filesLabel: 'Файлы Kubernetes',
      hint: 'Манифесты, вывод helm template или kustomize build — в YAML или JSON',
      summary: (workloads: number, gateways: number, externals: number, links: number, namespaces: number) =>
        `Рабочих нагрузок: ${workloads}, шлюзов: ${gateways}, внешних сервисов: ${externals}, ` +
        `связей: ${links}, пространств имён: ${namespaces}`,
      tooMany: (count: number, max: number) =>
        `Слишком много фигур: ${count}, за раз можно добавить не больше ${max} — откройте меньше файлов`,
      helmTemplate: (name: string) => `${name}: это шаблон Helm — выполните helm template и откройте результат`,
      notManifests: (name: string) => `${name}: это не манифесты Kubernetes — нет объектов с apiVersion и kind`,
    },
    terraform: {
      title: 'Импорт Terraform',
      source: 'Terraform',
      filesLabel: 'Файлы Terraform',
      hint: 'Вывод terraform show -json: состояния или сохранённого плана (terraform plan -out=plan.out, затем terraform show -json plan.out > plan.json)',
      limits: (megabytes: number, resources: number) => [
        'Читается только JSON из terraform show -json (или tofu show -json) — состояния или сохранённого плана. Файлы .tf и terraform.tfstate не читаются: окно подскажет команду.',
        'Terraform и провайдеры не запускаются, файлы разбираются в браузере и никуда не отправляются.',
        'Из значений ресурсов читаются только безопасные атрибуты — имя, движок и версия, тип машины, сеть, регион, порт; помеченные sensitive не читаются никогда.',
        'Экземпляры count и for_each — одна фигура с ×N; источники данных (data.*) не рисуются, связи проходят через них; лишние связи, которые следуют из других, не рисуются.',
        'Связи плана через local.* не видны: Terraform не выводит локальные значения. В выводе состояния после apply они есть.',
        'Несколько файлов — несколько стеков, каждый в своей рамке; связей между стеками нет.',
        `Файл — до ${megabytes} МБ, за раз — до ${resources} ресурсов.`,
      ],
      binaryPlan: 'это двоичный файл плана — выполните terraform show -json для него и откройте результат',
      configuration: 'это конфигурация Terraform — сохраните план или состояние командой terraform show -json',
      stateFile: 'это файл состояния — выполните terraform show -json и откройте результат',
      notShowJson: 'это не вывод terraform show -json — нет format_version',
      noResources: 'в файле нет ресурсов',
      instances: (count: number) => `, экземпляров: ${count}`,
      provider: (provider: string) => `Провайдер: ${provider}`,
      summary: (resources: number, links: number, modules: number) =>
        `Ресурсов: ${resources}, связей: ${links}, модулей: ${modules}`,
      stacks: (count: number) => `, стеков: ${count}`,
      andMore: (listed: string, more: number) => `${listed} и ещё ${more}`,
      generic: (types: string) => `Своей фигуры нет, нарисованы универсальной: ${types}`,
      errored: (stack: string) => `${stack}: план завершился с ошибкой — ресурсов может не хватать`,
      missing: (stack: string, links: string) => `${stack}: нет в файле, связи не показаны: ${links}`,
      locals: (stack: string, locals: string) =>
        `${stack}: план не выводит local.*, связи через них могут отсутствовать: ${locals}`,
      deleted: (stack: string, resources: string) => `${stack}: план удаляет, на схеме их нет: ${resources}`,
      tooMany: (count: number, max: number) => `Слишком много ресурсов: ${count}, за раз можно добавить не больше ${max}`,
    },
    gradle: {
      title: 'Импорт Gradle',
      intro: (script: ReactNode, command: ReactNode, output: ReactNode) => (
        <>
          Точнее всего — граф из скрипта: скачайте {script}, выполните в корне проекта {command} и откройте {output}. Папку
          проекта CoDraw прочитает и без Gradle, но только типовые записи. Файлы читаются в браузере и никуда не
          отправляются.
        </>
      ),
      download: 'Скачать codraw.gradle',
      graphLabel: 'Граф модулей',
      openGraph: 'Открыть граф…',
      graphFiles: 'Файлы графа Gradle',
      openFolder: 'Открыть папку проекта…',
      folderLabel: 'Папка проекта Gradle',
      folder: (name: string, files: number) => `Папка ${name}: файлов сборки ${files}`,
      testsTitle: 'testImplementation и другие конфигурации тестов — тоже связями',
      tests: 'Тестовые зависимости',
      c4Title: 'Модули — фигурами Component нотации C4',
      hint: 'Граф из codraw.gradle или папка проекта Gradle',
      sourceFiles: (count: number) => `${count} файлов Gradle`,
      summary: (modules: number, links: number, groups: number, skipped: number) =>
        `Модулей: ${modules}, связей: ${links}, групп: ${groups}, пропущено: ${skipped}`,
      tooMany: (count: number, max: number) => `Слишком много модулей: ${count}, за раз можно добавить не больше ${max}`,
      notGraph: (name: string, command: string) => `${name}: это не граф модулей из codraw.gradle — выполните ${command}`,
      noSettings:
        'В папке нет settings.gradle или settings.gradle.kts — выберите корень сборки или откройте граф из скрипта codraw.gradle',
    },
  },
  en: {
    parseFailed: 'Could not parse the files',
    environmentTitle: 'Addresses of other services in environment variables become connectors with the protocol',
    environment: 'Connectors from environment variables',
    c4Title: 'Container and Database shapes of the C4 notation',
    c4: 'C4 shapes',
    limits: 'Format limitations',
    warnings: 'Warnings',
    sourceFiles: (count: number) => `${count} files`,
    compose: {
      title: 'Import docker-compose',
      source: 'docker-compose',
      filesLabel: 'docker-compose files',
      hint: 'docker-compose.yml or compose.yaml; several files are merged, as with docker compose -f a.yml -f b.yml',
      summary: (services: number, links: number, networks: number) =>
        `Services: ${services}, connectors: ${links}, networks: ${networks}`,
      tooMany: (count: number, max: number) =>
        `Too many services: ${count}, at most ${max} can be added at once — open fewer files`,
      notCompose: (name: string) => `${name}: this is not docker-compose — there is no services section`,
    },
    kubernetes: {
      title: 'Import Kubernetes',
      source: 'Kubernetes',
      textLabel: 'Kubernetes manifests',
      filesLabel: 'Kubernetes files',
      hint: 'Manifests, output of helm template or kustomize build — in YAML or JSON',
      summary: (workloads: number, gateways: number, externals: number, links: number, namespaces: number) =>
        `Workloads: ${workloads}, gateways: ${gateways}, external services: ${externals}, ` +
        `connectors: ${links}, namespaces: ${namespaces}`,
      tooMany: (count: number, max: number) =>
        `Too many shapes: ${count}, at most ${max} can be added at once — open fewer files`,
      helmTemplate: (name: string) => `${name}: this is a Helm template — run helm template and open the result`,
      notManifests: (name: string) => `${name}: these are not Kubernetes manifests — there are no objects with apiVersion and kind`,
    },
    terraform: {
      title: 'Import Terraform',
      source: 'Terraform',
      filesLabel: 'Terraform files',
      hint: 'Output of terraform show -json for a state or a saved plan (terraform plan -out=plan.out, then terraform show -json plan.out > plan.json)',
      limits: (megabytes: number, resources: number) => [
        'Only JSON from terraform show -json (or tofu show -json) is read — of a state or a saved plan. .tf files and terraform.tfstate are not read: the window suggests the command.',
        'Terraform and the providers are not run; the files are parsed in the browser and are not sent anywhere.',
        'Only safe attributes of the resource values are read — name, engine and version, machine type, network, region, port; values marked sensitive are never read.',
        'count and for_each instances are one shape with ×N; data sources (data.*) are not drawn, connectors pass through them; redundant connectors implied by others are not drawn.',
        'Plan connectors through local.* are not visible: Terraform does not output local values. The state output after apply has them.',
        'Several files are several stacks, each in its own frame; there are no connectors between stacks.',
        `A file is up to ${megabytes} MB, up to ${resources} resources at once.`,
      ],
      binaryPlan: 'this is a binary plan file — run terraform show -json for it and open the result',
      configuration: 'this is Terraform configuration — save the plan or the state with terraform show -json',
      stateFile: 'this is a state file — run terraform show -json and open the result',
      notShowJson: 'this is not output of terraform show -json — there is no format_version',
      noResources: 'the file has no resources',
      instances: (count: number) => `, instances: ${count}`,
      provider: (provider: string) => `Provider: ${provider}`,
      summary: (resources: number, links: number, modules: number) =>
        `Resources: ${resources}, connectors: ${links}, modules: ${modules}`,
      stacks: (count: number) => `, stacks: ${count}`,
      andMore: (listed: string, more: number) => `${listed} and ${more} more`,
      generic: (types: string) => `No shape of their own, drawn with a generic one: ${types}`,
      errored: (stack: string) => `${stack}: the plan failed — some resources may be missing`,
      missing: (stack: string, links: string) => `${stack}: not in the file, connectors not shown: ${links}`,
      locals: (stack: string, locals: string) =>
        `${stack}: the plan does not output local.*, connectors through them may be missing: ${locals}`,
      deleted: (stack: string, resources: string) => `${stack}: deleted by the plan, not on the diagram: ${resources}`,
      tooMany: (count: number, max: number) => `Too many resources: ${count}, at most ${max} can be added at once`,
    },
    gradle: {
      title: 'Import Gradle',
      intro: (script: ReactNode, command: ReactNode, output: ReactNode) => (
        <>
          The most accurate is the graph from the script: download {script}, run {command} in the project root and open{' '}
          {output}. CoDraw also reads a project folder without Gradle, but only the typical declarations. The files are read
          in the browser and are not sent anywhere.
        </>
      ),
      download: 'Download codraw.gradle',
      graphLabel: 'Module graph',
      openGraph: 'Open graph…',
      graphFiles: 'Gradle graph files',
      openFolder: 'Open project folder…',
      folderLabel: 'Gradle project folder',
      folder: (name: string, files: number) => `Folder ${name}: build files ${files}`,
      testsTitle: 'testImplementation and other test configurations become connectors too',
      tests: 'Test dependencies',
      c4Title: 'Modules as Component shapes of the C4 notation',
      hint: 'A graph from codraw.gradle or a Gradle project folder',
      sourceFiles: (count: number) => `${count} Gradle files`,
      summary: (modules: number, links: number, groups: number, skipped: number) =>
        `Modules: ${modules}, connectors: ${links}, groups: ${groups}, skipped: ${skipped}`,
      tooMany: (count: number, max: number) => `Too many modules: ${count}, at most ${max} can be added at once`,
      notGraph: (name: string, command: string) => `${name}: this is not a module graph from codraw.gradle — run ${command}`,
      noSettings:
        'The folder has no settings.gradle or settings.gradle.kts — choose the root of the build or open the graph from the codraw.gradle script',
    },
  },
})
