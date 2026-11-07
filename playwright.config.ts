import { defineConfig, devices } from '@playwright/test';

// The tests run against the demo (demo/, simulated data) on the dev server.
// Pulse for Home Assistant (../pulse-home) and the other apps (../pulse-apps)
// carry their own suites, each over its recordings.
export const DEMO = 'http://127.0.0.1:5173';

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
    // Under 600 px the board switches to the one-system-at-a-time mode.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: { command: 'npm run dev', url: DEMO, reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
