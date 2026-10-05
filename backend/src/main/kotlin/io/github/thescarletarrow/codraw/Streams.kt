package io.github.thescarletarrow.codraw

import org.springframework.util.unit.DataSize
import java.io.InputStream

/**
 * Reads the stream to its end, or returns `null` as soon as it turns out to be larger than [limit]: reads one byte more
 * than allowed, never the rest of a larger body.
 */
fun InputStream.readAtMost(limit: DataSize): ByteArray? {
    val bytes = readNBytes(Math.toIntExact(limit.toBytes()) + 1)
    return bytes.takeIf { it.size <= limit.toBytes() }
}
