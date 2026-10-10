package io.github.thescarletarrow.codraw.user

import java.util.Locale

/** A language of the interface of CoDraw, in which letters and messages of notifications reach the user too. */
enum class Language(val tag: String) {
    RU("ru"),
    EN("en"),
    ;

    companion object {
        /** The language of the [tag] of the app, `null` for a language CoDraw does not speak. */
        fun of(tag: String?): Language? = entries.find { it.tag == tag?.lowercase() }

        /**
         * The language of a request by its `Accept-Language` [header]: the most preferred one that CoDraw speaks, and
         * Russian, the language of CoDraw before English, when it speaks none of them or the header is missing.
         */
        fun ofAcceptLanguage(header: String?): Language {
            if (header.isNullOrBlank()) return RU
            val ranges = runCatching { Locale.LanguageRange.parse(header) }.getOrDefault(emptyList())
            return ranges.firstNotNullOfOrNull { of(it.range.substringBefore('-')) } ?: RU
        }
    }
}
