package io.github.thescarletarrow.codraw.product

import io.github.thescarletarrow.codraw.admin.AdminAccess
import io.github.thescarletarrow.codraw.admin.AdminController
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

/**
 * The statistics of the installation for its administrators, computed at the request. It lives under the API of
 * administration, which the security configuration lets only administrators through to; viewing changes nothing, so it
 * is not written to the journal.
 */
@RestController
class ProductStatsController(private val access: AdminAccess, private val statistics: ProductStatistics) {

    @GetMapping("${AdminController.PATH}/stats")
    fun stats(@AuthenticationPrincipal principal: OAuth2User): ProductStats {
        access.require(principal)
        return statistics.compute()
    }
}
