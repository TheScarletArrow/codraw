package io.github.thescarletarrow.codraw.password

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PasswordRulesTest {

    @ParameterizedTest
    @ValueSource(strings = ["bob", "Alice", "bob.smith", "bob_smith-2", "007", "a2345678901234567890123456789012"])
    fun `takes logins of Latin letters, digits, dots, underscores and hyphens`(login: String) {
        assertNull(PasswordRules.loginProblem(login))
    }

    @ParameterizedTest
    @ValueSource(
        strings = ["", "ab", "алиса", "bоb", ".bob", "-bob", "_bob", "bob smith", "bob@example.com", "a23456789012345678901234567890123"],
    )
    fun `refuses other logins`(login: String) {
        assertEquals(PasswordProblem.LOGIN_INVALID, PasswordRules.loginProblem(login))
    }

    @Test
    fun `wants a password of at least 8 characters, counting an emoji as one`() {
        assertEquals(PasswordProblem.PASSWORD_SHORT, PasswordRules.passwordProblem("bob", "1234567"))
        assertEquals(PasswordProblem.PASSWORD_SHORT, PasswordRules.passwordProblem("bob", "123456😀"))
        assertNull(PasswordRules.passwordProblem("bob", "12345678"))
        assertNull(PasswordRules.passwordProblem("bob", "пароль12"))
    }

    @Test
    fun `refuses a password longer than bcrypt reads, in bytes of UTF-8`() {
        assertNull(PasswordRules.passwordProblem("bob", "a".repeat(72)))
        assertEquals(PasswordProblem.PASSWORD_LONG, PasswordRules.passwordProblem("bob", "a".repeat(73)))
        assertNull(PasswordRules.passwordProblem("bob", "я".repeat(36)))
        assertEquals(PasswordProblem.PASSWORD_LONG, PasswordRules.passwordProblem("bob", "я".repeat(37)))
    }

    @Test
    fun `refuses the login as the password, whatever the case`() {
        assertEquals(PasswordProblem.PASSWORD_LOGIN, PasswordRules.passwordProblem("bob.smith", "Bob.Smith"))
    }

    @Test
    fun `keeps a login in lower case`() {
        assertEquals("bob.smith", PasswordRules.normalize("Bob.SMITH"))
    }
}
