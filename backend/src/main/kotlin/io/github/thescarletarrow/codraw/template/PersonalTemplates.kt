package io.github.thescarletarrow.codraw.template

import io.github.thescarletarrow.codraw.board.BoardIds
import io.github.thescarletarrow.codraw.user.UserRepository
import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Repository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.net.URI
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import org.xml.sax.InputSource
import java.io.StringReader

data class TemplateInfo(val id: UUID, val title: String, val description: String, val createdAt: Instant, val updatedAt: Instant)
data class SavedTemplate(val id: UUID, val title: String, val description: String, val drawio: String, val createdAt: Instant, val updatedAt: Instant)
data class TemplateRequest(val title: String, val description: String = "", val drawio: String)

@Repository
class PersonalTemplateRepository(private val jdbc: JdbcClient) {
    fun list(owner: UUID): List<TemplateInfo> = jdbc.sql("SELECT id, title, description, created_at, updated_at FROM personal_templates WHERE owner_id = :owner ORDER BY updated_at DESC, id DESC")
        .param("owner", owner).query { rs, _ -> TemplateInfo(rs.getObject("id", UUID::class.java), rs.getString("title"), rs.getString("description"), rs.getObject("created_at", OffsetDateTime::class.java).toInstant(), rs.getObject("updated_at", OffsetDateTime::class.java).toInstant()) }.list()

    fun find(owner: UUID, id: UUID): SavedTemplate? = jdbc.sql("SELECT * FROM personal_templates WHERE owner_id = :owner AND id = :id")
        .param("owner", owner).param("id", id).query { rs, _ -> SavedTemplate(rs.getObject("id", UUID::class.java), rs.getString("title"), rs.getString("description"), rs.getString("drawio"), rs.getObject("created_at", OffsetDateTime::class.java).toInstant(), rs.getObject("updated_at", OffsetDateTime::class.java).toInstant()) }.optional().orElse(null)

    fun create(owner: UUID, request: TemplateRequest, at: Instant): UUID = jdbc.sql("INSERT INTO personal_templates(owner_id, title, description, drawio, created_at, updated_at) VALUES (:owner, :title, :description, :drawio, :at, :at) RETURNING id")
        .param("owner", owner).param("title", request.title).param("description", request.description).param("drawio", request.drawio).param("at", at.atOffset(ZoneOffset.UTC)).query(UUID::class.java).single()

    fun update(owner: UUID, id: UUID, request: TemplateRequest, at: Instant): Boolean = jdbc.sql("UPDATE personal_templates SET title = :title, description = :description, drawio = :drawio, updated_at = :at WHERE owner_id = :owner AND id = :id")
        .param("owner", owner).param("id", id).param("title", request.title).param("description", request.description).param("drawio", request.drawio).param("at", at.atOffset(ZoneOffset.UTC)).update() > 0

    fun delete(owner: UUID, id: UUID): Boolean = jdbc.sql("DELETE FROM personal_templates WHERE owner_id = :owner AND id = :id").param("owner", owner).param("id", id).update() > 0
    fun count(owner: UUID): Int = jdbc.sql("SELECT count(*) FROM personal_templates WHERE owner_id = :owner").param("owner", owner).query(Int::class.java).single()
    fun transfer(from: UUID, to: UUID) { jdbc.sql("UPDATE personal_templates SET owner_id = :to WHERE owner_id = :from").param("from", from).param("to", to).update() }
}

@Service
class PersonalTemplateService(private val templates: PersonalTemplateRepository, private val users: UserRepository, private val clock: Clock) {
    fun list(owner: UUID) = templates.list(owner)
    fun find(owner: UUID, id: UUID) = templates.find(owner, id) ?: throw notFound()

    @Transactional
    fun create(owner: UUID, request: TemplateRequest): SavedTemplate {
        val valid = validate(request)
        checkNotNull(users.lock(owner))
        if (templates.count(owner) >= LIMIT) throw TemplateLimitReached()
        return find(owner, templates.create(owner, valid, now()))
    }

    @Transactional
    fun update(owner: UUID, id: UUID, request: TemplateRequest): SavedTemplate {
        find(owner, id)
        if (!templates.update(owner, id, validate(request), now())) throw notFound()
        return find(owner, id)
    }

    fun delete(owner: UUID, id: UUID) { if (!templates.delete(owner, id)) throw notFound() }
    private fun now() = clock.instant().truncatedTo(ChronoUnit.MICROS)

    private fun validate(request: TemplateRequest): TemplateRequest {
        val normalized = request.copy(title = request.title.trim(), description = request.description.trim())
        if (normalized.title.length !in 1..200 || normalized.description.length > 1000) throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid template name or description")
        if (normalized.drawio.toByteArray(Charsets.UTF_8).size !in 1..MAX_BYTES) throw ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "Template must have at most $MAX_BYTES bytes")
        try {
            val factory = DocumentBuilderFactory.newInstance()
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "")
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "")
            factory.isXIncludeAware = false
            factory.isExpandEntityReferences = false
            val root = factory.newDocumentBuilder().parse(InputSource(StringReader(normalized.drawio))).documentElement
            if (root.tagName != "mxfile" || root.getElementsByTagName("diagram").length == 0) throw IllegalArgumentException("Not a diagram")
        } catch (exception: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Template must be a valid draw.io file without external entities")
        }
        return normalized
    }

    companion object { const val LIMIT = 50; const val MAX_BYTES = 8 * 1024 * 1024 }
}

class TemplateLimitReached : RuntimeException()
private fun notFound() = ResponseStatusException(HttpStatus.NOT_FOUND, "Template not found")

@RestController
@RequestMapping("/api/templates")
class PersonalTemplateController(private val templates: PersonalTemplateService) {
    @GetMapping
    fun list(@AuthenticationPrincipal principal: OAuth2User) = templates.list(principal.userId)
    @GetMapping("/{id}")
    fun get(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User) = templates.find(principal.userId, parse(id))
    @PostMapping
    fun create(@RequestBody request: TemplateRequest, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<SavedTemplate> {
        val saved = templates.create(principal.userId, request)
        return ResponseEntity.created(URI.create("/api/templates/${saved.id}")).body(saved)
    }
    @PutMapping("/{id}")
    fun update(@PathVariable id: String, @RequestBody request: TemplateRequest, @AuthenticationPrincipal principal: OAuth2User) = templates.update(principal.userId, parse(id), request)
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        templates.delete(principal.userId, parse(id))
        return ResponseEntity.noContent().build()
    }
    @ExceptionHandler
    fun limit(exception: TemplateLimitReached): ProblemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Personal template limit reached").apply { title = "Template limit reached"; setProperty("limit", PersonalTemplateService.LIMIT) }
    private fun parse(id: String) = BoardIds.parse(id) ?: throw notFound()
}
