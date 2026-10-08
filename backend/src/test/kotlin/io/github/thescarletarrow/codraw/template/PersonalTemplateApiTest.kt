package io.github.thescarletarrow.codraw.template

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.gitHubUser
import io.github.thescarletarrow.codraw.session
import io.github.thescarletarrow.codraw.user.User
import io.github.thescarletarrow.codraw.user.UserService
import io.github.thescarletarrow.codraw.user.ProviderProfile
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.web.server.ResponseStatusException
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@IntegrationTest
class PersonalTemplateApiTest(
    @Autowired private val mvc: MockMvc,
    @Autowired private val jdbc: JdbcClient,
    @Autowired private val users: UserService,
    @Autowired private val templates: PersonalTemplateService,
) {
    private lateinit var alice: User
    private lateinit var bob: User
    private val xml = "<mxfile><diagram id='page-1'><mxGraphModel><root><mxCell id='0'/><mxCell id='1' parent='0'/></root></mxGraphModel></diagram></mxfile>"

    @BeforeEach
    fun reset() {
        jdbc.sql("DELETE FROM personal_templates").update()
        alice = users.gitHubUser("Alice")
        bob = users.gitHubUser("Bob")
    }

    @Test
    fun `CRUD is private and metadata list excludes the diagram`() {
        val saved = templates.create(alice.id, TemplateRequest("  Сервис  ", "  Описание  ", xml))
        mvc.get("/api/templates") { with(alice.session()) }.andExpect {
            status { isOk() }; jsonPath("$[0].title") { value("Сервис") }
            jsonPath("$[0].description") { value("Описание") }; jsonPath("$[0].drawio") { doesNotExist() }
        }
        mvc.get("/api/templates/${saved.id}") { with(alice.session()) }.andExpect { jsonPath("$.drawio") { value(xml) } }
        mvc.get("/api/templates") { with(bob.session()) }.andExpect { content { json("[]") } }
        mvc.get("/api/templates/${saved.id}") { with(bob.session()) }.andExpect { status { isNotFound() } }
        mvc.put("/api/templates/${saved.id}") {
            with(bob.session()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Другой","drawio":"<mxfile><diagram/></mxfile>"}"""
        }.andExpect { status { isNotFound() } }
        mvc.delete("/api/templates/${saved.id}") { with(bob.session()); with(csrf()) }.andExpect { status { isNotFound() } }
        mvc.put("/api/templates/${saved.id}") {
            with(alice.session()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Обновлён","description":"v2","drawio":"<mxfile><diagram/></mxfile>"}"""
        }.andExpect { status { isOk() }; jsonPath("$.title") { value("Обновлён") } }
        mvc.delete("/api/templates/${saved.id}") { with(alice.session()); with(csrf()) }.andExpect { status { isNoContent() } }
        mvc.get("/api/templates/${saved.id}") { with(alice.session()) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `API creates a portable snapshot and requires CSRF`() {
        val body = """{"title":"Новый","drawio":"<mxfile><diagram/></mxfile>"}"""
        mvc.post("/api/templates") { with(alice.session()); contentType = MediaType.APPLICATION_JSON; content = body }
            .andExpect { status { isForbidden() } }
        mvc.post("/api/templates") { with(alice.session()); with(csrf()); contentType = MediaType.APPLICATION_JSON; content = body }
            .andExpect { status { isCreated() }; header { exists("Location") }; jsonPath("$.title") { value("Новый") } }
    }

    @Test
    fun `quota blocks creation but allows updating and frees a slot on deletion`() {
        val first = templates.create(alice.id, TemplateRequest("Первый", drawio = xml))
        repeat(PersonalTemplateService.LIMIT - 1) { templates.create(alice.id, TemplateRequest("Схема $it", drawio = xml)) }
        mvc.post("/api/templates") {
            with(alice.session()); with(csrf()); contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Ещё","drawio":"<mxfile><diagram/></mxfile>"}"""
        }.andExpect { status { isConflict() }; jsonPath("$.limit") { value(50) } }
        templates.update(alice.id, first.id, TemplateRequest("Изменён", drawio = xml))
        templates.delete(alice.id, first.id)
        templates.create(alice.id, TemplateRequest("Свободный слот", drawio = xml))
        assertEquals(50, templates.list(alice.id).size)
    }

    @Test
    fun `invalid names XML external entities and oversized payloads are rejected`() {
        for (request in listOf(
            TemplateRequest(" ", drawio = xml), TemplateRequest("a".repeat(201), drawio = xml),
            TemplateRequest("Схема", "a".repeat(1001), xml), TemplateRequest("Схема", drawio = "broken"),
            TemplateRequest("Схема", drawio = "<!DOCTYPE mxfile [<!ENTITY e SYSTEM 'file:///etc/passwd'>]><mxfile><diagram>&e;</diagram></mxfile>"),
        )) assertEquals(400, assertFailsWith<ResponseStatusException> { templates.create(alice.id, request) }.statusCode.value())
        assertEquals(413, assertFailsWith<ResponseStatusException> {
            templates.create(alice.id, TemplateRequest("Схема", drawio = "a".repeat(PersonalTemplateService.MAX_BYTES + 1)))
        }.statusCode.value())
        assertEquals(0, templates.list(alice.id).size)
    }

    @Test
    fun `guest templates transfer on sign in and user deletion cascades`() {
        val guest = users.createGuest()
        val saved = templates.create(guest.id, TemplateRequest("Гостевой", drawio = xml))
        val account = users.signIn(ProviderProfile("github", UUID.randomUUID().toString(), "Вошёл", null), guest.id)
        assertEquals(saved.drawio, templates.find(account.id, saved.id).drawio)
        assertEquals(emptyList(), templates.list(guest.id))
        jdbc.sql("DELETE FROM users WHERE id = :id").param("id", account.id).update()
        assertEquals(emptyList(), templates.list(account.id))
    }
}
