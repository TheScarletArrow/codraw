package io.github.thescarletarrow.codraw

import jakarta.validation.constraints.Positive
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.util.unit.DataSize
import org.springframework.validation.annotation.Validated

/** Limits that keep one user or one address from filling the disks and the memory of the installation. */
@Validated
@ConfigurationProperties("codraw.limits")
data class LimitProperties(
    /** The most boards a user owns; boards that pass from a guest at sign-in are not limited. */
    @field:Positive
    val boardsPerUser: Int = 100,
    /** The most guests created from one network address in an hour. */
    @field:Positive
    val guestsPerAddressPerHour: Int = 20,
    /** The most reports of errors in browsers taken from one network address in a minute. */
    @field:Positive
    val clientErrorsPerAddressPerMinute: Int = 30,
    /** The most comments a board holds, in all its threads. */
    @field:Positive
    val commentsPerBoard: Int = 5000,
    /** The largest state of a board document, stored by collab or saved as a version. Above the limit of collab. */
    val documentSize: DataSize = DataSize.ofMegabytes(32),
    /** The largest live image of a board, as the browsers of participants publish it. */
    val embedSize: DataSize = DataSize.ofMegabytes(2),
    /** The most that the versions of a board take together; the newest version stays whatever its size. */
    val versionsSizePerBoard: DataSize = DataSize.ofMegabytes(64),
)
