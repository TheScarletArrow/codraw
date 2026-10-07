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
    /** The most members a board has, besides its owner. */
    @field:Positive
    val membersPerBoard: Int = 100,
    /** The most invitation links of a board that are not revoked. */
    @field:Positive
    val invitesPerBoard: Int = 20,
    /** The most requests for access to a board that wait for an answer of its owner. */
    @field:Positive
    val accessRequestsPerBoard: Int = 50,
    /** The most notifications a user keeps; the oldest go as new ones come. */
    @field:Positive
    val notificationsPerUser: Int = 200,
    /** The most open proposals of changes of a board. */
    @field:Positive
    val proposalsPerBoard: Int = 20,
    /** The most open proposals of changes of one author on one board. */
    @field:Positive
    val proposalsPerAuthor: Int = 3,
    /** The most closed proposals a board keeps; those closed earliest go as others close. */
    @field:Positive
    val closedProposalsPerBoard: Int = 20,
    /** The most personal tags a user gives one board of their list. */
    @field:Positive
    val tagsPerBoard: Int = 10,
    /** The most different personal tags a user has on all boards together. */
    @field:Positive
    val tagsPerUser: Int = 50,
    /** The most personal folders of boards a user has. */
    @field:Positive
    val foldersPerUser: Int = 50,
    /** The most notifications about requests for reviews that the requests of one user give owners of boards in an hour. */
    @field:Positive
    val reviewRequestsPerHour: Int = 30,
    /** The most imports of the schema of a database that a user tries in an hour, refused ones too. */
    @field:Positive
    val schemaImportsPerUserPerHour: Int = 30,
    /** The largest state of a board document, stored by collab or saved as a version. Above the limit of collab. */
    val documentSize: DataSize = DataSize.ofMegabytes(32),
    /** The largest live image of a board, as the browsers of participants publish it. */
    val embedSize: DataSize = DataSize.ofMegabytes(2),
    /** The most that the versions of a board take together; the newest version stays whatever its size. */
    val versionsSizePerBoard: DataSize = DataSize.ofMegabytes(64),
    /** The largest file of an image that participants put on a board. */
    val imageSize: DataSize = DataSize.ofMegabytes(10),
    /** The most that the images of a board take together, the same file once; they stay as long as the board. */
    val imagesSizePerBoard: DataSize = DataSize.ofMegabytes(100),
)
