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
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Lets environments with a preinstalled browser of another revision use it.
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
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
      },
    },
    {
      name: 'frontend',
      command: 'pnpm --filter @codraw/frontend exec vite preview --port 4173 --strictPort',
      url: env.frontendUrl,
    },
  ],
})
