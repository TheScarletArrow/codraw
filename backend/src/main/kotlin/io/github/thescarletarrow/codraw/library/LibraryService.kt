package io.github.thescarletarrow.codraw.library

import io.github.thescarletarrow.codraw.CodrawMetrics
import io.github.thescarletarrow.codraw.Limit
import io.github.thescarletarrow.codraw.LimitProperties
import io.github.thescarletarrow.codraw.user.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** A library of the user with its components, as the panel of shapes lists them. */
data class LibraryView(val id: UUID, val name: String, val components: List<ComponentSummary>)

/** How much room the libraries of the user take and have, and the largest component and picture in it. */
data class LibraryUsage(val used: Long, val quota: Long, val componentSize: Long, val imageSize: Long)

/** What a component is made of: its diagram of draw.io with the pictures in it, and a small PNG of it or none. */
data class ComponentContent(val content: String, val preview: String?)

/** The user has no such library; a library of another user is no library of theirs either. */
class LibraryNotFoundException : RuntimeException("The user has no such library")

/** The library has no such component. */
class ComponentNotFoundException : RuntimeException("The library has no such component")

/** The user has as many libraries as the [limit] allows. */
class LibraryLimitReachedException(val limit: Int) : RuntimeException("The user has $limit libraries, the most allowed")

/** The library holds as many components as the [limit] allows. */
class ComponentLimitReachedException(val limit: Int) : RuntimeException("The library holds $limit components, the most allowed")

/** The libraries of the user take [used] bytes of the [limit], and the component does not fit. */
class LibraryQuotaReachedException(val limit: Long, val used: Long) :
    RuntimeException("The libraries of the user take $used of $limit bytes, the most allowed")

/** The component with its preview is larger than the [limit] of bytes. */
class ComponentTooLargeException(val limit: Long) : RuntimeException("A component must have at most $limit bytes")

/**
 * Personal libraries of shapes: components that a user saved from boards or made of their pictures, which only they see.
 * Changes of one user go one after another under the lock of the user, so that the limits of the number of libraries
 * and components and of the room hold. Callers pass names normalized and checked for length.
 */
