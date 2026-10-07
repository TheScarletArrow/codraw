package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.SchemaImportResult
import org.postgresql.Driver
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.springframework.stereotype.Component
import java.net.SocketTimeoutException
import java.sql.Connection
import java.sql.SQLException

/**
 * Reads the tables of one schema of a PostgreSQL database into DDL as pg_dump writes it: `CREATE TABLE`, then the
 * primary, unique and check constraints, the indexes and the foreign keys. One connection, without a pool, read-only and
 * closed when the schema is read.
 */
@Component
class PostgresSchemaReader(private val settings: SchemaImportProperties) {

    /** The schema of [target]; throws [SchemaImportException] with the category of what went wrong. */
    fun read(target: ConnectionTarget): SchemaDdl {
        val connection = connect(target)
        try {
            connection.autoCommit = false
            return read(connection, target.schema)
        } catch (exception: DataAccessException) {
            throw readFailure(exception.rootCause ?: exception)
        } catch (exception: SQLException) {
            throw readFailure(exception)
        } finally {
            // The server rolls the read-only transaction back; no rollback first, which would wait on a silent server.
            runCatching { connection.close() }
        }
    }

    private fun connect(target: ConnectionTarget): Connection =
        try {
            Driver().connect(driverUrl(target), driverProperties(target, settings))
                ?: throw SchemaImportException(SchemaImportResult.CONNECTION_FAILED)
        } catch (exception: SQLException) {
            throw connectFailure(exception, target.password.isEmpty())
        }

    private fun read(connection: Connection, schema: String): SchemaDdl {
        val template = JdbcTemplate(SingleConnectionDataSource(connection, true)).apply {
            queryTimeout = settings.statementTimeout.toSeconds().coerceAtLeast(1).toInt()
        }
        val jdbc = JdbcClient.create(template)
        val version = jdbc.sql("SELECT current_setting('server_version_num')::int").query(Int::class.javaObjectType).single()
        if (version < MIN_SERVER_VERSION) throw SchemaImportException(SchemaImportResult.UNSUPPORTED_SERVER)
        // For this transaction only: the schema first in the path, so that the names of its objects come without it.
        jdbc.sql("SELECT set_config('statement_timeout', :timeout, true), set_config('search_path', quote_ident(:schema), true)")
            .param("timeout", settings.statementTimeout.toMillis().toString())
            .param("schema", schema)
            .query()
            .listOfRows()
        val exists = jdbc.sql("SELECT EXISTS (SELECT FROM pg_namespace WHERE nspname = :schema)")
            .param("schema", schema)
            .query(Boolean::class.javaObjectType)
            .single()
        if (!exists) throw SchemaImportException(SchemaImportResult.SCHEMA_NOT_FOUND)
        val count = jdbc.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE $TABLES")
            .param("schema", schema)
            .query(Int::class.javaObjectType)
            .single()
        if (count > settings.maxTables) throw SchemaImportException(SchemaImportResult.TOO_LARGE, limit = settings.maxTables)

        val serverVersion = jdbc.sql("SELECT current_setting('server_version')").query(String::class.java).single()
        val tables = jdbc.sql(TABLES_QUERY).param("schema", schema).query { row, _ ->
            Table(row.getString("name"), row.getString("partition_key"))
        }.list()
        val columns = jdbc.sql(COLUMNS_QUERY).param("schema", schema).query { row, _ ->
            row.getString("table_name") to column(
                name = row.getString("name"),
                type = row.getString("type"),
                notNull = row.getBoolean("not_null"),
                default = row.getString("default_value"),
                identity = row.getString("identity"),
                generated = row.getString("generated"),
                ownsSequence = row.getBoolean("owns_sequence"),
            )
        }.list().groupBy({ it.first }, { it.second })
        val (foreignKeys, constraints) = jdbc.sql(CONSTRAINTS_QUERY).param("schema", schema).query { row, _ ->
            val table = row.getString("table_name")
            val statement = "ALTER TABLE ONLY $table\n    ADD CONSTRAINT ${row.getString("name")} ${row.getString("definition")};"
            (row.getString("kind") == "f") to statement
        }.list().partition { it.first }
        val indexes = jdbc.sql(INDEXES_QUERY).param("schema", schema).query { row, _ -> "${row.getString("definition")};" }.list()

        val ddl = buildString {
            // A name may hold line breaks; the comment stays one line.
            append("-- Schema ").append(schema.lines().joinToString(" ")).append(" of PostgreSQL ").append(serverVersion).append('\n')
            for (table in tables) {
                append("\nCREATE TABLE ").append(table.name).append(" (\n")
                append(columns[table.name].orEmpty().joinToString(",\n") { "    $it" })
                append("\n)")
                if (table.partitionKey != null) append("\nPARTITION BY ").append(table.partitionKey)
                append(";\n")
            }
            // Foreign keys last, as pg_dump writes them: they may refer to any table and to its keys.
            for (statement in constraints.map { it.second } + indexes + foreignKeys.map { it.second }) {
                append('\n').append(statement).append('\n')
            }
        }
        if (ddl.toByteArray().size > settings.maxDdlSize.toBytes()) throw SchemaImportException(SchemaImportResult.TOO_LARGE)
        return SchemaDdl(ddl, tables.size)
    }

