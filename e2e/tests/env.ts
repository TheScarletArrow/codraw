/** Settings shared by the Playwright config and the tests. Defaults match docker-compose.yml. */
export const env = {
  databaseUrl: process.env.SPRING_DATASOURCE_URL ?? 'jdbc:postgresql://localhost:5432/codraw',
  databaseUser: process.env.SPRING_DATASOURCE_USERNAME ?? 'codraw',
  databasePassword: process.env.SPRING_DATASOURCE_PASSWORD ?? 'codraw',
  internalToken: process.env.CODRAW_INTERNAL_TOKEN ?? 'e2e-internal-token',
  // The storage of images of docker-compose.yml.
  s3Endpoint: process.env.CODRAW_IMAGES_S3_ENDPOINT ?? 'http://localhost:9000',
  s3AccessKey: process.env.CODRAW_IMAGES_S3_ACCESS_KEY ?? 'codraw',
  s3SecretKey: process.env.CODRAW_IMAGES_S3_SECRET_KEY ?? 'codraw-secret',
  backendUrl: 'http://localhost:8080',
  jwksUrl: 'http://localhost:8080/.well-known/jwks.json',
  collabPort: 1234,
  frontendUrl: 'http://localhost:4173',
}
