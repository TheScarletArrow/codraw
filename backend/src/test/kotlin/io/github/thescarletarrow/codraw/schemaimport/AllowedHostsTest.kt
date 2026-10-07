package io.github.thescarletarrow.codraw.schemaimport

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.net.InetAddress
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AllowedHostsTest {

    private fun address(text: String): InetAddress = InetAddress.ofLiteral(text)

    @Test
    fun `reads names, addresses and networks, and refuses anything else`() {
        val hosts = AllowedHosts.parse(listOf(" db.internal ", "Reports.Example.com.", "10.20.0.0/16", "192.0.2.7", "fd00::/8", ""))

        assertTrue(hosts.enabled)
        assertTrue(hosts.names("DB.internal"))
        assertTrue(hosts.names("reports.example.com"))
        assertFalse(hosts.names("internal"))
        assertTrue(hosts.allows(address("10.20.255.1")))
        assertFalse(hosts.allows(address("10.21.0.1")))
        assertTrue(hosts.allows(address("192.0.2.7")))
        assertFalse(hosts.allows(address("192.0.2.8")))
        assertTrue(hosts.allows(address("fd12::1")))
        assertFalse(hosts.allows(address("fe12::1")))

        for (entry in listOf("10.0.0.0/33", "db internal", "http://db", "10.0.0.0/x", "db.internal:5432")) {
            assertThrows<IllegalArgumentException>(entry) { AllowedHosts.parse(listOf(entry)) }
        }
        assertFalse(AllowedHosts.parse(listOf("", " ")).enabled)
    }

    @Test
    fun `opens special addresses only to entries inside their ranges, not to wide networks`() {
        val wide = AllowedHosts.parse(listOf("0.0.0.0/0", "::/0"))

        for (special in listOf("127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fe80::1", "ff02::1")) {
            assertFalse(wide.allows(address(special)), special)
        }
        assertTrue(wide.allows(address("10.0.0.1")))
        assertTrue(wide.allows(address("2001:db8::1")))

        val explicit = AllowedHosts.parse(listOf("127.0.0.1/32", "169.254.10.0/24", "::1"))
        assertTrue(explicit.allows(address("127.0.0.1")))
        assertFalse(explicit.allows(address("127.0.0.2")))
        assertTrue(explicit.allows(address("169.254.10.5")))
        assertFalse(explicit.allows(address("169.254.169.254")))
        assertTrue(explicit.allows(address("::1")))
        // IPv4 written as IPv6 is IPv4.
        assertTrue(explicit.allows(address("::ffff:127.0.0.1")))
    }

    @Test
    fun `opens the database of CoDraw only to its own address`() {
        val database = setOf(address("10.20.0.2"))

        assertFalse(AllowedHosts.parse(listOf("10.20.0.0/16")).allows(address("10.20.0.2"), database))
        assertTrue(AllowedHosts.parse(listOf("10.20.0.0/16")).allows(address("10.20.0.3"), database))
        assertTrue(AllowedHosts.parse(listOf("10.20.0.0/16", "10.20.0.2")).allows(address("10.20.0.2"), database))
    }

    @Test
    fun `tells addresses from names by their syntax`() {
        assertEquals(address("10.0.0.1"), Hosts.literal("10.0.0.1"))
        assertEquals(address("::1"), Hosts.literal("[::1]"))
        assertNull(Hosts.literal("db.internal"))
        assertNull(Hosts.literal("fe80::1%eth0"))
        assertTrue(Hosts.isName("db-1.internal"))
        assertTrue(Hosts.isName("codraw_postgres"))
        assertTrue(Hosts.isName("db.internal."))
        for (host in listOf("", "db internal", "db/internal", "db?x=1", "user@db", "-db", "db..internal", "a".repeat(64) + ".internal", "db,other")) {
            assertFalse(Hosts.isName(host), host)
        }
    }

    @Test
    fun `knows networks and their parts`() {
        val network = checkNotNull(Network.parse("10.20.0.0/16"))

        assertTrue(network.contains(checkNotNull(Network.parse("10.20.3.0/24"))))
        assertFalse(network.contains(checkNotNull(Network.parse("10.0.0.0/8"))))
        assertFalse(network.contains(checkNotNull(Network.parse("fd00::/8"))))
        assertTrue(checkNotNull(Network.parse("10.20.0.0/12")).contains(address("10.31.255.255")))
        assertFalse(checkNotNull(Network.parse("10.20.0.0/12")).contains(address("10.32.0.0")))
        assertEquals("10.20.0.0/16", network.toString())
        assertNull(Network.parse("10.0.0.0/-1"))
    }
}
