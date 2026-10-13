package io.github.thescarletarrow.codraw.security

import io.github.thescarletarrow.codraw.IntegrationTest
import io.github.thescarletarrow.codraw.SESSION_COOKIE
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.web.util.UriComponents
import org.springframework.web.util.UriComponentsBuilder
import tools.jackson.databind.json.JsonMapper
import java.net.URLDecoder
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Sign-in through Яндекс ID and VK ID with the whole code flow: the browser is played by MockMvc, the providers by
 * [FakeSignInProviders], which turn away the requests that the real providers would turn away.
 */
@IntegrationTest
class YandexVkLoginTest(
    @Autowired private val mockMvc: MockMvc,
    @Autowired private val jdbcClient: JdbcClient,
) {

    @BeforeEach
    fun reset() {
        FakeSignInProviders.reset()
        jdbcClient.sql("DELETE FROM boards").update()
        jdbcClient.sql("DELETE FROM users WHERE provider IN ('yandex', 'vk')").update()
    }

    @Test
    fun `asks VK ID with PKCE, its scope and a state of letters, digits, _ and -`() {
        val authorization = authorize("vk")

        assertEquals("https://id.vk.ru/authorize", "${authorization.url.scheme}://${authorization.url.host}${authorization.url.path}")
        assertEquals("code", authorization.param("response_type"))
        assertEquals(FakeSignInProviders.VK_CLIENT_ID, authorization.param("client_id"))
        assertEquals("vkid.personal_info", authorization.param("scope"))
        assertEquals("http://localhost/api/login/oauth2/code/vk", authorization.param("redirect_uri"))
        assertEquals("S256", authorization.param("code_challenge_method"))
        assertEquals(43, authorization.param("code_challenge")?.length)
        assertTrue(Regex("[A-Za-z0-9_-]{32,}").matches(authorization.state), authorization.state)
    }

    @Test
    fun `the first sign-in through VK ID creates the user with the name and the avatar of the profile`() {
        val session = signInWithVk(anna(lastName = "Смирнова"))

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Анна Смирнова") }
            jsonPath("$.avatarUrl") { value(ANNA_AVATAR) }
            jsonPath("$.guest") { value(false) }
        }
        assertEquals(listOf("vk 1234567"), accounts())
        // The provider checked the device, the state, the client and the verifier; the backend sent no secret.
        val exchange = FakeSignInProviders.requests.single { it.path == "/vk/oauth2/auth" }
        assertEquals(DEVICE_ID, exchange.form["device_id"])
        assertFalse("client_secret" in exchange.form)
        assertNull(exchange.authorization)
        val userInfo = FakeSignInProviders.requests.single { it.path == "/vk/oauth2/user_info" }
        assertEquals(FakeSignInProviders.VK_CLIENT_ID, userInfo.form["client_id"])
    }

    @Test
    fun `a repeated sign-in through VK ID finds the same user and takes the new name`() {
        val first = userId(signInWithVk(anna(lastName = "Смирнова")))

        val again = signInWithVk(anna(lastName = "Кузнецова"))

        assertEquals(first, userId(again))
        mockMvc.get("/api/me") { cookie(again) }.andExpect { jsonPath("$.name") { value("Анна Кузнецова") } }
        assertEquals(listOf("vk 1234567"), accounts())
    }

    @Test
    fun `a callback of VK ID without device_id comes back to the login page and creates no user`() {
        val authorization = authorize("vk")
        FakeSignInProviders.vkCode(CODE, authorization.challenge, authorization.state, DEVICE_ID, anna(lastName = "Смирнова"))

        callBack("vk", authorization, "code" to CODE, "state" to authorization.state).andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?error")
        }
        assertEquals(emptyList(), accounts())
    }

    @Test
    fun `VK ID without a profile in its answer sends the user back to the login page`() {
        val authorization = authorize("vk")
        FakeSignInProviders.vkCode(CODE, authorization.challenge, authorization.state, DEVICE_ID, user = null)

        callBack("vk", authorization, "code" to CODE, "state" to authorization.state, "device_id" to DEVICE_ID).andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/login?error")
        }
        assertEquals(emptyList(), accounts())
    }

    @Test
    fun `asks Яндекс ID for the name and the portrait only`() {
        val authorization = authorize("yandex")

        assertEquals("https://oauth.yandex.ru/authorize", "${authorization.url.scheme}://${authorization.url.host}${authorization.url.path}")
        assertEquals(FakeSignInProviders.YANDEX_CLIENT_ID, authorization.param("client_id"))
        assertEquals("login:info login:avatar", authorization.param("scope"))
        assertEquals("http://localhost/api/login/oauth2/code/yandex", authorization.param("redirect_uri"))
    }

    @Test
    fun `the first sign-in through Яндекс ID creates the user with the real name and the portrait`() {
        val authorization = authorize("yandex")
        FakeSignInProviders.yandexCode(
            CODE,
            mapOf(
                "id" to "1130000012345678",
                "login" to "ivan.petrov",
                "display_name" to "Ваня",
                "real_name" to "Иван Петров",
                "sex" to "male",
                "default_avatar_id" to "31804/BYkogAC6AoB17bN1HKRFAyKiM4-1",
                "is_avatar_empty" to false,
            ),
        )

        val session = signedIn(callBack("yandex", authorization, "code" to CODE, "state" to authorization.state))

        mockMvc.get("/api/me") { cookie(session) }.andExpect {
            jsonPath("$.name") { value("Иван Петров") }
            jsonPath("$.avatarUrl") { value("https://avatars.yandex.net/get-yapic/31804/BYkogAC6AoB17bN1HKRFAyKiM4-1/islands-200") }
        }
        assertEquals(listOf("yandex 1130000012345678"), accounts())
        // The secret went in the body, and the token in the scheme of Yandex.
        assertEquals(FakeSignInProviders.YANDEX_CLIENT_SECRET, FakeSignInProviders.requests.single { it.path == "/yandex/token" }.form["client_secret"])
        val userInfo = FakeSignInProviders.requests.single { it.path.startsWith("/yandex/info") }
        assertTrue(userInfo.authorization!!.startsWith("OAuth yandex-"), userInfo.authorization)
    }

    private fun signInWithVk(user: Map<String, Any?>): Cookie {
        val authorization = authorize("vk")
        FakeSignInProviders.vkCode(CODE, authorization.challenge, authorization.state, DEVICE_ID, user)
        // VK ID also sends the kind of the code and how long it lives.
        return signedIn(
            callBack(
                "vk",
                authorization,
                "code" to CODE,
                "state" to authorization.state,
                "device_id" to DEVICE_ID,
                "type" to "code_v2",
                "expires_in" to "600",
            ),
        )
    }

    /** Starts a sign-in through [provider]: the session of the browser and the address at the provider. */
    private fun authorize(provider: String): Authorization {
        val response = mockMvc.get("/api/oauth2/authorization/$provider").andExpect {
            status { is3xxRedirection() }
        }.andReturn().response
        return Authorization(
            Cookie(SESSION_COOKIE, response.getCookie(SESSION_COOKIE)!!.value),
            UriComponentsBuilder.fromUriString(response.getHeader("Location")!!).build(),
        )
    }

    /** Comes back from the provider to the backend in the session that started the sign-in. */
    private fun callBack(provider: String, authorization: Authorization, vararg params: Pair<String, String>) =
        mockMvc.get("/api/login/oauth2/code/$provider") {
            cookie(authorization.session)
            params.forEach { (name, value) -> param(name, value) }
        }

    private fun signedIn(callback: ResultActionsDsl): Cookie {
        val response = callback.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("/")
        }.andReturn().response
        return Cookie(SESSION_COOKIE, response.getCookie(SESSION_COOKIE)!!.value)
    }

    private fun userId(session: Cookie): String =
        mockMvc.get("/api/me") { cookie(session) }.andReturn().response.contentAsString
            .let { JsonMapper.builder().build().readTree(it)["id"].asString() }

    private fun accounts(): List<String> =
        jdbcClient.sql("SELECT provider, provider_user_id FROM users WHERE provider IN ('yandex', 'vk') ORDER BY created_at")
            .query { rs, _ -> "${rs.getString(1)} ${rs.getString(2)}" }
            .list()

    /** The user of VK ID with the right `vkid.personal_info`. */
    private fun anna(lastName: String) = mapOf(
        "user_id" to "1234567",
        "first_name" to "Анна",
        "last_name" to lastName,
        "avatar" to ANNA_AVATAR,
        "sex" to 1,
        "verified" to false,
        "birthday" to "01.02.1990",
    )

    private class Authorization(val session: Cookie, val url: UriComponents) {
        fun param(name: String): String? = url.queryParams.getFirst(name)?.let { URLDecoder.decode(it, Charsets.UTF_8) }

        val state: String get() = param("state")!!
        val challenge: String get() = param("code_challenge")!!
    }

    companion object {
        private const val CODE = "code-from-the-provider"
        private const val DEVICE_ID = "device-of-anna"
        private const val ANNA_AVATAR = "https://sun1-1.userapi.com/s/v1/ig2/anna.jpg"
    }
}