    private class Table(val name: String, val partitionKey: String?)

    companion object {
        /** `attgenerated` and the rest of the catalog that the queries read are there since PostgreSQL 12. */
        const val MIN_SERVER_VERSION = 120000

        /**
         * Tables of the schema `:schema` as rows of `pg_class c` joined to `pg_namespace n`: plain and partitioned ones,
         * without partitions.
         */
        private const val TABLES = "n.nspname = :schema AND c.relkind IN ('r', 'p') AND NOT c.relispartition"

        private const val TABLES_QUERY = """
            SELECT quote_ident(c.relname) AS name, CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_key
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE $TABLES
            ORDER BY c.relname
        """

        private const val COLUMNS_QUERY = """
            SELECT quote_ident(c.relname) AS table_name, quote_ident(a.attname) AS name,
                format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null,
                pg_get_expr(d.adbin, d.adrelid) AS default_value, a.attidentity AS identity, a.attgenerated AS generated,
                EXISTS (
                    SELECT FROM pg_depend dep JOIN pg_class s ON s.oid = dep.objid
                    WHERE dep.classid = 'pg_class'::regclass AND dep.refclassid = 'pg_class'::regclass
                        AND dep.refobjid = a.attrelid AND dep.refobjsubid = a.attnum AND dep.deptype = 'a' AND s.relkind = 'S'
                ) AS owns_sequence
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE $TABLES AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY c.relname, a.attnum
        """

        /** Primary, unique and check constraints, then foreign keys, which may refer to any table. */
        private const val CONSTRAINTS_QUERY = """
            SELECT quote_ident(c.relname) AS table_name, quote_ident(con.conname) AS name, con.contype AS kind,
                pg_get_constraintdef(con.oid) AS definition
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE $TABLES AND con.contype IN ('p', 'u', 'c', 'f')
            ORDER BY con.contype = 'f', c.relname, con.conname
        """

        /** Indexes, but those of primary keys, unique and exclusion constraints, which the constraints make. */
        private const val INDEXES_QUERY = """
            SELECT pg_get_indexdef(i.indexrelid) AS definition
            FROM pg_index i
            JOIN pg_class c ON c.oid = i.indrelid
            JOIN pg_class ic ON ic.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE $TABLES AND NOT EXISTS (
                SELECT FROM pg_constraint con
                WHERE con.conindid = i.indexrelid AND con.conrelid = i.indrelid AND con.contype IN ('p', 'u', 'x')
            )
            ORDER BY c.relname, ic.relname
        """

        /** Integer types and the serial types of a column that owns its sequence. */
        private val SERIAL_TYPES = mapOf("integer" to "serial", "bigint" to "bigserial", "smallint" to "smallserial")

        /** A column of `CREATE TABLE`: `name type [DEFAULT …] [GENERATED …] [NOT NULL]`, a serial one as `serial`. */
        fun column(
            name: String,
            type: String,
            notNull: Boolean,
            default: String?,
            identity: String,
            generated: String,
            ownsSequence: Boolean,
        ): String {
            val serial = SERIAL_TYPES[type]?.takeIf { ownsSequence && identity.isEmpty() && default?.startsWith("nextval(") == true }
            return buildString {
                append(name).append(' ').append(serial ?: type)
                when {
                    generated == "s" -> append(" GENERATED ALWAYS AS (").append(default).append(") STORED")
                    generated == "v" -> append(" GENERATED ALWAYS AS (").append(default).append(") VIRTUAL")
                    identity == "a" -> append(" GENERATED ALWAYS AS IDENTITY")
                    identity == "d" -> append(" GENERATED BY DEFAULT AS IDENTITY")
                    default != null && serial == null -> append(" DEFAULT ").append(default)
                }
                if (notNull) append(" NOT NULL")
            }
        }

        /**
         * The category of an error of connecting: the user, the password or the database refused (`28…`, `3D000`, or no
         * password where the server wants one), else no connection — refused, silent, not PostgreSQL, SSL or the name.
         */
        fun connectFailure(exception: SQLException, emptyPassword: Boolean): SchemaImportException {
            val state = exception.sqlState.orEmpty()
            val refused = state.startsWith("28") || state == "3D000" || (state == "08004" && emptyPassword)
            return SchemaImportException(
                if (refused) SchemaImportResult.AUTHENTICATION_FAILED else SchemaImportResult.CONNECTION_FAILED,
                errorType = (exception.cause ?: exception).javaClass.name,
                sqlState = exception.sqlState,
            )
        }

        /** The category of an error of reading the catalog: a timeout of the statement or of the socket, else no connection. */
        fun readFailure(error: Throwable): SchemaImportException {
            val state = (error as? SQLException)?.sqlState
            val timeout = state == "57014" || generateSequence(error) { it.cause }.any { it is SocketTimeoutException }
            return SchemaImportException(
                if (timeout) SchemaImportResult.TIMEOUT else SchemaImportResult.CONNECTION_FAILED,
                errorType = error.javaClass.name,
                sqlState = state,
            )
        }
    }
}
