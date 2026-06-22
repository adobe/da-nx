import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'nx2/test/e2e',
  timeout: 10000,
  use: {
    baseURL: 'http://localhost:6456',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'aem up --port=6456',
    url: 'http://localhost:6456',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
