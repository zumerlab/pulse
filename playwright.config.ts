import { defineConfig, devices } from '@playwright/test';

// The tests run against the prototype with simulated data (zumly-radial) and
// only load the Home Assistant one: that prototype needs the local Home
// Assistant, which is not part of the suite.
const PORT = 5173;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testIgnore: /phone\.spec\.ts/ },
    // Under 600 px the prototypes switch to the one-system-at-a-time mode.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/prototypes/zumly-radial/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
