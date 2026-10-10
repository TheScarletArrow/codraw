import { defineMessages } from '../i18n/i18n.ts'

/** The comments that the generated SQL and migrations carry: what a database cannot do and what loses data. */
export const sqlMessages = defineMessages({
  ru: {
    notNullWithoutDefault: (table: string, column: string) =>
      `Столбец ${table}.${column} NOT NULL без DEFAULT не добавится в таблицу со строками: допишите DEFAULT или заполните его отдельно`,
    skippedMethod: (method: string, label: string) => `Метод индекса ${method} пропущен: в ${label} его нет`,
    mysqlModify: 'MODIFY COLUMN задаёт столбец заново: допишите DEFAULT, AUTO_INCREMENT и COMMENT, если они у него есть',
    sqliteRebuild: 'таблицу нужно пересоздать: новая таблица, перенос строк, DROP TABLE и RENAME',
    sqliteDropForeignKey: (key: string, table: string, rebuild: string) =>
      `SQLite не снимает внешний ключ ${key} готовой таблицы ${table}: ${rebuild}`,
    sqlitePrimaryKey: (table: string, rebuild: string) => `SQLite не меняет первичный ключ готовой таблицы ${table}: ${rebuild}`,
    sqliteNotNull: (column: string) => `SQLite добавляет столбец ${column} NOT NULL только с DEFAULT: допишите его`,
    sqliteAlterColumn: (column: string, rebuild: string) => `SQLite не меняет тип и NOT NULL столбца ${column}: ${rebuild}`,
    sqliteAddForeignKey: (key: string, table: string, rebuild: string) =>
      `SQLite не добавляет внешний ключ ${key} в готовую таблицу ${table}: ${rebuild}`,
    clickhouseDropForeignKey: (key: string) => `В ClickHouse нет внешних ключей: ${key} не снимается`,
    clickhouseDropIndex: (index: string) => `Индексы ClickHouse задаются иначе: ${index} не снимается`,
    clickhouseDropUnique: (name: string) => `В ClickHouse нет ограничений UNIQUE: ${name} не снимается`,
    clickhousePrimaryKey: (table: string) =>
      `ClickHouse не меняет первичный ключ (ORDER BY) готовой таблицы ${table}: её нужно пересоздать`,
    clickhouseNullable: (column: string) =>
      `ClickHouse задаёт NULL типом Nullable(…), а не NOT NULL: смените тип ${column}`,
    clickhouseAddUnique: (column: string) => `В ClickHouse нет ограничений UNIQUE: ${column} не станет уникальным`,
    clickhouseCreateIndex: (index: string) => `Индексы ClickHouse задаются иначе (пропуск данных): ${index} не создаётся`,
    clickhouseAddForeignKey: (reference: string) => `В ClickHouse нет внешних ключей: ${reference} не создаётся`,
    warning: (warning: string) => `ВНИМАНИЕ: ${warning}`,
    columnDropped: (column: string) => `столбец ${column} удаляется вместе с данными`,
    typeNarrowed: (column: string, from: string, to: string) =>
      `тип ${column} меняется с ${from} на ${to}: значения могут не преобразоваться или обрезаться`,
    tableDropped: (table: string) => `таблица ${table} удаляется вместе с данными`,
    migrationTitle: (from: string, to: string) => `Миграция схемы CoDraw: ${from} → ${to}`,
    database: (label: string) => `СУБД: ${label}`,
    repeatedTable: (name: string) => `Таблица ${name} нарисована несколько раз: миграция берёт первую`,
    viewWithoutQuery: (name: string) => `Запрос представления ${name} не задан: столбцы без строк`,
  },
  en: {
    notNullWithoutDefault: (table: string, column: string) =>
      `Column ${table}.${column} NOT NULL without DEFAULT cannot be added to a table with rows: add a DEFAULT or fill it separately`,
    skippedMethod: (method: string, label: string) => `Index method ${method} skipped: ${label} does not have it`,
    mysqlModify: 'MODIFY COLUMN redefines the column: add DEFAULT, AUTO_INCREMENT and COMMENT if it has them',
    sqliteRebuild: 'the table must be rebuilt: a new table, copying the rows, DROP TABLE and RENAME',
    sqliteDropForeignKey: (key: string, table: string, rebuild: string) =>
      `SQLite cannot drop foreign key ${key} of existing table ${table}: ${rebuild}`,
    sqlitePrimaryKey: (table: string, rebuild: string) =>
      `SQLite cannot change the primary key of existing table ${table}: ${rebuild}`,
    sqliteNotNull: (column: string) => `SQLite adds NOT NULL column ${column} only with a DEFAULT: add one`,
    sqliteAlterColumn: (column: string, rebuild: string) => `SQLite cannot change the type and NOT NULL of column ${column}: ${rebuild}`,
    sqliteAddForeignKey: (key: string, table: string, rebuild: string) =>
      `SQLite cannot add foreign key ${key} to existing table ${table}: ${rebuild}`,
    clickhouseDropForeignKey: (key: string) => `ClickHouse has no foreign keys: ${key} is not dropped`,
    clickhouseDropIndex: (index: string) => `ClickHouse indexes are defined differently: ${index} is not dropped`,
    clickhouseDropUnique: (name: string) => `ClickHouse has no UNIQUE constraints: ${name} is not dropped`,
    clickhousePrimaryKey: (table: string) =>
      `ClickHouse cannot change the primary key (ORDER BY) of existing table ${table}: it must be rebuilt`,
    clickhouseNullable: (column: string) =>
      `ClickHouse defines NULL by the Nullable(…) type, not by NOT NULL: change the type of ${column}`,
    clickhouseAddUnique: (column: string) => `ClickHouse has no UNIQUE constraints: ${column} will not become unique`,
    clickhouseCreateIndex: (index: string) => `ClickHouse indexes are defined differently (data skipping): ${index} is not created`,
    clickhouseAddForeignKey: (reference: string) => `ClickHouse has no foreign keys: ${reference} is not created`,
    warning: (warning: string) => `WARNING: ${warning}`,
    columnDropped: (column: string) => `column ${column} is dropped together with its data`,
    typeNarrowed: (column: string, from: string, to: string) =>
      `type of ${column} changes from ${from} to ${to}: values may fail to convert or be truncated`,
    tableDropped: (table: string) => `table ${table} is dropped together with its data`,
    migrationTitle: (from: string, to: string) => `CoDraw schema migration: ${from} → ${to}`,
    database: (label: string) => `Database: ${label}`,
    repeatedTable: (name: string) => `Table ${name} is drawn several times: the migration takes the first`,
    viewWithoutQuery: (name: string) => `The query of view ${name} is not set: columns without rows`,
  },
})
