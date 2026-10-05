# Backend image: built from the sources, run from the layers of the Spring Boot jar on a JRE.
FROM eclipse-temurin:25-jdk-noble AS build
WORKDIR /workspace
# Dependencies first: their layer survives changes of the code.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew --no-daemon --quiet dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon --quiet bootJar \
    && java -Djarmode=tools -jar build/libs/codraw-backend.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:25-jre-noble
RUN groupadd --system codraw && useradd --system --gid codraw --no-create-home codraw
WORKDIR /app
# From the least to the most often changed layer.
COPY --from=build /workspace/extracted/dependencies/ ./
COPY --from=build /workspace/extracted/spring-boot-loader/ ./
COPY --from=build /workspace/extracted/snapshot-dependencies/ ./
COPY --from=build /workspace/extracted/application/ ./
USER codraw
EXPOSE 8080
# The JVM sizes its heap by the memory limit of the container.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
# The JRE image has neither curl nor wget: bash asks for readiness over /dev/tcp.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8080} && printf 'GET /actuator/health/readiness HTTP/1.0\\r\\nHost: localhost\\r\\n\\r\\n' >&3 && grep -q '\"status\":\"UP\"' <&3"]
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
