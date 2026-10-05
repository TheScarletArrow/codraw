package io.github.thescarletarrow.codraw

import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling

/** Runs the background tasks of the backend, such as the cleanup of guests. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfiguration
