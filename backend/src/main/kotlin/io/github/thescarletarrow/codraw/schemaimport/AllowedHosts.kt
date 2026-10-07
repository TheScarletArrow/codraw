package io.github.thescarletarrow.codraw.schemaimport

import java.net.InetAddress

/** A network of addresses: an address and the length of its prefix, e.g. `10.20.0.0/16`; one address is a full prefix. */
class Network(address: InetAddress, val prefix: Int) {

    private val bytes: ByteArray = address.address

    init {
        require(prefix in 0..bytes.size * Byte.SIZE_BITS) { "The prefix of a network must fit its address" }
    }

    /** Whether [address] is in this network; an IPv4 address is never in an IPv6 network. */
    fun contains(address: InetAddress): Boolean {
        val other = address.address
        if (other.size != bytes.size) return false
        val whole = prefix / Byte.SIZE_BITS
        for (index in 0 until whole) if (other[index] != bytes[index]) return false
        val rest = prefix % Byte.SIZE_BITS
        if (rest == 0) return true
        val mask = (0xFF shl (Byte.SIZE_BITS - rest)) and 0xFF
        return (other[whole].toInt() and mask) == (bytes[whole].toInt() and mask)
    }

    /** Whether all of [network] lies in this network. */
    fun contains(network: Network): Boolean =
        network.bytes.size == bytes.size && network.prefix >= prefix && contains(InetAddress.getByAddress(network.bytes))

    override fun toString() = "${InetAddress.getByAddress(bytes).hostAddress}/$prefix"

    companion object {
        /** `10.20.0.0/16`, `fd00::/8` or one address; `null` for anything else. */
        fun parse(text: String): Network? {
            val slash = text.indexOf('/')
            val address = Hosts.literal(if (slash == -1) text else text.substring(0, slash)) ?: return null
            val full = address.address.size * Byte.SIZE_BITS
            val prefix = if (slash == -1) full else text.substring(slash + 1).toIntOrNull() ?: return null
            return if (prefix in 0..full) Network(address, prefix) else null
        }

        /** The network of exactly this address. */
        fun of(address: InetAddress) = Network(address, address.address.size * Byte.SIZE_BITS)
    }
}

/** What a host of a request is, as its syntax tells: an address, a name, or neither. */
object Hosts {

    /** Labels of letters, digits, `-` and `_` (names of services of Docker have it) between dots, at most 253 long. */
    private val NAME = Regex("""(?=.{1,253}\.?$)[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?(?:\.[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?)*\.?""")

    /** The address that [text] writes, IPv6 also in brackets; `null` when it is not an address. */
    fun literal(text: String): InetAddress? {
        val bare = text.removeSurrounding("[", "]")
        if (bare.isEmpty() || bare.any { !(it.isLetterOrDigit() || it == '.' || it == ':') }) return null
        return try {
            InetAddress.ofLiteral(bare)
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    /** Whether [text] is a host name by its syntax, in any case and with or without the final dot. */
    fun isName(text: String) = NAME.matches(text)

    /** A name as compared with names of the list: in lower case, without the final dot. */
    fun normalize(name: String) = name.lowercase().removeSuffix(".")
}

/**
 * The hosts that the administrator allows for imports of schemas: names, which are trusted as they are, and networks,
 * which every address of a host must be in. Addresses of the loopback, link-local (with the metadata of clouds) and
 * other special ranges, and the addresses of the database of CoDraw itself, pass only an entry that lies wholly in
 * their range, e.g. `127.0.0.1/32`, never a wide network like `0.0.0.0/0`.
 */
class AllowedHosts private constructor(private val names: Set<String>, private val networks: List<Network>) {

    val enabled: Boolean
        get() = names.isNotEmpty() || networks.isNotEmpty()

    /** Whether the administrator named this host; such a host is trusted whatever it resolves to. */
    fun names(host: String) = Hosts.normalize(host) in names

    /**
     * Whether the backend may connect to [address]: it is in an allowed network, and an address of a special range or
     * of the database of CoDraw ([ownDatabase]) is allowed explicitly.
     */
    fun allows(address: InetAddress, ownDatabase: Set<InetAddress> = emptySet()): Boolean {
        val entries = networks.filter { it.contains(address) }
        if (entries.isEmpty()) return false
        val range = if (address in ownDatabase) Network.of(address) else SPECIAL.firstOrNull { it.contains(address) }
        return range == null || entries.any { range.contains(it) }
    }

    companion object {
        /** Loopback, link-local, «this host» and IPv4-compatible, multicast and reserved addresses. */
        private val SPECIAL = listOf(
            "127.0.0.0/8",
            "169.254.0.0/16",
            "0.0.0.0/8",
            "224.0.0.0/4",
            "240.0.0.0/4",
            "::/96",
            "fe80::/10",
            "ff00::/8",
        ).map { checkNotNull(Network.parse(it)) }

        /** The entries of `codraw.schema-import.allowed-hosts`; an entry that is neither a name nor a network is refused. */
        fun parse(entries: List<String>): AllowedHosts {
            val names = mutableSetOf<String>()
            val networks = mutableListOf<Network>()
            for (entry in entries.map { it.trim() }.filter { it.isNotEmpty() }) {
                val network = Network.parse(entry)
                when {
                    network != null -> networks += network
                    Hosts.isName(entry) -> names += Hosts.normalize(entry)
                    else -> throw IllegalArgumentException(
                        "codraw.schema-import.allowed-hosts: \"$entry\" is neither a host name nor an address or a network (CIDR)",
                    )
                }
            }
            return AllowedHosts(names, networks)
        }
    }
}
