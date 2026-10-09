package io.github.thescarletarrow.codraw.issue

import io.github.thescarletarrow.codraw.user.userId
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

/**
 * The connection of the signed-in user to the tracker, and their repositories and issues found with it. A guest gets
 * 403; when the installation links no issues, everything but the settings gets 404. Errors carry the `reason` of
 * [IssueProblems].
 */
@RestController
@RequestMapping(IssueTrackerController.PATH)
class IssueTrackerController(private val tracker: IssueTrackerService) {

    /** Whether the installation links issues, and the connection of the user, without its token. */
    @GetMapping
    fun settings(@AuthenticationPrincipal principal: OAuth2User): TrackerSettings = tracker.settings(principal.userId)

    /** Connects the user with a token that the tracker takes, in place of any earlier one; 400 for one it refuses. */
    @PutMapping("/connection")
    fun connect(@RequestBody request: ConnectRequest, @AuthenticationPrincipal principal: OAuth2User): TrackerConnectionView =
        tracker.connect(principal.userId, request.token)

    /** Forgets the token of the user; repeating it changes nothing. */
    @DeleteMapping("/connection")
    fun disconnect(@AuthenticationPrincipal principal: OAuth2User): ResponseEntity<Void> {
        tracker.disconnect(principal.userId)
        return ResponseEntity.noContent().build()
    }

    /** The repositories that the token of the user reaches, recently changed first, at most 100. */
    @GetMapping("/repositories")
    fun repositories(@AuthenticationPrincipal principal: OAuth2User): List<TrackerRepository> =
        tracker.repositories(principal.userId)

    /**
     * With `number`, the issue of the repository as the user would link it, with whether the repository is private;
     * with `query`, issues of the repository whose text has its words, at most 10.
     */
    @GetMapping("/issues")
    fun issues(
        @RequestParam repository: String,
        @RequestParam(required = false) number: Int?,
        @RequestParam(required = false) query: String?,
        @AuthenticationPrincipal principal: OAuth2User,
    ): Any {
        val name = repository.trim()
        if (!Repositories.isName(name)) badRequest("A repository is owner/name")
        return when {
            number != null -> {
                if (number < 1) badRequest("An issue has a positive number")
                val found = tracker.issue(principal.userId, name, number)
                FoundIssueView.of(found.issue, found.private)
            }
            query != null -> {
                val words = query.trim()
                if (words.length !in 1..QUERY_MAX_LENGTH) badRequest("A query has 1 to $QUERY_MAX_LENGTH characters")
                tracker.search(principal.userId, name, words).map { FoundIssueView.of(it, private = null) }
            }
            else -> badRequest("Either number or query")
        }
    }

    private fun badRequest(reason: String): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, reason)

    companion object {
        const val PATH = "/api/issue-tracker"
        private const val QUERY_MAX_LENGTH = 200
    }
}

data class ConnectRequest(val token: String)

/** An issue found in the tracker, before it is linked. */
data class FoundIssueView(
    val repository: String,
    val number: Int,
    val title: String,
    val state: IssueState,
    val stateReason: IssueStateReason?,
    val url: String,
    /** Whether the repository is private; `null` among results of a search, which do not tell. */
    val private: Boolean?,
    val updatedAt: Instant,
) {
    companion object {
        fun of(issue: TrackerIssue, private: Boolean?) = FoundIssueView(
            repository = issue.repository,
            number = issue.number,
            title = issue.title,
            state = issue.state,
            stateReason = issue.stateReason,
            url = issue.url,
            private = private,
            updatedAt = issue.updatedAt,
        )
    }
}
