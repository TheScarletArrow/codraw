/** Builds of Gradle for the tests of the import. */

/**
 * What `codraw.gradle` printed for a build of a shop with Gradle 9.8: `:app` depends on two services and, in its tests,
 * on `:core`, and the services depend on `:core`; `:services` is the parent Gradle adds.
 */
export const SHOP_GRAPH = '{"format":"codraw-gradle","version":1,"projects":[{"path":":","name":"shop","plugins":[],"dependencies":[]},{"path":":app","name":"app","plugins":["application","java"],"dependencies":[{"configuration":"implementation","project":":services:billing"},{"configuration":"implementation","project":":services:orders"},{"configuration":"testImplementation","project":":core"}]},{"path":":core","name":"core","plugins":["java-library","java"],"dependencies":[]},{"path":":services","name":"services","plugins":[],"dependencies":[]},{"path":":services:billing","name":"billing","plugins":["java-library","java"],"dependencies":[{"configuration":"api","project":":core"}]},{"path":":services:orders","name":"orders","plugins":["java-library","java"],"dependencies":[{"configuration":"implementation","project":":core"}]}]}'

/** The files of the same build in a chosen folder `shop`, in Kotlin DSL and Groovy. */
export const SHOP_FOLDER = [
  {
    path: 'shop/settings.gradle.kts',
    text: `// The modules of the shop.
rootProject.name = "shop"
enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")
include(":app", ":core")
include(":services:billing", ":services:orders")
`,
  },
  {
    path: 'shop/app/build.gradle.kts',
    text: `plugins {
    kotlin("jvm") version "2.2.0"
    id("org.springframework.boot") version "3.5.0"
    application
}
dependencies {
    implementation(project(":services:billing"))
    implementation(projects.services.orders)
    testImplementation(project(":core")) // only in tests
}
tasks.named("run") { dependsOn(project(":core").tasks.named("jar")) }
`,
  },
  { path: 'shop/core/build.gradle.kts', text: 'plugins { `java-library` }\n' },
  {
    path: 'shop/services/billing/build.gradle.kts',
    text: 'plugins { `java-library` }\ndependencies { api(project(":core")) }\n',
  },
  {
    path: 'shop/services/orders/build.gradle',
    text: "plugins { id 'java-library' }\ndependencies {\n  implementation project(':core')\n  /* implementation project(':app') */\n}\n",
  },
  { path: 'shop/build/tmp/build.gradle.kts', text: 'dependencies { implementation(project(":app")) }\n' },
]
