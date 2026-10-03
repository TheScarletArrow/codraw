package io.github.thescarletarrow.codraw

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class CodrawApplication

fun main(args: Array<String>) {
    runApplication<CodrawApplication>(*args)
}
