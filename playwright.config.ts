import { defineConfig, devices } from '@playwright/test';

// The tests run against the demo app (simulated data), the Home Assistant app
// over its demo homes (no Home Assistant needed), the homelab app over its
// demo machine (no collector needed), the world app over its recorded day (no
// feeds needed), the Signal K app over its recorded yacht (no server needed)
// the fleet app over its recorded trams (no broker needed) and the Prometheus
// app over its recorded hosts (no server needed).
export const DEMO = 'http://127.0.0.1:5173';
export const HA = 'http://127.0.0.1:5174';
export const HOMELAB = 'http://127.0.0.1:5175';
export const WORLD = 'http://127.0.0.1:5176';
export const SIGNALK = 'http://127.0.0.1:5177';
export const FLEET = 'http://127.0.0.1:5178';
export const PROMETHEUS = 'http://127.0.0.1:5179';

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
    { command: 'npm run dev:homelab', url: HOMELAB, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:world', url: WORLD, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:signalk', url: SIGNALK, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:fleet', url: FLEET, reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npm run dev:prometheus', url: PROMETHEUS, reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
