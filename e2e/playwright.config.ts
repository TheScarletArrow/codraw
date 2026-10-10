import { defineConfig, devices } from '@playwright/test'
import { env } from './tests/env.ts'

// Starts the built services: run `./gradlew bootJar` in backend/ and `pnpm build` before the tests.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: env.frontendUrl,
    // The tests find elements by their Russian names; the app follows the language of the browser.
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Lets environments with a preinstalled browser of another revision use it.
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
          // Without a UTF-8 locale Chromium replaces non-ASCII names of downloads, e.g. «Новая доска.drawio», with «download».
          env: { ...(process.env as Record<string, string>), LANG: process.env.LANG || 'C.UTF-8' },
        },
      },
    },
  ],
  webServer: [
    {
      name: 'backend',
      command: 'java -jar ../backend/build/libs/codraw-backend.jar',
      url: `${env.backendUrl}/actuator/health/readiness`,
      env: {
        // The e2e profile adds a test login: the tests cannot sign in through GitHub or Google.
        SPRING_PROFILES_ACTIVE: 'e2e',
        SPRING_DATASOURCE_URL: env.databaseUrl,
        SPRING_DATASOURCE_USERNAME: env.databaseUser,
        SPRING_DATASOURCE_PASSWORD: env.databasePassword,
        CODRAW_INTERNAL_TOKEN: env.internalToken,
        CODRAW_IMAGES_S3_ENDPOINT: env.s3Endpoint,
        CODRAW_IMAGES_S3_ACCESS_KEY: env.s3AccessKey,
        CODRAW_IMAGES_S3_SECRET_KEY: env.s3SecretKey,
        // Small enough for a test to go beyond it without megabytes of pictures.
        CODRAW_LIMITS_IMAGE_SIZE: '1MB',
        // Letters and messages of notifications link to the app of the tests and go at once, every second; the e2e
        // profile keeps letters in memory instead of an SMTP server, and webhooks of the tests listen on this machine.
        CODRAW_NOTIFICATIONS_APP_URL: env.frontendUrl,
        CODRAW_NOTIFICATIONS_DELIVERY_DELAY: '0s',
        CODRAW_NOTIFICATIONS_DELIVERY_CRON: '* * * * * *',
        CODRAW_NOTIFICATIONS_WEBHOOK_ALLOWED_HOSTS: 'hooks.slack.com,localhost',
        CODRAW_NOTIFICATIONS_WEBHOOK_ALLOW_HTTP: 'true',
        // A corporate provider of OpenID Connect whose issuer does not answer: the login page offers it, and signing in
        // through it comes back with an error. `OidcLoginTest` of the backend signs in through a real Keycloak.
        CODRAW_AUTH_OIDC_CORP_ISSUER_URI: 'http://127.0.0.1:9/realms/acme',
        CODRAW_AUTH_OIDC_CORP_CLIENT_ID: 'codraw',
        CODRAW_AUTH_OIDC_CORP_CLIENT_SECRET: 'codraw-secret',
        CODRAW_AUTH_OIDC_CORP_NAME: 'Keycloak компании',
        // The JVM reads the environment in the encoding of the locale; without a UTF-8 one the name above is garbled.
        LANG: process.env.LANG || 'C.UTF-8',
      },
      timeout: 120_000,
    },
    {
      name: 'collab',
      command: 'node ../collab/dist/index.js',
      url: `http://localhost:${env.collabPort}/health`,
      env: {
        BACKEND_URL: env.backendUrl,
        BACKEND_JWKS_URL: env.jwksUrl,
        CODRAW_INTERNAL_TOKEN: env.internalToken,
        PORT: String(env.collabPort),
        // Tests see a change of access or a deleted board through what participants do, not at a random moment of
        // the periodic check, which collab tests cover.
        ACCESS_CHECK_INTERVAL_MS: String(60 * 60 * 1000),
        // Small enough for a test to reach with a few changes, larger than any other board of the tests: the schema of
        // CoDraw itself, which «Подключиться к базе…» draws, takes about 270 KiB.
        DOCUMENT_SIZE_LIMIT_BYTES: String(512 * 1024),
      },
    },
    {
      name: 'frontend',
      command: 'pnpm --filter @codraw/frontend exec vite preview --port 4173 --strictPort',
      url: env.frontendUrl,
    },
  ],
})
