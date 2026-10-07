/** Files of docker-compose for the tests of the import. */

/** Three services: a database, a service built from sources and a frontend that publishes a port. */
export const SHOP_COMPOSE = `services:
  postgres:
    image: postgres:18-alpine
  backend:
    build: ./backend
    depends_on: [postgres]
  frontend:
    image: nginx:1.29
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "8080:80"
`

/** The services of CoDraw itself, as its docker-compose.prod.yml has them, shortened. */
export const CODRAW_COMPOSE = `name: codraw-prod
x-restart: &restart
  restart: unless-stopped
services:
  postgres:
    <<: *restart
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: \${POSTGRES_DB:-codraw}
      POSTGRES_USER: \${POSTGRES_USER:-codraw}
  s3:
    <<: *restart
    image: rustfs/rustfs:1.0.1
  backend:
    <<: *restart
    image: \${CODRAW_IMAGE_PREFIX:-ghcr.io/thescarletarrow/codraw-}backend:\${CODRAW_VERSION:-latest}
    build: ./backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/\${POSTGRES_DB:-codraw}
      SPRING_DATASOURCE_USERNAME: \${POSTGRES_USER:-codraw}
      CODRAW_IMAGES_S3_ENDPOINT: \${CODRAW_IMAGES_S3_ENDPOINT:-http://s3:9000}
    depends_on:
      postgres:
        condition: service_healthy
      s3:
        condition: service_healthy
  collab:
    <<: *restart
    image: \${CODRAW_IMAGE_PREFIX:-ghcr.io/thescarletarrow/codraw-}collab:\${CODRAW_VERSION:-latest}
    build:
      context: .
      dockerfile: collab/Dockerfile
    environment:
      BACKEND_URL: http://backend:8080
      BACKEND_JWKS_URL: http://backend:8080/.well-known/jwks.json
    depends_on:
      backend:
        condition: service_healthy
  frontend:
    <<: *restart
    build:
      context: .
      dockerfile: frontend/Dockerfile
    ports:
      - "\${CODRAW_HTTP_PORT:-8080}:8080"
    depends_on:
      backend:
        condition: service_healthy
      collab:
        condition: service_healthy
  prometheus:
    image: prom/prometheus:v3.15.0
    profiles: [monitoring]
    ports:
      - "127.0.0.1:\${CODRAW_PROMETHEUS_PORT:-9090}:9090"
    depends_on:
      - backend
      - collab
`

/** Services in two networks, and one without networks. */
export const NETWORKS_COMPOSE = `services:
  frontend:
    image: nginx
    networks: [public, internal]
  backend:
    image: app
    networks:
      internal:
        aliases: [api]
  postgres:
    image: postgres
networks:
  public:
  internal:
`
