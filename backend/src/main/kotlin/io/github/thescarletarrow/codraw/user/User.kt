package io.github.thescarletarrow.codraw.user

import org.springframework.data.annotation.Id
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
}
