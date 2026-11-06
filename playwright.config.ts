import { defineConfig, devices } from '@playwright/test';

// Browser automation runs against the production build served locally.
// Only Chromium is available in this environment; iPhone tests below emulate
// the viewport/touch of iPhone-class devices in Chromium. They are NOT
// WebKit/Safari results and NOT real-device results.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  fullyParallel: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-report.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Main audience: Japanese iPhones. Other locales are covered by unit tests and explicit switches.
    locale: 'ja-JP',
  },
  webServer: [
    {
      command: process.env.CI_PREBUILT === 'true' ? 'npm run preview' : 'npm run build && npm run preview',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    // Internal build of the D34-D37 prototype (VITE_SHATEKKI_BUNDLE=expanded-proposed), only for
    // tests/e2e/expanded-*.spec.ts. Never published: Pages deploys the site-dist artifact only.
    {
      command: process.env.CI_PREBUILT === 'true' ? 'npm run preview:expanded' : 'npm run build:expanded && npm run preview:expanded',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    // Internal build with the ammo rewards (VITE_SHATEKKI_BUNDLE=expanded-full, rules-v2-proposed-r003),
    // only for tests/e2e/rewards*.spec.ts. Never published.
    {
      command: process.env.CI_PREBUILT === 'true' ? 'npm run preview:rewards' : 'npm run build:rewards && npm run preview:rewards',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
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
