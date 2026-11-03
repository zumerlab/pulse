import { expect, test, type Page } from '@playwright/test';
import { SIGNALK } from '../playwright.config.ts';

// The Signal K app without a server: the connect panel, and the recorded
// yacht (Tehuelche, motor-sailing with shallow water, a low house bank and a
// full holding tank calling, answering the autopilot's PUTs in the browser).
// A real server is not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-signalk-settings')) localStorage.setItem('pulse-signalk-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no server answering, the app says so and offers the demo', async ({ page }) => {
  await page.goto(`${SIGNALK}?server=http://127.0.0.1:5999`);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('No Signal K server answered at http://127.0.0.1:5999');
  await expect(page.locator('.connect input[name="url"]')).toHaveValue('http://127.0.0.1:5999');
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · Tehuelche · live');
});

test('the recorded yacht fills six systems, three things calling', async ({ page }) => {
  await page.goto(`${SIGNALK}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(6);
  await expect(page.locator('.board h1')).toContainText('3 things calling');
  await expect(page.locator('.tile[data-system="navigation"] .tile-big')).toHaveText(/^2\.\d m$/);
  await expect(page.locator('.tile[data-system="electrical"] .tile-big')).toHaveText('24%');
  await expect(page.locator('.tile[data-system="tanks"] .tile-big')).toHaveText('86%');
  await expect(page.locator('.tile[data-system="engine"] .tile-big')).toHaveText(/^1,8\d\d rpm$/);
  await expect(page.locator('.tile[data-system="steering"] .tile-big')).toHaveText('Auto');
  // The apparent wind on the tile carries its angle off the bow.
  await expect(page.locator('.tile[data-system="wind"] .bearing-mark')).toHaveCount(1);
});

test("shallow water is the server's own notification in front of Navigation; seen, the speed shows the course as a bearing", async ({ page }) => {
  await page.goto(`${SIGNALK}?demo`);
  await page.locator('.tile[data-system="navigation"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Depth');
  await expect(current(page).locator('.strip')).toContainText('Shallow water: 2.7 m under the transducer');
  await current(page).locator('.strip [data-resolve]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Speed');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^\d\.\d kn$/);
  await expect(current(page).locator('.layer-front .bearing-orbit')).toHaveAttribute('aria-label', /^bearing 2[01]\d°$/);
  // The heading reads in degrees, from the path's radians (the controls lock for a moment after a layer change).
  await page.waitForTimeout(900);
  await current(page).locator('[data-pick="heading"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^2[01]\d°$/);
  await expect(current(page).locator('.layer-front .face-label')).toContainText('magnetic · course');
});

test('the autopilot is a choice ring that PUTs its state, and its target a dial that PUTs radians', async ({ page }) => {
  await page.goto(`${SIGNALK}?demo`);
  await page.locator('.tile[data-system="steering"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Autopilot');
  await expect(front.locator('.face-big')).toHaveText('Auto');
  await expect(front.locator('.face-label')).toHaveText('target 212°');
  await front.locator('o-arc[role="radio"][aria-label="Standby"]').dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Standby');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('the helm is yours');
  // The target: a dial from 0 to 359, the heading marked on it.
  await current(page).locator('[data-pick="target"]').first().dispatchEvent('click');
  const dial = current(page).locator('.layer-front o-progress[data-dial="target"]');
  await expect(dial).toHaveAttribute('aria-valuenow', '212');
  await dial.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dial).toHaveAttribute('aria-valuenow', '213');
  // Sent after a pause, the demo takes the radians and the face settles on the new degrees.
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('213°');
  await expect(current(page).locator('.layer-front .face-wait')).toHaveCount(0);
});

test("the holding tank takes the server's name for its path, in litres, with a day ring in the detail", async ({ page }) => {
  await page.goto(`${SIGNALK}?demo`);
  await page.locator('.tile[data-system="tanks"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Holding tank');
  await expect(front.locator('.face-big')).toHaveText('86%');
  await expect(current(page).locator('.strip')).toContainText('Holding tank 86% full');
  await current(page).locator('[data-pick="fuel"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Diesel');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('248 of 400 L');
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Diesel');
  await expect(current(page).locator('.time-ring')).toBeVisible();
  await current(page).locator('.things summary').click();
  await expect(current(page).locator('.things li')).toContainText(['tanks.fuel.0.currentLevel']);
});
