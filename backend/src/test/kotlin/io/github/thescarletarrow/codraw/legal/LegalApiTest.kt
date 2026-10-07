package io.github.thescarletarrow.codraw.legal

import io.github.thescarletarrow.codraw.IntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@IntegrationTest
class LegalApiTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `gives no operator without a sign-in when the deployment sets none`() {
        mockMvc.get(LegalController.PATH).andExpect {
            status { isOk() }
            jsonPath("$.operator") { value(null) }
            jsonPath("$.contactEmail") { value(null) }
            jsonPath("$.guestBoardRetentionDays") { value(30) }
            jsonPath("$.guestSessionDays") { value(30) }
            jsonPath("$.versionsPerBoard") { value(100) }
            jsonPath("$.notificationRetentionDays") { value(90) }
            jsonPath("$.notificationsPerUser") { value(200) }
            jsonPath("$.closedProposalsPerBoard") { value(20) }
            jsonPath("$.schemaImport") { value(false) }
        }
    }
}

@IntegrationTest
@TestPropertySource(
    properties = [
        "codraw.legal.operator=ООО «Пример»",
        "codraw.legal.contact-email=privacy@example.com",
        "codraw.guests.board-retention=14d",
        "codraw.notifications.retention=60d",
    ],
)
class LegalApiWithOperatorTest(@Autowired private val mockMvc: MockMvc) {

    @Test
    fun `gives the operator of the deployment without a sign-in`() {
        mockMvc.get(LegalController.PATH).andExpect {
            status { isOk() }
            jsonPath("$.operator") { value("ООО «Пример»") }
            jsonPath("$.contactEmail") { value("privacy@example.com") }
            jsonPath("$.guestBoardRetentionDays") { value(14) }
            jsonPath("$.notificationRetentionDays") { value(60) }
        }
    }
}
