package io.github.thescarletarrow.codraw.admin

import org.springframework.session.FindByIndexNameSessionRepository
import org.springframework.stereotype.Component
import java.util.UUID

/** The sessions of users, which Spring Session indexes by the name of the principal: the id of the user. */
@Component
class UserSessions(private val sessions: FindByIndexNameSessionRepository<*>) {

    /** Deletes all sessions of the user [userId]: their next request has no session; returns how many. */
    fun deleteAll(userId: UUID): Int {
        val ids = sessions.findByPrincipalName(userId.toString()).keys
        ids.forEach(sessions::deleteById)
        return ids.size
    }
}
