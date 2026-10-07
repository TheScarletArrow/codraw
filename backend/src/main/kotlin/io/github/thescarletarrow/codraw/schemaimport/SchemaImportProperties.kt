package io.github.thescarletarrow.codraw.schemaimport

import jakarta.validation.constraints.Positive
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.util.unit.DataSize
import org.springframework.validation.annotation.Validated
import java.time.Duration

/**
 * The import of the schema of a live PostgreSQL database through the backend. Off until the administrator allows the
 * hosts of databases: the backend then connects into the networks of the installation for its users.
 */
@Validated
@ConfigurationProperties("codraw.schema-import")
data class SchemaImportProperties(
    /**
     * Host names, addresses and networks (CIDR) of databases that users may read schemas of, e.g. `db.internal`,
     * `10.20.0.0/16`; see [AllowedHosts]. Empty turns the import off.
     */
    val allowedHosts: List<String> = emptyList(),
    /** How long the backend waits for the connection to a database. */
    val connectTimeout: Duration = Duration.ofSeconds(5),
    /** How long the backend waits for an answer of the database, signing in included. */
    val readTimeout: Duration = Duration.ofSeconds(20),
    /** How long a query of the catalog may run in the database (`statement_timeout`). */
    val statementTimeout: Duration = Duration.ofSeconds(15),
    /** The most tables of a schema that an import reads. */
    @field:Positive
    val maxTables: Int = 500,
    /** The largest DDL of a schema that an import returns. */
    val maxDdlSize: DataSize = DataSize.ofMegabytes(2),
) {
    /** Whether the administrator allowed any host. */
    val enabled: Boolean
        get() = allowedHosts.any { it.isNotBlank() }
}
