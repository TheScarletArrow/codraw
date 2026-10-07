# Tasks

## 1. Разбор манифестов

- [ ] 1.1 frontend: `loadDocuments` в `apiSpec/loadDocument.ts` — несколько документов YAML через `parseAllDocuments`, пустые документы, JSON, ошибки со строкой и столбцом, предел размера; проверка: unit-тесты — несколько документов, ошибка во втором документе, JSON, пустой хвост `---`
- [ ] 1.2 frontend: `infra/parseKubernetes.ts` — шаблоны Helm, объекты с `apiVersion` и `kind`, `kind: List`, нагрузки и их под (Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob, Pod), Service, Ingress v1 и v1beta1, HTTPRoute, ConfigMap, пространство `default`; проверка: unit-тесты — каждый вид объекта, ошибки «не манифесты» и «шаблон Helm», несколько файлов

## 2. Граф Kubernetes

- [ ] 2.1 frontend: `infra/kubernetesGraph.ts` — нагрузки фигурами по образу (`imageKind`), подпись с видом, расписанием, репликами и портами сервисов, `selector`, ExternalName, Ingress и HTTPRoute со связями «хост/путь», связи по переменным с ConfigMap и DNS-именами сервисов, рамки «Кластер Kubernetes», C4, сводка, предел 300; проверка: unit-тесты по сценариям спецификации

## 3. Окно и меню

- [ ] 3.1 frontend: формат в `infra/InfraImport.tsx` (compose и Kubernetes) и пункт «Импорт Kubernetes…» в `sql/SqlMenu.tsx`; проверка: компонентные тесты окна для Kubernetes и меню, тесты compose без изменений

## 4. Сквозная проверка и документация

- [ ] 4.1 e2e: импорт манифестов магазина — нагрузки, шлюз, внешний сервис, связи с подписями, рамки у второго участника, один шаг отмены; проверка: `kubernetes-import.spec.ts` и `compose-import.spec.ts` зелёные
- [ ] 4.2 docs: README, `docs/running.md`, «План работ», «Что нового» 0.7.0; проверка: документация описывает импорт, тесты «Что нового» зелёные
