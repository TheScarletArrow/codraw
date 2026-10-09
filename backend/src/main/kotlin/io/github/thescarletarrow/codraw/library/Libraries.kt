package io.github.thescarletarrow.codraw.library

import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

/** A library of shapes of a user, without its components. */
data class ShapeLibrary(val id: UUID, val name: String)

/** A component of a library as the panel of shapes lists it: without its content, which only pasting needs. */
data class ComponentSummary(
    val id: UUID,
    val name: String,
    /** A small PNG of the component as a `data:` address, or `null`. */
    val preview: String?,
    val updatedAt: Instant,
)

/** A component of a library with its content. */
data class LibraryComponent(
    val id: UUID,
    val libraryId: UUID,
    val name: String,
    val preview: String?,
    val updatedAt: Instant,
    /** The diagram of draw.io (`<mxGraphModel>`) with the pictures of the component inside it. */
    val content: String,
)

/** Libraries of shapes of users and their components, which only their user sees. */
@Repository
class Libraries(private val jdbc: JdbcClient) {

    /** The libraries of the user, by name regardless of case. */
    fun ofUser(userId: UUID): List<ShapeLibrary> =
        jdbc.sql("SELECT id, name FROM shape_libraries WHERE user_id = :userId ORDER BY lower(name), name, id")
            .param("userId", userId)
            .query { rs, _ -> rs.toLibrary() }
            .list()

    /** The components of all libraries of the user by their library, each in the order they were added. */
    fun componentsOfUser(userId: UUID): Map<UUID, List<ComponentSummary>> = jdbc.sql(
        """
        SELECT c.library_id, $SUMMARY_COLUMNS FROM library_components c
        JOIN shape_libraries l ON l.id = c.library_id
        WHERE l.user_id = :userId
        ORDER BY c.created_at, c.id
        """,
    )
        .param("userId", userId)
        .query { rs, _ -> rs.getObject("library_id", UUID::class.java) to rs.toSummary() }
        .list()
        .groupBy({ it.first }, { it.second })

    /** The components of the library, in the order they were added. */
    fun componentsOf(libraryId: UUID): List<ComponentSummary> =
        jdbc.sql("SELECT $SUMMARY_COLUMNS FROM library_components c WHERE c.library_id = :libraryId ORDER BY c.created_at, c.id")
            .param("libraryId", libraryId)
            .query { rs, _ -> rs.toSummary() }
            .list()

    /** The library [libraryId] of the user [userId]; `null` when the user has no such library. */
    fun find(userId: UUID, libraryId: UUID): ShapeLibrary? =
        jdbc.sql("SELECT id, name FROM shape_libraries WHERE id = :id AND user_id = :userId")
            .param("id", libraryId)
            .param("userId", userId)
            .query { rs, _ -> rs.toLibrary() }
            .optional()
            .orElse(null)

    fun countOfUser(userId: UUID): Int = jdbc.sql("SELECT count(*) FROM shape_libraries WHERE user_id = :userId")
        .param("userId", userId)
        .query(Int::class.java)
        .single()

    /** How many bytes the components of all libraries of the user take together. */
    fun sizeOfUser(userId: UUID): Long = jdbc.sql(
        """
        SELECT coalesce(sum(c.size), 0) FROM library_components c
        JOIN shape_libraries l ON l.id = c.library_id
        WHERE l.user_id = :userId
        """,
    )
        .param("userId", userId)
        .query(Long::class.java)
        .single()

    fun add(userId: UUID, name: String, at: Instant): ShapeLibrary = jdbc.sql(
        "INSERT INTO shape_libraries (user_id, name, created_at) VALUES (:userId, :name, :at) RETURNING id, name",
    )
        .param("userId", userId)
        .param("name", name)
        .param("at", at.atOffset(ZoneOffset.UTC))
        .query { rs, _ -> rs.toLibrary() }
        .single()

    fun rename(libraryId: UUID, name: String) {
        jdbc.sql("UPDATE shape_libraries SET name = :name WHERE id = :id").param("id", libraryId).param("name", name).update()
    }

