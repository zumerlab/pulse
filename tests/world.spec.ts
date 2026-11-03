import { expect, test, type Page } from '@playwright/test';
import { WORLD } from '../playwright.config.ts';

// The world app without its feeds: the panel when nothing answers, and the
// recorded stormy day (a G2 storm, an M7.1, gusts and rain, GitHub down) read
// through the same parsers the live feeds go through. The feeds themselves
// are not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  // The calm systems open on the board (the suite looks at every tile), as the other suites do.
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-world-settings')) localStorage.setItem('pulse-world-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no feed answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(WORLD);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('None of the feeds answered yet: NOAA scales, Kp index');
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · a stormy day · live');
});

test('the recorded day fills four systems, six things calling, the wind with its bearing on the tile', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(4);
  await expect(page.locator('.board h1')).toContainText('6 things calling');
  await expect(page.locator('.tile[data-system="earth"] .tile-big')).toHaveText('M 7.1');
  await expect(page.locator('.tile[data-system="services"] .tile-big')).toHaveText('Partial outage');
  await expect(page.locator('.tile[data-system="sun"] .tile-big')).toHaveText('G2');
  await expect(page.locator('.tile[data-system="sky"] .tile-big')).toHaveText('64 km/h');
  await expect(page.locator('.tile[data-system="sky"] .bearing-mark')).toHaveCount(1);
});

test('the wind ring carries a bearing; seen, the gusts give way to the rain', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="sky"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Wind');
  await expect(front.locator('.bearing-orbit')).toHaveAttribute('aria-label', 'bearing 152°');
  await expect(current(page).locator('.strip')).toContainText('Gusts of 64 km/h');
  await current(page).locator('.strip [data-resolve]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Rain');
  await expect(current(page).locator('.strip')).toContainText(/chance of rain in the next 6 hours, [\d.]+ mm/);
});

test('a service down: its degraded components are the painted segments and the alert opens the incident', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="services"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('GitHub');
  await expect(front.locator('.face-big')).toHaveText('Partial outage');
  await expect(front.locator('.face-label')).toHaveText('Incident with Actions and Webhooks');
  await expect(front.locator('o-arc.ripple')).toHaveCount(2);
  await expect(current(page).locator('.strip')).toContainText('Incident with Actions and Webhooks: We have identified the cause');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('Open the incident');
  // The other services are calm, named behind.
  await expect(current(page).locator('.layer-index .layer-item')).toHaveCount(5);
});

test("the day's earthquakes list in the Earth's detail, the strongest first", async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="earth"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Strongest');
  await expect(front.locator('.face-big')).toHaveText('M 7.1');
  await expect(current(page).locator('.strip')).toContainText('tsunami watch');
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Strongest');
  await expect(current(page).locator('.scroll-list')).toContainText('M 7.1 · 98 km NE of Raoul Island');
});

test("the Kp index draws its day in the Sun's detail", async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="sun"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Geomagnetic');
  await expect(front.locator('.face-big')).toHaveText('G2');
  await expect(current(page).locator('.strip')).toContainText('A moderate geomagnetic storm');
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Geomagnetic');
  await expect(current(page).locator('.time-ring')).toBeVisible();
  await expect(current(page).locator('.time-ring .time-big')).toHaveText(/^\d/);
});
