package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.SchemaImportResult
import org.postgresql.Driver
import org.postgresql.PGProperty
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails
import org.springframework.stereotype.Component
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.Properties

/** Resolves host names to their addresses; tests put names of their own in place of DNS. */
fun interface HostResolver {
    /** All addresses of [host]; throws [UnknownHostException] when it has none. */
    fun resolve(host: String): List<InetAddress>
}

/**
 * Decides which address the backend connects to for a host of a request: a name of the allowed hosts as it resolves,
 * any other host only when every address of it is allowed. The connection then goes to that address, so that a name
 * resolving differently a moment later (DNS rebinding) cannot lead elsewhere.
 */
@Component
class HostGuard(
    properties: SchemaImportProperties,
    private val resolver: HostResolver,
    private val database: JdbcConnectionDetails,
) {

    private val allowed = AllowedHosts.parse(properties.allowedHosts)

    val enabled: Boolean
        get() = allowed.enabled

    /**
     * The address to connect to for [host], a name or an address by its syntax. Throws [SchemaImportException] with
     * [SchemaImportResult.HOST_NOT_ALLOWED], or [SchemaImportResult.CONNECTION_FAILED] when a name does not resolve.
     */
    fun address(host: String): InetAddress {
        Hosts.literal(host)?.let { address ->
            if (!allowed.allows(address, ownDatabase())) throw SchemaImportException(SchemaImportResult.HOST_NOT_ALLOWED)
            return address
        }
        val addresses = try {
            resolver.resolve(host)
        } catch (exception: UnknownHostException) {
            throw SchemaImportException(SchemaImportResult.CONNECTION_FAILED, errorType = exception.javaClass.name)
        }
        if (addresses.isEmpty()) throw SchemaImportException(SchemaImportResult.CONNECTION_FAILED)
        if (!allowed.names(host)) {
            val ownDatabase = ownDatabase()
            if (addresses.any { !allowed.allows(it, ownDatabase) }) throw SchemaImportException(SchemaImportResult.HOST_NOT_ALLOWED)
        }
        return addresses.first()
    }

    /** The addresses of the database of CoDraw itself, as its hosts resolve now. */
    private fun ownDatabase(): Set<InetAddress> {
        // A password, though empty, keeps the driver from looking for one in `.pgpass`.
        val properties = Driver.parseURL(database.jdbcUrl, Properties().apply { PGProperty.PASSWORD.set(this, "") }) ?: return emptySet()
        val hosts = PGProperty.PG_HOST.getOrDefault(properties)?.split(',').orEmpty()
        return hosts.flatMap { host ->
            try {
                Hosts.literal(host)?.let(::listOf) ?: resolver.resolve(host)
            } catch (_: UnknownHostException) {
                emptyList()
            }
        }.toSet()
    }
}
