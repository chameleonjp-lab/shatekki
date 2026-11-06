import { defineConfig, devices } from '@playwright/test';

// Browser automation runs against the production build served locally.
// Only Chromium is available in this environment; iPhone tests below emulate
// the viewport/touch of iPhone-class devices in Chromium. They are NOT
// WebKit/Safari results and NOT real-device results.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Main audience: Japanese iPhones. Other locales are covered by unit tests and explicit switches.
    locale: 'ja-JP',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'iphone-portrait-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 402, height: 874 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 15 Pro'].userAgent,
      },
    },
    {
      name: 'short-portrait-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 600 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
