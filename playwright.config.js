import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'nx2/test/e2e',
  timeout: 10000,
  use: {
    baseURL: 'http://localhost:7456',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npx serve -l 7456 .',
    url: 'http://localhost:7456',
    reuseExistingServer: !process.env.CI,
  },
});
