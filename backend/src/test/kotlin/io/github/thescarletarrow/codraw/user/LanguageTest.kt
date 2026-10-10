package io.github.thescarletarrow.codraw.user

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class LanguageTest {

    @Test
    fun `takes the most preferred language of a request that CoDraw speaks, and Russian otherwise`() {
        assertEquals(Language.EN, Language.ofAcceptLanguage("en-US,en;q=0.9,ru;q=0.8"))
        assertEquals(Language.RU, Language.ofAcceptLanguage("de-DE,ru;q=0.8,en;q=0.5"))
        assertEquals(Language.EN, Language.ofAcceptLanguage("de;q=1, en;q=0.4"))
        assertEquals(Language.RU, Language.ofAcceptLanguage("fr"))
        assertEquals(Language.RU, Language.ofAcceptLanguage(null))
        assertEquals(Language.RU, Language.ofAcceptLanguage("not a header;;q=x"))
    }

    @Test
    fun `reads the tags of the app`() {
        assertEquals(Language.EN, Language.of("en"))
        assertEquals(Language.RU, Language.of("RU"))
        assertEquals(null, Language.of("de"))
    }
}
