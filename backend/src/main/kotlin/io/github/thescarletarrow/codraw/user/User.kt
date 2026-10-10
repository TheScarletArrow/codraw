package io.github.thescarletarrow.codraw.user

import org.springframework.data.annotation.Id
import org.springframework.data.jdbc.repository.query.Modifying
import org.springframework.data.jdbc.repository.query.Query
import org.springframework.data.relational.core.mapping.Table
import org.springframework.data.repository.Repository
import java.time.Instant
import java.util.UUID

@Table("users")
data class User(
    @Id val id: UUID,
    val provider: String,
    val providerUserId: String,
    val name: String,
    val avatarUrl: String?,
    val createdAt: Instant,
    /** The language of the interface of the user, in which their letters and messages of notifications go. */
    val language: Language = Language.RU,
)

/** The user works without a sign-in provider. */
val User.guest: Boolean
    get() = provider == ProviderProfile.GUEST

interface UserRepository : Repository<User, UUID> {

    fun findById(id: UUID): User?

    /** Locks the user till the end of the transaction, so that changes counted per user do not race each other. */
    @Query("SELECT * FROM users WHERE id = :id FOR UPDATE")
    fun lock(id: UUID): User?

    @Query(
        """
        INSERT INTO users (provider, provider_user_id, name, avatar_url, created_at)
        VALUES (:provider, :providerUserId, :name, :avatarUrl, :createdAt)
        ON CONFLICT (provider, provider_user_id) DO UPDATE SET name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
        RETURNING *
        """,
    )
    fun upsert(provider: String, providerUserId: String, name: String, avatarUrl: String?, createdAt: Instant): User

    @Modifying
    @Query("UPDATE users SET language = :language WHERE id = :id")
    fun updateLanguage(id: UUID, language: String): Int
}

/**
 * Stands for a deleted user where their id stays without a foreign key, in the changes of documents and the authors of
 * versions: deleting an account replaces their id with it, and the versions show it as [DELETED_USER_NAME].
 */
val DELETED_USER_ID: UUID = UUID(0, 0)

/** How the app names a user whose account was deleted, as it does for comments without an author. */
const val DELETED_USER_NAME = "Удалённый пользователь"
