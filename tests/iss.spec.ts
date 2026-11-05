import { expect, test, type Page } from '@playwright/test';
import { ISS } from '../playwright.config.ts';

// The ISS app without the feeds: the panel when nothing answers, and the
// recorded pass (ten seconds of the station on November 5, 2026, through the
// same decoder and parsers as the live stream), with Node 3's CO₂, the
// gyroscopes' momentum and a Falcon 9 made to call, and wing 3B dark as it
// was recorded.

const current = (page: Page) => page.locator('.z-view.is-current-view');
// After a layer comes forward the controls lock for a moment (a nervous tap does not do two things): the next pick waits.
const settled = (page: Page) => expect(current(page).locator('.is-locked')).toHaveCount(0);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-iss-settings')) localStorage.setItem('pulse-iss-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource|WebSocket/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no feed answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.routeWebSocket(/lightstreamer/, (ws) => ws.close());
  await page.goto(ISS);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('None of the feeds answered');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.conn')).toContainText('Demo · a recorded pass · live');
});

test('the recorded pass: four systems call, the rest read the station as it was', async ({ page }) => {
  await page.goto(`${ISS}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(9);
  await expect(page.locator('.tile[data-system="air"] .tile-big')).toHaveText('4.6 mmHg');
  await expect(page.locator('.tile[data-system="power"] .tile-big')).toHaveText('1 dark');
  await expect(page.locator('.tile[data-system="attitude"] .tile-big')).toHaveText(/^83\.\d%$/);
  await expect(page.locator('.tile[data-system="launches"] .tile-big')).toHaveText(/^T−3[78] min$/);
  await expect(page.locator('.tile[data-system="station"] .tile-big')).toHaveText('Standard');
  await expect(page.locator('.tile[data-system="links"] .tile-big')).toHaveText('Signal');
  // The calm in the order they read: the tiles that call come first.
  await expect(page.locator('.tile[data-system]').first()).toHaveAttribute('data-system', /air|power|attitude|launches/);
});

test('the air follows one analyzer: Node 3 calls, the Lab says how old it is', async ({ page }) => {
  await page.goto(`${ISS}?demo`);
  await page.locator('.tile[data-system="air"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('CO₂ · Node 3');
  await expect(current(page).locator('.strip')).toContainText('Node 3 CO₂ at 4.6 mmHg, above the crew’s comfort');
  // The pressure is the Lab's, a band in mmHg with the psi under it.
  await current(page).locator('[data-pick="pressure"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^7\d\d mmHg$/);
  await expect(current(page).locator('.layer-front .face-label')).toContainText(/14\.\d+ psi · airlock \d+/);
  await settled(page);
  // The O₂ analyzers sample now and then: the reading says so, and would not call.
  await current(page).locator('[data-pick="o2"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-label')).toContainText(/as of \d+ days ago/);
});

test('the solar arrays are eight switches, the dark wing painted; the gyroscopes near saturation call', async ({ page }) => {
  await page.goto(`${ISS}?demo`);
  await page.locator('.tile[data-system="power"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Solar arrays');
  // Eight wings on the ring; only the dark one is painted, and it calls.
  await expect(front.locator('o-arc.ripple')).toHaveCount(1);
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.scroll-item')).toHaveCount(8);
  await expect(current(page).locator('.scroll-item', { hasText: '3B' })).toContainText('3B · 0 V');
  await expect(current(page).locator('.detail-why')).toContainText('Wing 3B without voltage while the others have it');
  await page.goto(`${ISS}?demo&start=attitude`);
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('CMG momentum');
  await settled(page);
  await expect(current(page).locator('.strip')).toContainText(/CMG momentum at 83\.\d%: the thrusters will have to desaturate the gyroscopes/);
  await current(page).locator('[data-pick="gyros"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('4 of 4');
});

test('the orbit is the station on the globe with its heading, the track ahead on the map', async ({ page }) => {
  await page.goto(`${ISS}?demo`);
  await page.locator('.tile[data-system="orbit"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Position');
  await expect(front.locator('.face-globe')).toHaveAttribute('aria-label', /^Position: \d+ on the globe$/);
  await expect(front.locator('.face-globe [data-plot="position"]')).toHaveCount(1);
  await expect(front.locator('.bearing-orbit')).toHaveAttribute('aria-label', /^bearing \d+°$/);
  await expect(front.locator('.face-label')).toContainText('km up · in the dark');
  await current(page).locator('[data-pick="track"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-map')).toHaveAttribute('data-zoom', '2');
  await expect(current(page).locator('.layer-front .face-label')).toContainText(/^in \d+ min · sunrise in \d+ min$/);
});

test('the station names its crew and what is docked; a launch in a list opens its own object', async ({ page }) => {
  await page.goto(`${ISS}?demo`);
  await page.locator('.tile[data-system="station"]').click();
  await current(page).locator('[data-pick="crew"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('7 aboard');
  await expect(current(page).locator('.layer-front .face-label')).toContainText('Expedition 75 · day');
  await settled(page);
  await current(page).locator('[data-pick="docked"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('5 docked');
  await page.locator('.z-nav-back').click();
  await page.locator('.tile[data-system="launches"]').click();
  await expect(current(page).locator('.strip')).toContainText('Falcon 9 Block 5 | USSF-432 in 3');
  await current(page).locator('.layer-front .disc').click();
  const row = current(page).locator('.scroll-item', { hasText: 'Ceres-2' });
  await row.click();
  await expect(current(page)).toHaveAttribute('data-title', 'Ceres-2 | Unknown Payload');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Countdown');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^T−1 d \d+ h$/);
  // Its pad on the street map.
  await current(page).locator('[data-pick="pad"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-map')).toHaveAttribute('data-zoom', '13');
});

test('the pictures are NASA’s to stream: the Ku-band video opens them there', async ({ page }) => {
  await page.goto(`${ISS}?demo&start=links`);
  await current(page).locator('[data-pick="video"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Ku-band video');
  await settled(page);
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('[data-link]')).toHaveText('Watch the station live ↗');
});
