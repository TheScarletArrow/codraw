# Spec Delta

## ADDED Requirements

### Requirement: Свойства элементов в файлах draw.io

Экспорт в `.drawio` и копирование в буфер обмена SHALL записывать свойства фигуры атрибутами элемента `<object>`, в
который обёрнута её ячейка: `name`, `kind`, `technology`, `description`, `owner`, `tags` (теги через пробел) и
`codrawElement`, — а свойства связи — атрибутами `technology` и `interaction` (`sync` или `async`); строка стиля SHALL
их не содержать. Подпись фигуры со свойствами SHALL записываться с `placeholders="1"` шаблоном с `%name%`,
`%technology%` и `%description%` вместо значений свойств, если такой шаблон даёт ту же подпись, иначе — как есть.
Импорт файла и вставка фрагмента draw.io SHALL подставлять в подпись `<object placeholders="1">` значения его
атрибутов вместо `%атрибут%`; SHALL делать свойствами фигуры атрибуты `<object>` с `codrawElement`, а также атрибуты
фигур C4 draw.io `c4Name`, `c4Type`, `c4Technology` и `c4Description`; SHALL делать свойствами связи атрибуты
`technology`, `interaction` и `c4Technology`. Прочитанные так атрибуты SHALL не оставаться своими свойствами ячейки.

#### Scenario: Туда и обратно

- **WHEN** доску с Container C4 «API» с технологией `Spring Boot`, владельцем «Команда заказов» и тегами `core`, `pci`
  экспортируют в `.drawio` и импортируют в новую доску
- **THEN** у фигуры новой доски те же свойства и подпись, а в файле `<object placeholders="1" name="API"
  technology="Spring Boot" tags="core pci" …>` с подписью «%name%», «[Container: %technology%]»

#### Scenario: C4 из draw.io

- **WHEN** импортируют файл draw.io с фигурой C4 `<object placeholders="1" c4Name="Billing" c4Type="Container"
  c4Technology="Go" label="<b>%c4Name%</b><div>[%c4Type%: %c4Technology%]</div>">`
- **THEN** подпись фигуры — «Billing» и «[Container: Go]», а в панели «Свойства» имя «Billing», тип Container и
  технология `Go`
