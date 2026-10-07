package io.github.thescarletarrow.codraw.schemaimport

import com.fasterxml.jackson.annotation.JsonValue
import io.github.thescarletarrow.codraw.SchemaImportResult
import java.net.InetAddress

/** How the connection to a database uses SSL, as `sslmode` of libpq. */
enum class SslMode(@get:JsonValue val value: String) {
    /** Without SSL. */
    DISABLE("disable"),

    /** With SSL when the server has it, without checking its certificate. */
    PREFER("prefer"),

    /** Only with SSL, without checking the certificate of the server. */
    REQUIRE("require"),

    /** Only with SSL and a certificate of the server for its host that the trusted authorities of the JVM signed. */
    VERIFY_FULL("verify-full"),
}

/**
 * Where and as whom to read a schema, as the user enters it; fields are checked by [SchemaImportService], so that a
 * wrong one is named without its value. Never a JDBC URL: the backend builds the connection itself.
 */
data class SchemaImportRequest(
    val host: String? = null,
    val port: Int? = null,
    val database: String? = null,
    val user: String? = null,
    val password: String? = null,
    val schema: String? = null,
    val sslMode: SslMode? = null,
) {
    /** Without the user, the password and the database, so that no log, also a debug one, ever writes them. */
    override fun toString() = "SchemaImportRequest(host=$host, port=$port, schema=$schema, sslMode=$sslMode)"
}

/** A checked request: the host as entered, for SSL, and the address that the backend checked and connects to. */
class ConnectionTarget(
    val host: String,
    val address: InetAddress,
    val port: Int,
    val database: String,
    val user: String,
    val password: String,
    val schema: String,
    val sslMode: SslMode,
) {
    override fun toString() = "ConnectionTarget(host=$host, address=${address.hostAddress}, port=$port, schema=$schema, sslMode=$sslMode)"
}

/** The schema as DDL of PostgreSQL, and the number of its tables. */
data class SchemaDdl(val ddl: String, val tables: Int)

/** Whether the import is open to the signed-in user, and how many tables of a schema it reads. */
data class SchemaImportInfo(val maxTables: Int)

/**
 * An import that did not end with a schema. It keeps only the kind of the error that caused it ([errorType]) and the
 * SQLSTATE: messages of PostgreSQL and of the network name users, hosts and databases.
 */
class SchemaImportException(
    val result: SchemaImportResult,
    /** The most tables that an import reads, when there were more. */
    val limit: Int? = null,
    val errorType: String? = null,
    val sqlState: String? = null,
) : RuntimeException("The import of a schema failed: ${result.tag}") {
    init {
        require(result != SchemaImportResult.SUCCESS)
    }
}

/** A field of [SchemaImportRequest] that is missing or wrong; the message names the field, never its value. */
class InvalidSchemaImportRequestException(field: String) : RuntimeException("Invalid field of the connection: $field")
