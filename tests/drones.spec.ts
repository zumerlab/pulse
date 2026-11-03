import { expect, test, type Page } from '@playwright/test';
import { DRONES } from '../playwright.config.ts';

// The drones app without a simulator: the connect panel, and the recorded
// swarm (six copters on a survey, one low on battery, one with a poor fix,
// one armed on the ground), with the commands answered in the browser. A
// real swarm is not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-drones-settings')) localStorage.setItem('pulse-drones-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no mavlink2rest answering, the app says so and offers the demo', async ({ page }) => {
  await page.goto(`${DRONES}?server=http://127.0.0.1:5999`);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('mavlink2rest did not answer at http://127.0.0.1:5999');
  await page.locator('.connect summary').click();
  await expect(page.locator('.connect code')).toContainText('sim_vehicle.py -v ArduCopter --count 4');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.conn')).toContainText('Demo · six copters, recorded · live');
});

test('the swarm is a radar around home in the face, and the low battery calls with a command to every low drone', async ({ page }) => {
  await page.goto(`${DRONES}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(4);
  await expect(page.locator('.tile[data-system="swarm"] .tile-big')).toHaveText('5 flying');
  await expect(page.locator('.tile[data-system="power"] .tile-big')).toHaveText('17%');
  await expect(page.locator('.tile[data-system="link"] .tile-big')).toHaveText('1 poor');
  await page.locator('.tile[data-system="swarm"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Around home');
  await expect(front.locator('.face-radar')).toHaveAttribute('aria-label', 'Around home: 6 around');
  await expect(front.locator('.radar-dot')).toHaveCount(6);
  await expect(front.locator('.radar-dot.tone-warn')).toHaveCount(2);
  // Power: the loiterer at 17% in front, with "Bring it home" as the action.
  await page.locator('.z-nav-back').click();
  await page.locator('.tile[data-system="power"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Batteries');
  await expect(current(page).locator('.strip')).toContainText('1 drone is under 20% battery: Copter 5 17%');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('Bring it home');
  await current(page).locator('.strip [data-resolve]').click();
  // Home it goes: the mode is Return, and the face says so once the demo lands it.
  await expect(current(page).locator('.layer-front .face-wait')).toHaveCount(0, { timeout: 10_000 });
  await page.locator('.z-nav-back').click();
  await page.locator('.tile[data-system="swarm"]').click();
  await current(page).locator('[data-pick="modes"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-label')).toContainText('Return');
});

test('on the groups axis each drone is an object: its mode is a choice ring that sets it, armed on the ground offers a takeoff', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-drones-settings', '{"calm":"open","axis":"groups","groups":["1","6"]}'); });
  await page.goto(`${DRONES}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(2);
  await expect(page.locator('.tile[data-system="drone:6"] .tile-title')).toHaveText('Copter 6');
  await page.locator('.tile[data-system="drone:6"]').click();
  // Copter 6: armed on the ground with a 2D fix. The arming calls first, offering a takeoff; the demo refuses it without a 3D fix.
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Armed');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('Take off to 30 m');
  await current(page).locator('.strip [data-resolve]').click();
  await expect(current(page).locator('.strip')).toContainText('need 3D fix');
  await expect(current(page).locator('.strip [data-retry]')).toHaveCount(1);
  // The fix itself waits behind, softly (on the ground); the refusal stays with the drone, on every channel of it.
  await current(page).locator('[data-pick="link/gps"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('2D fix');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('5 satellites');
  await expect(current(page).locator('.strip [data-retry]')).toHaveCount(1);
  await page.locator('.z-nav-back').click();
  await page.locator('.tile[data-system="drone:1"]').click();
  await current(page).locator('[data-pick="swarm/mode"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Mode');
  await expect(front.locator('.face-big')).toHaveText('Auto');
  await expect(front.locator('o-arc[role="radio"]')).toHaveCount(5);
  await front.locator('o-arc[role="radio"][aria-label="Loiter"]').dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Loiter');
  // Its speed carries the heading as a bearing.
  await current(page).locator('[data-pick="flight/speed"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .bearing-orbit')).toHaveAttribute('aria-label', /^bearing \d+°$/);
});
