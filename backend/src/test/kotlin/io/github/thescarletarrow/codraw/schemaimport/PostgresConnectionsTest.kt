package io.github.thescarletarrow.codraw.schemaimport

import io.github.thescarletarrow.codraw.SchemaImportResult
import org.junit.jupiter.api.Test
import org.postgresql.Driver
import org.postgresql.PGProperty
import org.postgresql.util.PSQLException
import org.postgresql.util.PSQLState
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.SocketTimeoutException
import java.sql.SQLException
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class PostgresConnectionsTest {

    private fun target(host: String = "db.example.com", database: String = "shop", password: String = "secret", sslMode: SslMode = SslMode.PREFER) =
        ConnectionTarget(host, InetAddress.ofLiteral("10.20.0.7"), 6432, database, "reader", password, "public", sslMode)

    @Test
    fun `gives the driver only the properties of CoDraw`() {
        val properties = driverProperties(target(), SchemaImportProperties(connectTimeout = Duration.ofMillis(500)))

        assertEquals(
            mapOf(
                "user" to "reader",
                "password" to "secret",
                "sslmode" to "prefer",
                "connectTimeout" to "1",
                "socketTimeout" to "20",
                "loginTimeout" to "20",
                "readOnly" to "true",
                "readOnlyMode" to "always",
                "ApplicationName" to "CoDraw schema import",
                "gssEncMode" to "disable",
                "jaasLogin" to "false",
                "maxResultBuffer" to "8388608",
                "socketFactory" to PinnedSocketFactory::class.java.name,
                "socketFactoryArg" to "10.20.0.7",
            ),
            properties.stringPropertyNames().associateWith { properties.getProperty(it) },
        )
        assertEquals(
            "org.postgresql.ssl.DefaultJavaSSLFactory",
            driverProperties(target(sslMode = SslMode.VERIFY_FULL), SchemaImportProperties()).getProperty("sslfactory"),
        )
        // An empty password is a password: the driver does not look for one in .pgpass.
        assertEquals("", driverProperties(target(password = ""), SchemaImportProperties()).getProperty("password"))
    }

    @Test
    fun `keeps the database a name, whatever it holds`() {
        val url = driverUrl(target(database = "shop?sslfactory=org.example.Evil&socketFactory=x/y z"))
        val parsed = checkNotNull(Driver.parseURL(url, null))

        assertEquals("jdbc:postgresql://db.example.com:6432/shop%3Fsslfactory%3Dorg.example.Evil%26socketFactory%3Dx%2Fy%20z", url)
        assertEquals("shop?sslfactory=org.example.Evil&socketFactory=x/y z", PGProperty.PG_DBNAME.getOrDefault(parsed))
        assertFalse(parsed.containsKey("sslfactory"))
        assertFalse(parsed.containsKey("socketFactory"))
        assertEquals("jdbc:postgresql://[fd00::7]:6432/shop", driverUrl(target(host = "fd00::7")))
    }

    @Test
    fun `connects to the checked address whatever host the driver asks for`() {
        ServerSocket(0, 1, InetAddress.getLoopbackAddress()).use { server ->
            val socket = PinnedSocketFactory("127.0.0.1").createSocket()
            socket.use {
                it.connect(InetSocketAddress.createUnresolved("rebound.example.com", server.localPort), 1000)
                server.accept().use { accepted -> assertEquals(it.localPort, accepted.port) }
            }
        }
    }

    @Test
    fun `tells refusals of the database from failures of the connection`() {
        fun connect(state: PSQLState, emptyPassword: Boolean = false) =
            PostgresSchemaReader.connectFailure(PSQLException("x", state), emptyPassword).result

        assertEquals(SchemaImportResult.AUTHENTICATION_FAILED, connect(PSQLState.INVALID_PASSWORD))
        assertEquals(SchemaImportResult.AUTHENTICATION_FAILED, connect(PSQLState.INVALID_AUTHORIZATION_SPECIFICATION))
        // The database is not there.
        assertEquals(SchemaImportResult.AUTHENTICATION_FAILED, PostgresSchemaReader.connectFailure(SQLException("x", "3D000"), false).result)
        assertEquals(SchemaImportResult.AUTHENTICATION_FAILED, connect(PSQLState.CONNECTION_REJECTED, emptyPassword = true))
        assertEquals(SchemaImportResult.CONNECTION_FAILED, connect(PSQLState.CONNECTION_REJECTED))
        assertEquals(SchemaImportResult.CONNECTION_FAILED, connect(PSQLState.CONNECTION_UNABLE_TO_CONNECT))

        assertEquals(SchemaImportResult.TIMEOUT, PostgresSchemaReader.readFailure(SQLException("x", "57014")).result)
        assertEquals(
            SchemaImportResult.TIMEOUT,
            PostgresSchemaReader.readFailure(PSQLException("x", PSQLState.CONNECTION_FAILURE, SocketTimeoutException())).result,
        )
        assertEquals(SchemaImportResult.CONNECTION_FAILED, PostgresSchemaReader.readFailure(PSQLException("x", PSQLState.CONNECTION_FAILURE)).result)
    }

    @Test
    fun `writes a column as pg_dump writes it, a serial one as serial`() {
        fun column(type: String, default: String? = null, identity: String = "", generated: String = "", ownsSequence: Boolean = false) =
            PostgresSchemaReader.column("id", type, true, default, identity, generated, ownsSequence)

        assertEquals("id bigserial NOT NULL", column("bigint", "nextval('users_id_seq'::regclass)", ownsSequence = true))
        assertEquals("id integer DEFAULT nextval('codes'::regclass) NOT NULL", column("integer", "nextval('codes'::regclass)"))
        assertEquals("id bigint GENERATED ALWAYS AS IDENTITY NOT NULL", column("bigint", identity = "a", ownsSequence = true))
        assertEquals("id bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL", column("bigint", identity = "d", ownsSequence = true))
        assertEquals("id text GENERATED ALWAYS AS (lower(name)) STORED NOT NULL", column("text", "lower(name)", generated = "s"))
        assertEquals("id uuid DEFAULT gen_random_uuid() NOT NULL", column("uuid", "gen_random_uuid()"))
    }

    @Test
    fun `orders views after the views they read, otherwise by name, and keeps a circle in that order`() {
        val names = listOf("aaa_report", "active_orders", "big_spenders", "order_totals", "plain")
        val reads = mapOf(
            "aaa_report" to listOf("big_spenders", "users"),
            "big_spenders" to listOf("order_totals"),
            "order_totals" to listOf("active_orders"),
        )

        assertEquals(listOf("active_orders", "order_totals", "big_spenders", "aaa_report", "plain"), PostgresSchemaReader.viewOrder(names, reads))
        assertEquals(listOf("b", "a"), PostgresSchemaReader.viewOrder(listOf("a", "b"), mapOf("a" to listOf("b"), "b" to listOf("a"))))
    }

    @Test
    fun `writes a request without the user, the password and the database`() {
        val request = SchemaImportRequest("db.example.com", 5432, "shop_db", "reader_user", "pa55word", "public", SslMode.REQUIRE)

        assertEquals("SchemaImportRequest(host=db.example.com, port=5432, schema=public, sslMode=REQUIRE)", request.toString())
        assertFalse(target().toString().contains("secret"))
    }
}
