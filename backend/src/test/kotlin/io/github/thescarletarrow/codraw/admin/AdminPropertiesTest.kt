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

    @Test
    fun `reads accounts of a corporate provider by its issuer and the subject`() {
        val properties = AdminProperties(users = listOf("oidc:https://sso.example.com:8443/realms/acme:5f2c-a1"))

        assertEquals(setOf("oidc:https://sso.example.com:8443/realms/acme" to "5f2c-a1"), properties.accounts)
    }

    @Test
    fun `reads accounts with a password by the login in lower case`() {
        val properties = AdminProperties(users = listOf("password:Admin.Smith"))

        assertEquals(setOf("password" to "admin.smith"), properties.accounts)
    }

    @Test
    fun `makes the login of the settings an administrator with a password, hiding the password`() {
        val properties = AdminProperties(login = "Boss", password = "correct horse")

        assertEquals("boss", properties.configuredLogin)
        assertEquals(setOf("password" to "boss"), properties.accounts)
        assertEquals(false, properties.toString().contains("correct horse"))
    }

    @Test
    fun `wants the login and the password of the settings together and by the rules, never telling the password`() {
        assertEquals(
            "codraw.admin.password is not set",
            assertFailsWith<IllegalArgumentException> { AdminProperties(login = "boss") }.message,
        )
        assertFailsWith<IllegalArgumentException> { AdminProperties(password = "correct horse") }
        assertFailsWith<IllegalArgumentException> { AdminProperties(login = "босс", password = "correct horse") }
        val short = assertFailsWith<IllegalArgumentException> { AdminProperties(login = "boss", password = "secret1") }
        assertEquals(false, short.message!!.contains("secret1"))
        assertEquals(null, AdminProperties().configuredLogin)
    }

    @ParameterizedTest
    @ValueSource(strings = ["guest:5f2c", "583231", "github:", "gitlab:1", ":1", "oidc:5f2c", "oidc:https://sso.example.com:", "password:"])
    fun `refuses an entry that names no account of a sign-in provider`(entry: String) {
        val failure = assertFailsWith<IllegalArgumentException> { AdminProperties(users = listOf(entry)) }

        assertEquals(true, failure.message?.contains(entry))
    }
}
