package io.github.thescarletarrow.codraw.image

import org.junit.jupiter.api.Test
import java.util.Base64
import java.util.UUID
import kotlin.test.assertContentEquals
import kotlin.test.assertSame

class BoardImageAddressesTest {

    @Test
    fun `the addresses of the images of the original become those of the copy, as Yjs itself would encode them`() {
        val rewritten = BoardImageAddresses.rewrite(ORIGINAL_STATE, ORIGINAL, COPY, mapOf(IMAGE to COPIED))

        assertContentEquals(COPY_STATE, rewritten)
    }

    @Test
    fun `an address in upper case is rewritten too`() {
        val state = "x/api/boards/${ORIGINAL.toString().uppercase()}/images/${IMAGE.toString().uppercase()}y".toByteArray()

        val rewritten = BoardImageAddresses.rewrite(state, ORIGINAL, COPY, mapOf(IMAGE to COPIED))

        assertContentEquals("x/api/boards/$COPY/images/${COPIED}y".toByteArray(), rewritten)
    }

    @Test
    fun `a board without images keeps its state as it is`() {
        assertSame(ORIGINAL_STATE, BoardImageAddresses.rewrite(ORIGINAL_STATE, ORIGINAL, COPY, emptyMap()))
    }

    companion object {
        private val ORIGINAL = UUID.fromString("11111111-1111-4111-8111-111111111111")
        private val COPY = UUID.fromString("22222222-2222-4222-8222-222222222222")
        private val IMAGE = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
        private val COPIED = UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")

        /**
         * `Y.encodeStateAsUpdate` of a document with `clientID` 42 and one page whose image shapes show the image [IMAGE]
         * of the board [ORIGINAL] by its path and by its full address, the same image id on another board, an image that
         * the board does not have, and a link to the board in `meta`. [COPY_STATE] is the same document made with the
         * address of [COPIED] on [COPY] in the first two shapes: only those may differ.
         */
        private val ORIGINAL_STATE: ByteArray = Base64.getDecoder().decode(
            "ARwqACcBBXBhZ2VzAnAxASgAKgAEbmFtZQF3EtCh0YLRgNCw0L3QuNGG0LAgMSgAKgAFb3JkZXIBdwJhMCcBCGNlbGxzOnAxAmMx" +
            "ASgAKgMEa2luZAF3BnZlcnRleCgAKgMFdmFsdWUBdw7Qm9C+0LPQvtGC0LjQvycAKgMFc3R5bGUBKAAqBgVzaGFwZQF3BWltYWdl" +
            "KAAqBgVpbWFnZQF3XC9hcGkvYm9hcmRzLzExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMS9pbWFnZXMvYWFhYWFh" +
            "YWEtYWFhYS00YWFhLThhYWEtYWFhYWFhYWFhYWFhJwEIY2VsbHM6cDECYzIBKAAqCQRraW5kAXcGdmVydGV4KAAqCQV2YWx1ZQF3" +
            "DtCb0L7Qs9C+0YLQuNC/JwAqCQVzdHlsZQEoACoMBXNoYXBlAXcFaW1hZ2UoACoMBWltYWdlAXdyaHR0cHM6Ly9jb2RyYXcuZXhh" +
            "bXBsZS9hcGkvYm9hcmRzLzExMTExMTExLTExMTEtNDExMS04MTExLTExMTExMTExMTExMS9pbWFnZXMvYWFhYWFhYWEtYWFhYS00" +
            "YWFhLThhYWEtYWFhYWFhYWFhYWFhJwEIY2VsbHM6cDECYzMBKAAqDwRraW5kAXcGdmVydGV4KAAqDwV2YWx1ZQF3DtCb0L7Qs9C+" +
            "0YLQuNC/JwAqDwVzdHlsZQEoACoSBXNoYXBlAXcFaW1hZ2UoACoSBWltYWdlAXdcL2FwaS9ib2FyZHMvMzMzMzMzMzMtMzMzMy00" +
            "MzMzLTgzMzMtMzMzMzMzMzMzMzMzL2ltYWdlcy9hYWFhYWFhYS1hYWFhLTRhYWEtOGFhYS1hYWFhYWFhYWFhYWEnAQhjZWxsczpw" +
            "MQJjNAEoACoVBGtpbmQBdwZ2ZXJ0ZXgoACoVBXZhbHVlAXcO0JvQvtCz0L7RgtC40L8nACoVBXN0eWxlASgAKhgFc2hhcGUBdwVp" +
            "bWFnZSgAKhgFaW1hZ2UBd1wvYXBpL2JvYXJkcy8xMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEvaW1hZ2VzL2Nj" +
            "Y2NjY2NjLWNjY2MtNGNjYy04Y2NjLWNjY2NjY2NjY2NjYygBBG1ldGEEbGluawF3LC9ib2FyZHMvMTExMTExMTEtMTExMS00MTEx" +
            "LTgxMTEtMTExMTExMTExMTExAA==",
        )
        private val COPY_STATE: ByteArray = Base64.getDecoder().decode(
            "ARwqACcBBXBhZ2VzAnAxASgAKgAEbmFtZQF3EtCh0YLRgNCw0L3QuNGG0LAgMSgAKgAFb3JkZXIBdwJhMCcBCGNlbGxzOnAxAmMx" +
            "ASgAKgMEa2luZAF3BnZlcnRleCgAKgMFdmFsdWUBdw7Qm9C+0LPQvtGC0LjQvycAKgMFc3R5bGUBKAAqBgVzaGFwZQF3BWltYWdl" +
            "KAAqBgVpbWFnZQF3XC9hcGkvYm9hcmRzLzIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMi9pbWFnZXMvYmJiYmJi" +
            "YmItYmJiYi00YmJiLThiYmItYmJiYmJiYmJiYmJiJwEIY2VsbHM6cDECYzIBKAAqCQRraW5kAXcGdmVydGV4KAAqCQV2YWx1ZQF3" +
            "DtCb0L7Qs9C+0YLQuNC/JwAqCQVzdHlsZQEoACoMBXNoYXBlAXcFaW1hZ2UoACoMBWltYWdlAXdyaHR0cHM6Ly9jb2RyYXcuZXhh" +
            "bXBsZS9hcGkvYm9hcmRzLzIyMjIyMjIyLTIyMjItNDIyMi04MjIyLTIyMjIyMjIyMjIyMi9pbWFnZXMvYmJiYmJiYmItYmJiYi00" +
            "YmJiLThiYmItYmJiYmJiYmJiYmJiJwEIY2VsbHM6cDECYzMBKAAqDwRraW5kAXcGdmVydGV4KAAqDwV2YWx1ZQF3DtCb0L7Qs9C+" +
            "0YLQuNC/JwAqDwVzdHlsZQEoACoSBXNoYXBlAXcFaW1hZ2UoACoSBWltYWdlAXdcL2FwaS9ib2FyZHMvMzMzMzMzMzMtMzMzMy00" +
            "MzMzLTgzMzMtMzMzMzMzMzMzMzMzL2ltYWdlcy9hYWFhYWFhYS1hYWFhLTRhYWEtOGFhYS1hYWFhYWFhYWFhYWEnAQhjZWxsczpw" +
            "MQJjNAEoACoVBGtpbmQBdwZ2ZXJ0ZXgoACoVBXZhbHVlAXcO0JvQvtCz0L7RgtC40L8nACoVBXN0eWxlASgAKhgFc2hhcGUBdwVp" +
            "bWFnZSgAKhgFaW1hZ2UBd1wvYXBpL2JvYXJkcy8xMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEvaW1hZ2VzL2Nj" +
            "Y2NjY2NjLWNjY2MtNGNjYy04Y2NjLWNjY2NjY2NjY2NjYygBBG1ldGEEbGluawF3LC9ib2FyZHMvMTExMTExMTEtMTExMS00MTEx" +
            "LTgxMTEtMTExMTExMTExMTExAA==",
        )
    }
}
