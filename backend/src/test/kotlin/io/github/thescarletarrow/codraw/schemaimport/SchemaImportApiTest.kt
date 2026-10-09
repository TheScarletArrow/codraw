package io.github.thescarletarrow.codraw.schemaimport

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.classic.spi.ThrowableProxyUtil
import ch.qos.logback.core.read.ListAppender
import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.MutableClock
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.micrometer.core.instrument.MeterRegistry
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.testcontainers.postgresql.PostgreSQLContainer
import tools.jackson.databind.json.JsonMapper
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.UnknownHostException
import java.sql.DriverManager
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Imports from the PostgreSQL of Testcontainers: `localhost` and `missing.example.com` are names of the list, the network
 * 10.20.0.0/16 and the address 127.0.0.1 are allowed, and names of [FakeDns] resolve as the tests need.
 */
@IntegrationTest
@Import(SchemaImportApiTest.FakeDns::class)
@TestPropertySource(
    properties = [
        "codraw.schema-import.allowed-hosts=localhost, missing.example.com, 10.20.0.0/16, 127.0.0.1/32",
        "codraw.schema-import.connect-timeout=1s",
        "codraw.schema-import.read-timeout=3s",
        "codraw.schema-import.statement-timeout=1s",
        "codraw.schema-import.max-tables=5",
        "codraw.limits.schema-imports-per-user-per-hour=5",
    ],
)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SchemaImportApiTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val users: UserService,
    @Autowired private val registry: MeterRegistry,
    @Autowired private val clock: MutableClock,
    @Autowired private val postgres: PostgreSQLContainer,
) {

    /** Names of hosts for the tests: one leads outside the allowed network too, another resolves only for the check. */
    @TestConfiguration(proxyBeanMethods = false)
    class FakeDns {
        @Bean
        @Primary
        fun fakeResolver() = HostResolver { host ->
            when (host) {
                "rebind.example.com" -> listOf(InetAddress.ofLiteral("10.20.0.7"), InetAddress.ofLiteral("169.254.169.254"))
                "far.example.com" -> listOf(InetAddress.ofLiteral("10.30.0.5"))
                // The driver cannot resolve it: only the checked address leads to the database.
                "pinned.example.com" -> listOf(InetAddress.ofLiteral("127.0.0.1"))
                "missing.example.com", "nowhere.example.com" -> throw UnknownHostException(host)
                else -> InetAddress.getAllByName(host).toList()
            }
        }
    }

    private val json = JsonMapper()
    private val logged = ListAppender<ILoggingEvent>()
    private val root = LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME) as Logger

    @BeforeAll
    fun createDatabase() {
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("CREATE DATABASE $DATABASE")
                // A user who may sign in and nothing else: the catalog is enough.
                statement.execute("CREATE ROLE $READER LOGIN PASSWORD '$PASSWORD'")
            }
        }
        DriverManager.getConnection(urlOf(DATABASE), postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { statement ->
                statement.execute(
                    """
                    CREATE SCHEMA shop;
                    CREATE TABLE shop.users (id bigserial PRIMARY KEY, email text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
                    CREATE TABLE shop.orders (
                        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                        user_id bigint NOT NULL REFERENCES shop.users (id) ON DELETE CASCADE,
                        total numeric(10, 2) CHECK (total >= 0),
                        code text GENERATED ALWAYS AS ('#' || id::text) STORED,
                        deleted_at timestamptz
                    );
                    CREATE INDEX orders_user_id_idx ON shop.orders (user_id) WHERE deleted_at IS NULL;
                    CREATE TABLE shop.events (id bigint NOT NULL, at date NOT NULL, PRIMARY KEY (id, at)) PARTITION BY RANGE (at);
                    CREATE TABLE shop.events_2026 PARTITION OF shop.events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
                    CREATE VIEW shop.active_orders AS SELECT * FROM shop.orders WHERE deleted_at IS NULL;
                    CREATE MATERIALIZED VIEW shop.order_totals AS SELECT user_id, sum(total) AS total FROM shop.active_orders GROUP BY user_id;
                    CREATE UNIQUE INDEX order_totals_user_id_idx ON shop.order_totals (user_id);
                    CREATE VIEW shop.big_spenders AS SELECT user_id FROM shop.order_totals WHERE total > 100;
                    CREATE SCHEMA wide;
                    """.trimIndent() + (1..6).joinToString("") { "CREATE TABLE wide.t$it (id int);" },
                )
            }
        }
    }

    @BeforeEach
    fun captureLog() {
        logged.list.clear()
        logged.start()
        root.addAppender(logged)
    }

    @AfterEach
    fun releaseLog() {
        root.detachAppender(logged)
    }

    private fun urlOf(database: String) = "jdbc:postgresql://${postgres.host}:${postgres.getMappedPort(5432)}/$database"

    private fun newUser() = users.gitHubUser("schema-import-${USERS.incrementAndGet()}")

    private fun connection(vararg changes: Pair<String, Any?>): Map<String, Any?> =
        mapOf(
            "host" to "localhost",
            "port" to postgres.getMappedPort(5432),
            "database" to DATABASE,
            "user" to READER,
            "password" to PASSWORD,
            "schema" to "shop",
            "sslMode" to "prefer",
        ) + changes

    private fun import(user: User, body: Map<String, Any?>): ResultActionsDsl = import(user, json.writeValueAsString(body))

    private fun import(user: User, body: String): ResultActionsDsl =
        mockMvc.post(SchemaImportController.PATH) {
            with(user.session())
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun imports(result: String) = registry.get("codraw.schema.imports").tag("result", result).counter().count()

    /** Everything the log got: messages, key-value pairs and exceptions with their causes. */
    private fun logText() = logged.list.joinToString("\n") { event ->
        listOfNotNull(
            event.formattedMessage,
            event.keyValuePairs.orEmpty().joinToString { "${it.key}=${it.value}" },
            event.throwableProxy?.let(ThrowableProxyUtil::asString),
        ).joinToString(" ")
    }

    private fun importLines() = logged.list.filter { it.loggerName == SchemaImportService::class.java.name }

    private fun pairs(event: ILoggingEvent) = event.keyValuePairs.orEmpty().associate { it.key to it.value }

    @Test
    fun `reads the tables and views of a schema into DDL as pg_dump writes it, with a user who may read nothing else`() {
        val user = newUser()
        val succeeded = imports("success")

        val body = import(user, connection()).andExpect {
            status { isOk() }
            jsonPath("$.tables") { value(3) }
        }.andReturn().response.contentAsString

        val ddl = json.readTree(body).get("ddl").asString()
        assertTrue(ddl.startsWith("-- Schema shop of PostgreSQL 18."), ddl)
        // The reader has no usage of the schema, so PostgreSQL writes the names of its tables in references with it.
        assertEquals(
            """
            CREATE TABLE events (
                id bigint NOT NULL,
                at date NOT NULL
            )
            PARTITION BY RANGE (at);

            CREATE TABLE orders (
                id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
                user_id bigint NOT NULL,
                total numeric(10,2),
                code text GENERATED ALWAYS AS (('#'::text || (id)::text)) STORED,
                deleted_at timestamp with time zone
            );

            CREATE TABLE users (
                id bigserial NOT NULL,
                email text NOT NULL,
                created_at timestamp with time zone DEFAULT now() NOT NULL
            );

            CREATE VIEW active_orders AS
             SELECT id,
                user_id,
                total,
                code,
                deleted_at
               FROM shop.orders
              WHERE (deleted_at IS NULL);

            CREATE MATERIALIZED VIEW order_totals AS
             SELECT user_id,
                sum(total) AS total
               FROM shop.active_orders
              GROUP BY user_id
              WITH NO DATA;

            CREATE VIEW big_spenders AS
             SELECT user_id
               FROM shop.order_totals
              WHERE (total > (100)::numeric);

            ALTER TABLE ONLY events
                ADD CONSTRAINT events_pkey PRIMARY KEY (id, at);

            ALTER TABLE ONLY orders
                ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

            ALTER TABLE ONLY orders
                ADD CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric));

            ALTER TABLE ONLY users
                ADD CONSTRAINT users_email_key UNIQUE (email);

            ALTER TABLE ONLY users
                ADD CONSTRAINT users_pkey PRIMARY KEY (id);

            CREATE UNIQUE INDEX order_totals_user_id_idx ON shop.order_totals USING btree (user_id);

            CREATE INDEX orders_user_id_idx ON shop.orders USING btree (user_id) WHERE (deleted_at IS NULL);

            ALTER TABLE ONLY orders
                ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES shop.users(id) ON DELETE CASCADE;
            """.trimIndent() + "\n",
            ddl.substringAfter('\n').removePrefix("\n"),
        )
        assertEquals(succeeded + 1, imports("success"))
        val line = importLines().single()
        assertEquals("INFO", line.level.toString())
        assertEquals(
            mapOf(
                "user.id" to user.id.toString(),
                "server.address" to "localhost",
                "server.port" to postgres.getMappedPort(5432),
                "codraw.schema_import.result" to "success",
                "codraw.schema_import.tables" to 3,
            ),
            pairs(line),
        )
    }

    @Test
    fun `refuses addresses and names that the administrator did not allow, also names that lead outside`() {
        val refused = imports("host-not-allowed")

        for (host in listOf("10.30.0.5", "169.254.169.254", "127.0.0.2", "[::1]", "far.example.com", "rebind.example.com")) {
            import(newUser(), connection("host" to host)).andExpect {
                status { isForbidden() }
                jsonPath("$.reason") { value("host-not-allowed") }
            }
        }

        assertEquals(refused + 6, imports("host-not-allowed"))
        assertTrue(importLines().all { it.level.toString() == "WARN" })
        assertEquals("rebind.example.com", pairs(importLines().last())["server.address"])
    }

    @Test
    fun `answers a name outside the list that does not resolve as one that leads outside, so that DNS stays unknown`() {
        val user = newUser()
        val bodies = listOf("far.example.com", "nowhere.example.com").map { host ->
            import(user, connection("host" to host)).andExpect {
                status { isForbidden() }
                jsonPath("$.reason") { value("host-not-allowed") }
            }.andReturn().response.contentAsString
        }

        assertEquals(1, bodies.distinct().size, bodies.toString())
    }

    @Test
    fun `connects to the checked address, whatever the name resolves to for the driver`() {
        import(newUser(), connection("host" to "pinned.example.com")).andExpect {
            status { isOk() }
            jsonPath("$.tables") { value(3) }
        }
    }

    @Test
    fun `answers a closed port, a silent port and an unknown name alike`() {
        val user = newUser()
        val closed = ServerSocket(0, 1, InetAddress.getLoopbackAddress()).use { it.localPort }
        val bodies = SilentServer().use { silent ->
            listOf(
                connection("port" to closed),
                connection("port" to silent.port, "sslMode" to "disable"),
                connection("host" to "missing.example.com"),
            ).map { body ->
                import(user, body).andExpect {
                    status { isUnprocessableContent() }
                    jsonPath("$.reason") { value("connection-failed") }
                }.andReturn().response.contentAsString
            }
        }

        assertEquals(1, bodies.distinct().size, bodies.toString())
    }

    @Test
    fun `answers timeout when the database stops answering the queries of the catalog, and closes the connection`() {
        val user = newUser()
        StallingProxy(InetSocketAddress(postgres.host, postgres.getMappedPort(5432)), marker = "pg_namespace").use { proxy ->
            var answer: ResultActionsDsl? = null
            val request = Thread.ofVirtual().start { answer = import(user, connection("port" to proxy.port, "sslMode" to "disable")) }

            // While the database holds the answer back, it has one session of the import, by its name.
            awaitSessions(listOf(APPLICATION_NAME))
            request.join()
            answer!!.andExpect {
                status { isUnprocessableContent() }
                jsonPath("$.reason") { value("timeout") }
            }
            awaitSessions(emptyList())
        }
    }

    @Test
    fun `answers timeout when a query of the catalog runs longer than the statement timeout`() {
        DriverManager.getConnection(urlOf(DATABASE), postgres.username, postgres.password).use { lock ->
            lock.autoCommit = false
            // The text of a default of a column waits for the table, which this transaction holds.
            lock.createStatement().use { it.execute("LOCK TABLE shop.users IN ACCESS EXCLUSIVE MODE") }

            import(newUser(), connection()).andExpect {
                status { isUnprocessableContent() }
                jsonPath("$.reason") { value("timeout") }
            }
            assertEquals("57014", pairs(importLines().single())["db.response.status_code"])
            lock.rollback()
        }
    }

    @Test
    fun `opens a read-only session named after CoDraw with the properties of the driver`() {
        val target = ConnectionTarget(
            "pinned.example.com",
            InetAddress.ofLiteral("127.0.0.1"),
            postgres.getMappedPort(5432),
            DATABASE,
            READER,
            PASSWORD,
            "shop",
            SslMode.DISABLE,
        )

        org.postgresql.Driver().connect(driverUrl(target), driverProperties(target, SchemaImportProperties()))!!.use { connection ->
            fun setting(name: String) = connection.createStatement().use { statement ->
                statement.executeQuery("SELECT current_setting('$name')").use { rows -> rows.next(); rows.getString(1) }
            }
            assertEquals("on", setting("default_transaction_read_only"))
            assertEquals(APPLICATION_NAME, setting("application_name"))
        }
    }

    /** Waits until the sessions of the reader in the database have these names of applications. */
    private fun awaitSessions(expected: List<String>) {
        val deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
        var sessions: List<String>
        do {
            sessions = DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.prepareStatement("SELECT application_name FROM pg_stat_activity WHERE usename = ?").use { statement ->
                    statement.setString(1, READER)
                    statement.executeQuery().use { rows -> buildList { while (rows.next()) add(rows.getString(1)) } }
                }
            }
            if (sessions == expected) return
            Thread.sleep(50)
        } while (System.nanoTime() < deadline)
        assertEquals(expected, sessions)
    }

    @Test
    fun `refuses a wrong password and a database that is not there, without the user, the password and the database`() {
        val user = newUser()
        val refused = imports("authentication-failed")

        val wrongPassword = import(user, connection("password" to "Wr0ng-Pa55-Secret")).andExpect {
            status { isUnprocessableContent() }
            jsonPath("$.reason") { value("authentication-failed") }
        }.andReturn().response.contentAsString
        val missingDatabase = import(user, connection("database" to "$DATABASE?sslfactory=org.example.Evil&loggerFile=/tmp/x")).andExpect {
            status { isUnprocessableContent() }
            jsonPath("$.reason") { value("authentication-failed") }
        }.andReturn().response.contentAsString
        import(user, connection()).andExpect { status { isOk() } }

        assertEquals(refused + 2, imports("authentication-failed"))
        for (text in listOf(wrongPassword, missingDatabase, logText())) {
            for (secret in listOf(READER, PASSWORD, "Wr0ng-Pa55-Secret", DATABASE)) assertFalse(secret in text, "$secret in $text")
        }
        assertEquals("28P01", pairs(importLines().first())["db.response.status_code"])
    }

    @Test
    fun `gives the driver nothing but the connection of the request`() {
        val body = connection("socketFactory" to "org.example.Evil", "loggerFile" to "/tmp/codraw.log", "url" to "jdbc:postgresql://evil/x")

        import(newUser(), body).andExpect {
            status { isOk() }
            jsonPath("$.tables") { value(3) }
        }
    }

    @Test
    fun `names a schema that is not there and one that has more tables than an import reads`() {
        val user = newUser()

        import(user, connection("schema" to "missing")).andExpect {
            status { isUnprocessableContent() }
            jsonPath("$.reason") { value("schema-not-found") }
        }
        import(user, connection("schema" to "wide")).andExpect {
            status { isUnprocessableContent() }
            jsonPath("$.reason") { value("too-large") }
            jsonPath("$.limit") { value(5) }
        }
    }

    @Test
    fun `names a wrong field without its value, and takes no body that is not a connection`() {
        for ((field, value) in listOf("host" to "db.internal/x", "host" to "user@db", "host" to "", "port" to 70000, "database" to " ", "user" to null)) {
            val body = import(newUser(), connection(field to value)).andExpect {
                status { isBadRequest() }
                jsonPath("$.detail") { value("Invalid field of the connection: $field") }
            }.andReturn().response.contentAsString
            assertFalse("db.internal/x" in body)
        }
        import(newUser(), """{"host": "localhost", "password": "$PASSWORD", "port": "not a port"}""").andExpect {
            status { isBadRequest() }
            jsonPath("$.detail") { value("The body is not a connection") }
        }

        assertFalse(PASSWORD in logText())
        assertTrue(importLines().isEmpty())
    }

    @Test
    fun `is for users who signed in through a provider, with the CSRF token`() {
        val guest = users.createGuest()

        mockMvc.get(SchemaImportController.PATH) { with(guest.session()) }.andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("sign-in-required") }
        }
        import(guest, connection()).andExpect {
            status { isForbidden() }
            jsonPath("$.reason") { value("sign-in-required") }
        }
        mockMvc.get(SchemaImportController.PATH).andExpect { status { isUnauthorized() } }
        mockMvc.post(SchemaImportController.PATH) {
            with(newUser().session())
            contentType = MediaType.APPLICATION_JSON
            content = json.writeValueAsString(connection())
        }.andExpect { status { isForbidden() } }

        assertTrue(importLines().isEmpty())
    }

    @Test
    fun `lets a user try as many imports in an hour as the limit allows`() {
        val user = newUser()
        val reached = registry.get("codraw.limits.reached").tag("limit", "schema-imports").counter().count()
        repeat(5) { import(user, connection("host" to "10.30.0.5")).andExpect { status { isForbidden() } } }

        import(user, connection()).andExpect {
            status { isTooManyRequests() }
            header { string("Retry-After", "3600") }
        }
        import(newUser(), connection("host" to "10.30.0.5")).andExpect { status { isForbidden() } }

        assertEquals(reached + 1, registry.get("codraw.limits.reached").tag("limit", "schema-imports").counter().count())
        clock.advance(Duration.ofHours(1))
        import(user, connection()).andExpect { status { isOk() } }
    }

    @Test
    fun `tells how many tables an import reads, and the privacy policy that the import is on`() {
        mockMvc.get(SchemaImportController.PATH) { with(newUser().session()) }.andExpect {
            status { isOk() }
            jsonPath("$.maxTables") { value(5) }
        }
        mockMvc.get("/api/legal").andExpect { jsonPath("$.schemaImport") { value(true) } }
    }

    /** Takes connections and never answers them. */
    private class SilentServer : AutoCloseable {
        private val server = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
        private val sockets = CopyOnWriteArrayList<Socket>()
        val port: Int = server.localPort

        init {
            Thread.ofVirtual().start {
                while (!server.isClosed) sockets += runCatching { server.accept() }.getOrNull() ?: break
            }
        }

        override fun close() {
            server.close()
            sockets.forEach { it.close() }
        }
    }

    /**
     * Passes connections to [target] until the client sends a query with [marker] in it, then holds the answers back:
     * a database that stops answering in the middle of an import.
     */
    private class StallingProxy(private val target: InetSocketAddress, private val marker: String) : AutoCloseable {
        private val server = ServerSocket(0, 50, InetAddress.getLoopbackAddress())
        private val sockets = CopyOnWriteArrayList<Socket>()
        val port: Int = server.localPort

        init {
            Thread.ofVirtual().start {
                while (!server.isClosed) {
                    val client = runCatching { server.accept() }.getOrNull() ?: break
                    val upstream = Socket(target.address, target.port)
                    sockets += listOf(client, upstream)
                    val stalled = AtomicBoolean(false)
                    Thread.ofVirtual().start {
                        pump(client, upstream) { chunk ->
                            if (marker in chunk) stalled.set(true)
                            true
                        }
                    }
                    Thread.ofVirtual().start { pump(upstream, client) { !stalled.get() } }
                }
            }
        }

        /** Copies chunks for which [forward] says so while the streams are open, then closes the other side too. */
        private fun pump(from: Socket, to: Socket, forward: (String) -> Boolean) {
            val buffer = ByteArray(64 * 1024)
            runCatching {
                while (true) {
                    val read = from.inputStream.read(buffer)
                    if (read == -1) break
                    if (forward(String(buffer, 0, read, Charsets.ISO_8859_1))) {
                        to.outputStream.write(buffer, 0, read)
                        to.outputStream.flush()
                    }
                }
            }
            runCatching { to.close() }
        }

        override fun close() {
            server.close()
            sockets.forEach { it.close() }
        }
    }

    private companion object {
        const val DATABASE = "schema_import_shop_db"
        const val READER = "schema_import_reader"
        const val PASSWORD = "R3ader-Secret-9"
        val USERS = AtomicInteger()
    }
}