    /** Deletes the library with its components. */
    fun delete(libraryId: UUID) {
        jdbc.sql("DELETE FROM shape_libraries WHERE id = :id").param("id", libraryId).update()
    }

    fun countComponents(libraryId: UUID): Int = jdbc.sql("SELECT count(*) FROM library_components WHERE library_id = :libraryId")
        .param("libraryId", libraryId)
        .query(Int::class.java)
        .single()

    /** The component [componentId] of the library [libraryId] of the user [userId], with its content. */
    fun findComponent(userId: UUID, libraryId: UUID, componentId: UUID): LibraryComponent? = jdbc.sql(
        """
        SELECT c.library_id, c.content, $SUMMARY_COLUMNS FROM library_components c
        JOIN shape_libraries l ON l.id = c.library_id
        WHERE c.id = :id AND c.library_id = :libraryId AND l.user_id = :userId
        """,
    )
        .param("id", componentId)
        .param("libraryId", libraryId)
        .param("userId", userId)
        .query { rs, _ -> rs.toComponent() }
        .optional()
        .orElse(null)

    /** The bytes that the component [componentId] takes, or `null` without one. */
    fun sizeOfComponent(componentId: UUID): Long? = jdbc.sql("SELECT size FROM library_components WHERE id = :id")
        .param("id", componentId)
        .query(Long::class.java)
        .optional()
        .orElse(null)

    fun addComponent(libraryId: UUID, name: String, content: String, preview: String?, size: Int, at: Instant): ComponentSummary =
        jdbc.sql(
            """
            INSERT INTO library_components (library_id, name, content, preview, size, created_at, updated_at)
            VALUES (:libraryId, :name, :content, :preview, :size, :at, :at)
            RETURNING id, name, preview, updated_at
            """,
        )
            .param("libraryId", libraryId)
            .param("name", name)
            .param("content", content)
            .param("preview", preview)
            .param("size", size)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .query { rs, _ -> rs.toSummary() }
            .single()

    fun renameComponent(componentId: UUID, name: String, at: Instant) {
        jdbc.sql("UPDATE library_components SET name = :name, updated_at = :at WHERE id = :id")
            .param("id", componentId)
            .param("name", name)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    /** Puts [content] and [preview] into the component instead of what it had. */
    fun replaceContent(componentId: UUID, content: String, preview: String?, size: Int, at: Instant) {
        jdbc.sql("UPDATE library_components SET content = :content, preview = :preview, size = :size, updated_at = :at WHERE id = :id")
            .param("id", componentId)
            .param("content", content)
            .param("preview", preview)
            .param("size", size)
            .param("at", at.atOffset(ZoneOffset.UTC))
            .update()
    }

    fun deleteComponent(componentId: UUID) {
        jdbc.sql("DELETE FROM library_components WHERE id = :id").param("id", componentId).update()
    }

    /** Passes all libraries of the user [fromUserId] with their components to the user [toUserId]. */
    fun transfer(fromUserId: UUID, toUserId: UUID) {
        jdbc.sql("UPDATE shape_libraries SET user_id = :to WHERE user_id = :from").param("from", fromUserId).param("to", toUserId).update()
    }

    private fun ResultSet.toLibrary() = ShapeLibrary(getObject("id", UUID::class.java), getString("name"))

    private fun ResultSet.toSummary() = ComponentSummary(
        id = getObject("id", UUID::class.java),
        name = getString("name"),
        preview = getString("preview"),
        updatedAt = getObject("updated_at", OffsetDateTime::class.java).toInstant(),
    )

    private fun ResultSet.toComponent() = toSummary().let {
        LibraryComponent(it.id, getObject("library_id", UUID::class.java), it.name, it.preview, it.updatedAt, getString("content"))
    }

    companion object {
        private const val SUMMARY_COLUMNS = "c.id, c.name, c.preview, c.updated_at"
    }
}
