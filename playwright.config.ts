import { defineConfig, devices } from '@playwright/test';

// The tests run against the demo app (simulated data) and only load the Home
// Assistant app: that one needs the local Home Assistant, which is not part
// of the suite.
export const DEMO = 'http://127.0.0.1:5173';
export const HA = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: DEMO,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /phone\.spec\.ts/ },
    // Under 600 px the apps switch to the one-system-at-a-time mode.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: [
    { command: 'npm run dev', url: DEMO, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:ha', url: HA, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
