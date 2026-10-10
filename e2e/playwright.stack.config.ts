import { defineConfig, devices } from '@playwright/test'

// Checks a running stack of docker-compose.prod.yml through its app address, as users see it. Unlike
// playwright.config.ts it starts nothing: the stack must already be up.
export default defineConfig({
  testDir: './stack',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-stack' }]] : 'list',
  use: {
    baseURL: process.env.STACK_URL ?? 'http://localhost:8080',
    // The tests find elements by their Russian names; the app follows the language of the browser.
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
      },
    },
  ],
})
