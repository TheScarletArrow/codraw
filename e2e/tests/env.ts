/** Settings shared by the Playwright config and the tests. Defaults match docker-compose.yml. */
export const env = {
  databaseUrl: process.env.SPRING_DATASOURCE_URL ?? 'jdbc:postgresql://localhost:5432/codraw',
  databaseUser: process.env.SPRING_DATASOURCE_USERNAME ?? 'codraw',
  databasePassword: process.env.SPRING_DATASOURCE_PASSWORD ?? 'codraw',
  internalToken: process.env.CODRAW_INTERNAL_TOKEN ?? 'e2e-internal-token',
  backendUrl: 'http://localhost:8080',
  jwksUrl: 'http://localhost:8080/.well-known/jwks.json',
  collabPort: 1234,
  frontendUrl: 'http://localhost:4173',
}
