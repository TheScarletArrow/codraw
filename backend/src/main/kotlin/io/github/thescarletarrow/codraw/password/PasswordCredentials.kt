package io.github.thescarletarrow.codraw.password

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

/** The hashes of the passwords of users, apart from `users`: nothing that reads a user or exports their data reads them. */
@Repository
class PasswordCredentials(private val jdbc: JdbcClient) {

    /** The hash of the password of the user [userId], `null` for a user without a password. */
    fun hashOf(userId: UUID): String? = jdbc.sql("SELECT password_hash FROM password_credentials WHERE user_id = :userId")
        .param("userId", userId)
        .query(String::class.java)
        .optional()
        .orElse(null)

    fun insert(userId: UUID, hash: String, at: Instant) {
        jdbc.sql("INSERT INTO password_credentials (user_id, password_hash, changed_at) VALUES (:userId, :hash, :at)")
            .param("userId", userId)
            .param("hash", hash)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Replaces the hash of the password of the user [userId]: a new password, or the same one hashed anew. */
    fun update(userId: UUID, hash: String, at: Instant): Boolean =
        jdbc.sql("UPDATE password_credentials SET password_hash = :hash, changed_at = :at WHERE user_id = :userId")
            .param("userId", userId)
            .param("hash", hash)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update() > 0

    /** Ends all sessions of the user [userId], e.g. when the settings gave their account another password. */
    fun endSessions(userId: UUID): Int = jdbc.sql("DELETE FROM spring_session WHERE principal_name = :userId")
        .param("userId", userId.toString())
        .update()

    /** Ends the sessions of the user [userId] but the session [keptSessionId], where Spring Session keeps their id. */
    fun endOtherSessions(userId: UUID, keptSessionId: String): Int =
        jdbc.sql("DELETE FROM spring_session WHERE principal_name = :userId AND session_id <> :kept")
            .param("userId", userId.toString())
            .param("kept", keptSessionId)
            .update()
}
