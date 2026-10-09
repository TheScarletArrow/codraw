plugins {
    kotlin("jvm") version "2.3.21"
    kotlin("plugin.spring") version "2.3.21"
    id("org.springframework.boot") version "4.1.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "io.github.thescarletarrow"
version = "0.0.1-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-session-jdbc")
    // Letters about notifications go through the SMTP server of the installation (docs/adr/0008-external-notifications.md).
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.flywaydb:flyway-database-postgresql")
    // Images of boards live in S3-compatible storage (docs/adr/0006-image-storage.md). Requests go through the client
    // of the JDK: neither Netty nor the Apache clients are needed.
    implementation(platform("software.amazon.awssdk:bom:2.55.12"))
    implementation("software.amazon.awssdk:s3") {
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
        exclude(group = "software.amazon.awssdk", module = "apache-client")
        exclude(group = "software.amazon.awssdk", module = "apache5-client")
    }
    implementation("software.amazon.awssdk:url-connection-client")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("tools.jackson.module:jackson-module-kotlin")
    // Also at compile time: the import of a schema from a database builds the connection of the driver itself.
    implementation("org.postgresql:postgresql")

    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:testcontainers-junit-jupiter")
    testImplementation("org.testcontainers:testcontainers-postgresql")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
        // Spring Data binds named query parameters by Java parameter names.
        javaParameters = true
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
    // Testcontainers loads native libraries through JNA.
    jvmArgs("--enable-native-access=ALL-UNNAMED")
}

tasks.bootJar {
    archiveFileName = "codraw-backend.jar"
}

tasks.bootRun {
    // Local development uses the dev profile with defaults for the docker-compose PostgreSQL.
    systemProperty("spring.profiles.active", "dev")
}
