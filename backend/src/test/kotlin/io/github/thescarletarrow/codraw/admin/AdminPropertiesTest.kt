package io.github.thescarletarrow.codraw.admin

import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class AdminPropertiesTest {

    @Test
    fun `reads accounts of GitHub and Google, skipping blanks`() {
        val properties = AdminProperties(users = listOf(" github:583231 ", "", "google:1098"))

        assertEquals(setOf("github" to "583231", "google" to "1098"), properties.accounts)
    }

    @ParameterizedTest
    @ValueSource(strings = ["guest:5f2c", "583231", "github:", "gitlab:1", ":1"])
    fun `refuses an entry that names no account of a sign-in provider`(entry: String) {
        val failure = assertFailsWith<IllegalArgumentException> { AdminProperties(users = listOf(entry)) }

        assertEquals(true, failure.message?.contains(entry))
    }
}
