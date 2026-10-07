package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.AddressRateLimiter
import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.SchemaImportResult
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import java.net.InetAddress
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Configuration(proxyBeanMethods = false)
class SchemaImportConfiguration {

    /** Names resolve through the resolver of the JVM, as the driver would resolve them. */
    @Bean
    fun hostResolver() = HostResolver { host -> InetAddress.getAllByName(host).toList() }
}

/** The imports a user may try, in windows of an hour. */
@Component
class SchemaImportLimiter(limits: LimitProperties, clock: Clock) {
    private val limiter = AddressRateLimiter(Duration.ofHours(1), { limits.schemaImportsPerUserPerHour }, clock)

    fun acquire(userId: UUID): Duration? = limiter.acquire(userId.toString())
}

/**
 * Imports the schema of a live database for a user: checks the fields and the host, reads the schema, and writes the
 * outcome to the log and the metrics, without the user of the database, its password and its name.
 */
@Service
class SchemaImportService(
    private val settings: SchemaImportProperties,
    private val hosts: HostGuard,
    private val reader: PostgresSchemaReader,
    private val metrics: CodrawMetrics,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    val enabled: Boolean
        get() = hosts.enabled

    val info: SchemaImportInfo
        get() = SchemaImportInfo(maxTables = settings.maxTables)

    /** The schema as DDL; throws [InvalidSchemaImportRequestException] or [SchemaImportException]. */
    fun import(request: SchemaImportRequest, userId: UUID): SchemaDdl {
        val host = field("host", request.host?.trim()) { (Hosts.literal(it) != null || Hosts.isName(it)) && it.length <= 255 }
        val port = request.port ?: DEFAULT_PORT
        if (port !in 1..65535) throw InvalidSchemaImportRequestException("port")
        val database = field("database", request.database) { it.isNotBlank() && it.length <= NAME_MAX_LENGTH && '\u0000' !in it }
        val user = field("user", request.user) { it.isNotBlank() && it.length <= NAME_MAX_LENGTH && '\u0000' !in it }
        val password = field("password", request.password.orEmpty()) { it.length <= PASSWORD_MAX_LENGTH && '\u0000' !in it }
        val schema = field("schema", request.schema?.takeIf { it.isNotBlank() } ?: DEFAULT_SCHEMA) {
            it.length <= NAME_MAX_LENGTH && '\u0000' !in it
        }
        val sslMode = request.sslMode ?: SslMode.PREFER

        val event = log.atInfo()
            .addKeyValue("user.id", userId.toString())
            .addKeyValue("server.address", host)
            .addKeyValue("server.port", port)
        try {
            val address = hosts.address(host)
            val ddl = reader.read(ConnectionTarget(host, address, port, database, user, password, schema, sslMode))
            metrics.schemaImport(SchemaImportResult.SUCCESS)
            event.addKeyValue("codraw.schema_import.result", SchemaImportResult.SUCCESS.tag)
                .addKeyValue("codraw.schema_import.tables", ddl.tables)
                .log("Schema import from a database: {}", SchemaImportResult.SUCCESS.tag)
            return ddl
        } catch (exception: SchemaImportException) {
            metrics.schemaImport(exception.result)
            // An address that the administrator did not allow may be someone looking around the network.
            val failure = if (exception.result == SchemaImportResult.HOST_NOT_ALLOWED) {
                log.atWarn().addKeyValue("user.id", userId.toString()).addKeyValue("server.address", host).addKeyValue("server.port", port)
            } else {
                event
            }
            listOfNotNull(
                "codraw.schema_import.result" to exception.result.tag,
                exception.errorType?.let { "error.type" to it },
                exception.sqlState?.let { "db.response.status_code" to it },
            ).fold(failure) { line, (key, value) -> line.addKeyValue(key, value) }
                .log("Schema import from a database: {}", exception.result.tag)
            throw exception
        }
    }

    /** The value of a field when it is there and [valid]; else the field is named as wrong, without its value. */
    private fun field(name: String, value: String?, valid: (String) -> Boolean): String =
        value?.takeIf(valid) ?: throw InvalidSchemaImportRequestException(name)

    private companion object {
        const val DEFAULT_PORT = 5432
        const val DEFAULT_SCHEMA = "public"

        /** Names in PostgreSQL have at most 63 bytes; longer ones are cut, so a bit more is no harm. */
        const val NAME_MAX_LENGTH = 255
        const val PASSWORD_MAX_LENGTH = 1024
    }
}