@Service
class LibraryService(
    private val libraries: Libraries,
    private val users: UserRepository,
    private val limits: LimitProperties,
    private val metrics: CodrawMetrics,
    private val transactions: TransactionTemplate,
    private val clock: Clock,
) {

    /** The libraries of the user [userId] by name, each with its components in the order they were added. */
    fun libraries(userId: UUID): List<LibraryView> {
        val components = libraries.componentsOfUser(userId)
        return libraries.ofUser(userId).map { LibraryView(it.id, it.name, components[it.id].orEmpty()) }
    }

    fun usage(userId: UUID) = LibraryUsage(
        used = libraries.sizeOfUser(userId),
        quota = limits.librariesSizePerUser.toBytes(),
        componentSize = limits.libraryComponentSize.toBytes(),
        imageSize = limits.libraryImageSize.toBytes(),
    )

    /** Creates a library [name] of the user [userId]; throws [LibraryLimitReachedException] at the limit. */
    @Transactional
    fun create(userId: UUID, name: String): LibraryView {
        lock(userId)
        if (libraries.countOfUser(userId) >= limits.librariesPerUser) {
            metrics.limitReached(Limit.LIBRARIES)
            throw LibraryLimitReachedException(limits.librariesPerUser)
        }
        val library = libraries.add(userId, name, now())
        return LibraryView(library.id, library.name, emptyList())
    }

    @Transactional
    fun rename(userId: UUID, libraryId: UUID, name: String): LibraryView {
        lock(userId)
        val library = libraries.find(userId, libraryId) ?: throw LibraryNotFoundException()
        libraries.rename(library.id, name)
        return LibraryView(library.id, name, libraries.componentsOf(library.id))
    }

    /** Deletes the library with its components; copies of them on boards stay. */
    @Transactional
    fun delete(userId: UUID, libraryId: UUID) {
        lock(userId)
        val library = libraries.find(userId, libraryId) ?: throw LibraryNotFoundException()
        libraries.delete(library.id)
    }

    /** The component [componentId] of the library [libraryId] of the user [userId], with its content. */
    fun component(userId: UUID, libraryId: UUID, componentId: UUID): LibraryComponent =
        libraries.findComponent(userId, libraryId, componentId) ?: throw ComponentNotFoundException()

    /**
     * Adds the component [name] made of [content] to the library [libraryId] of the user [userId]. Throws what [checked]
     * throws for content that is not fit, [LibraryNotFoundException], [ComponentLimitReachedException] and
     * [LibraryQuotaReachedException].
     */
    fun addComponent(userId: UUID, libraryId: UUID, name: String, content: ComponentContent): ComponentSummary {
        // Checked before the transaction, which holds no connection meanwhile.
        val size = checked(content)
        return checkNotNull(
            transactions.execute {
                lock(userId)
                val library = libraries.find(userId, libraryId) ?: throw LibraryNotFoundException()
                if (libraries.countComponents(library.id) >= limits.componentsPerLibrary) {
                    metrics.limitReached(Limit.LIBRARY_COMPONENTS)
                    throw ComponentLimitReachedException(limits.componentsPerLibrary)
                }
                ensureRoom(userId, size, freed = 0)
                libraries.addComponent(library.id, name, content.content, content.preview, size, now())
            },
        )
    }

    /**
     * Gives the component a new [name], or new [content] instead of what it had, or both. Copies of the component on
     * boards stay as they are. Throws what [addComponent] throws, and [ComponentNotFoundException].
     */
    fun updateComponent(userId: UUID, libraryId: UUID, componentId: UUID, name: String?, content: ComponentContent?): ComponentSummary {
        val size = content?.let(::checked)
        return checkNotNull(
            transactions.execute {
                lock(userId)
                val component = libraries.findComponent(userId, libraryId, componentId) ?: throw ComponentNotFoundException()
                val at = now()
                if (name != null) libraries.renameComponent(component.id, name, at)
                if (content != null && size != null) {
                    ensureRoom(userId, size, freed = libraries.sizeOfComponent(component.id) ?: 0)
                    libraries.replaceContent(component.id, content.content, content.preview, size, at)
                }
                ComponentSummary(component.id, name ?: component.name, if (content != null) content.preview else component.preview, at)
            },
        )
    }

    /** Deletes the component; its copies on boards stay. */
    @Transactional
    fun deleteComponent(userId: UUID, libraryId: UUID, componentId: UUID) {
        lock(userId)
        val component = libraries.findComponent(userId, libraryId, componentId) ?: throw ComponentNotFoundException()
        libraries.deleteComponent(component.id)
    }

    /** Passes the libraries of the user [fromUserId] to the user [toUserId], whatever the limits. */
    fun transfer(fromUserId: UUID, toUserId: UUID) = libraries.transfer(fromUserId, toUserId)

    /**
     * The bytes that [content] takes; throws [ComponentTooLargeException] above the limit of a component, and what
     * [ComponentContents] throws for content or a preview that is not fit.
     */
    private fun checked(content: ComponentContent): Int {
        val size = content.content.toByteArray(Charsets.UTF_8).size.toLong() + (content.preview?.length ?: 0)
        val limit = limits.libraryComponentSize.toBytes()
        if (size > limit) {
            metrics.limitReached(Limit.LIBRARY_COMPONENT)
            throw ComponentTooLargeException(limit)
        }
        try {
            ComponentContents.check(content.content, limits.libraryImageSize.toBytes())
        } catch (exception: ComponentImageTooLargeException) {
            metrics.limitReached(Limit.LIBRARY_COMPONENT)
            throw exception
        }
        content.preview?.let(ComponentContents::checkPreview)
        return size.toInt()
    }

    /** Throws [LibraryQuotaReachedException] unless [size] more bytes, with [freed] bytes going, fit the room of the user. */
    private fun ensureRoom(userId: UUID, size: Int, freed: Long) {
        val used = libraries.sizeOfUser(userId)
        val quota = limits.librariesSizePerUser.toBytes()
        // A component that does not grow always fits: the room may have shrunk since it was saved.
        if (size > freed && used - freed + size > quota) {
            metrics.limitReached(Limit.LIBRARIES_SIZE)
            throw LibraryQuotaReachedException(quota, used)
        }
    }

    private fun lock(userId: UUID) {
        checkNotNull(users.lock(userId)) { "User $userId does not exist" }
    }

    // PostgreSQL stores microseconds, so truncate to return exactly what is persisted.
    private fun now(): Instant = clock.instant().truncatedTo(ChronoUnit.MICROS)

    companion object {
        /** The longest name of a library. */
        const val LIBRARY_NAME_MAX_LENGTH = 60

        /** The longest name of a component. */
        const val COMPONENT_NAME_MAX_LENGTH = 80
    }
}
