package io.github.thescarletarrow.codraw.board

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant
import java.util.UUID

@Table("boards")
data class Board(
    @Id val id: UUID? = null,
    val title: String,
    val createdAt: Instant,
    val updatedAt: Instant,
)
