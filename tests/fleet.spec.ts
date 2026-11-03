import { expect, test, type Page } from '@playwright/test';
import { FLEET } from '../playwright.config.ts';

// The fleet app without its broker: the panel when nothing answers, and the
// recorded trams (eighty-four on eleven lines, ten late, three crowded, two
// blind) as the fleet by dimension and as one object per vehicle. The feed
// itself is not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-fleet-settings')) localStorage.setItem('pulse-fleet-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource|WebSocket connection/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no broker answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^wss?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(FLEET);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('The broker did not answer', { timeout: 15_000 });
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · 84 trams, recorded · live');
});

test('the recorded fleet fills four systems; the late trams are the painted ticks of a swarm ring', async ({ page }) => {
  await page.goto(`${FLEET}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(4);
  await expect(page.locator('.board h1')).toContainText('4 things calling');
  await expect(page.locator('.tile[data-system="service"] .tile-big')).toHaveText('10 late');
  await expect(page.locator('.tile[data-system="load"] .tile-big')).toHaveText('3 crowded');
  await expect(page.locator('.tile[data-system="fleet"] .tile-big')).toHaveText('2 blind');
  await expect(page.locator('.tile[data-system="lines"] .tile-big')).toHaveText('7 lines');
  // The tile's mini ring is a swarm too: one SVG, eighty-four ticks.
  await expect(page.locator('.tile[data-system="service"] .swarm-ring')).toHaveAttribute('data-count', '84');
  await page.locator('.tile[data-system="service"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('On time');
  await expect(front.locator('.swarm-ring')).toHaveAttribute('aria-label', 'On time: 74 of 84 on, 10 failing');
  await expect(front.locator('.swarm-tick.is-fail')).toHaveCount(10);
  await expect(front.locator('.swarm-tick.is-calling')).toHaveCount(10);
  await expect(current(page).locator('.strip')).toContainText('10 of 84 trams more than 3 minutes late: Tram 9 · 1060 10:12');
  // The detail lists the members, the latest first.
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('On time');
  await expect(current(page).locator('.scroll-list')).toContainText('Tram 9 · 1060 · 10:12 late');
});

test('on the groups axis each tram is an object: its timetable in front when late, its heading as a bearing', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-fleet-settings', '{"calm":"open","axis":"groups","groups":["40/1012","40/1013","40/1014"]}'); });
  await page.goto(`${FLEET}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system="veh:40/1012"] .tile-title')).toHaveText('Tram 2 → Olympiaterminaali');
  await expect(page.locator('.tile[data-system="veh:40/1012"] .tile-big')).toHaveText('+4:08');
  // The gear groups the vehicles by line.
  await page.locator('.gear').click();
  await expect(page.locator('.settings')).toContainText('Line 2');
  await expect(page.locator('.settings')).toContainText('1012 → Olympiaterminaali');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="veh:40/1012"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Timetable');
  await expect(current(page).locator('.strip')).toContainText('Tram 2 · 1012 to Olympiaterminaali is 4:08 behind schedule');
  // Its motion: the speed as the band, the heading as the bearing.
  await current(page).locator('[data-pick="fleet/motion"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Motion');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^\d+ km\/h$/);
  await expect(current(page).locator('.layer-front .bearing-orbit')).toHaveAttribute('aria-label', /^bearing \d+°$/);
});
