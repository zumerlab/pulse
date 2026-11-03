import { expect, test, type Page } from '@playwright/test';
import { FLIGHTS } from '../playwright.config.ts';

// The flights app without the networks: the panel when nothing answers, and
// the recorded sky (a 7700 over the Atlantic, Buenos Aires with forty aircraft
// around it, a hold, a fast descent, a lost signal, a Cessna low and slow),
// read through the same parser as the live aircraft.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-flights-settings')) localStorage.setItem('pulse-flights-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no network answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(FLIGHTS);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('None of the networks answered');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.conn')).toContainText('Demo · a recorded sky · live');
});

test('the emergencies sit on a globe in the face, the 7700 calling loudly with the map as the action', async ({ page }) => {
  await page.goto(`${FLIGHTS}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(4);
  await expect(page.locator('.tile[data-system="emergencies"] .tile-big')).toHaveText('7700');
  await expect(page.locator('.tile[data-system="anomalies"] .tile-big')).toHaveText('-5,200 ft/min');
  await expect(page.locator('.tile[data-system="region"] .tile-big')).toHaveText(/^\d+$/);
  await expect(page.locator('.tile[data-system="sky"] .tile-big')).toHaveText('9,400');
  await page.locator('.tile[data-system="emergencies"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Squawking');
  await expect(front.locator('.face-globe')).toHaveAttribute('aria-label', 'Squawking: 2 on the globe');
  await expect(front.locator('.face-globe .globe-land')).toHaveCount(1);
  await expect(front.locator('.face-globe .radar-dot.tone-critical')).toHaveCount(1);
  await expect(current(page).locator('.strip')).toContainText('IBE6845 (A333) is squawking general emergency, 37,000 ft, 36.4°N 28.9°W · 1 more');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('See it on the map');
});

test('the region is a radar of its traffic; the anomalies name the fast descent, the lost signal and the Cessna', async ({ page }) => {
  await page.goto(`${FLIGHTS}?demo`);
  await page.locator('.tile[data-system="region"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Traffic');
  await expect(front.locator('.face-radar .radar-dot')).toHaveCount(40);
  // The odd ones are painted: the fast descent, the lost signal, the Cessna.
  await expect(front.locator('.face-radar .radar-dot.tone-warn')).toHaveCount(3);
  await current(page).locator('[data-pick="holds"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('1');
  await expect(current(page).locator('.layer-front .face-label')).toContainText('in a hold · ARG1800');
  await page.locator('.z-nav-back').click();
  await page.locator('.tile[data-system="anomalies"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Fast descents');
  await expect(current(page).locator('.strip')).toContainText('FBZ5121 is descending at 5,200 ft/min through');
  await expect(current(page).locator('.layer-index .layer-item')).toHaveText([/Fast descents/, /Lost signal/, /Low and slow/]);
  await current(page).locator('[data-pick="lowslow"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^8\d\d ft$/);
  await expect(current(page).locator('.strip')).toContainText(/LV-ZXC is at 8\d\d ft and 82 kn/);
});

test('the sky is a globe of five-degree cells, and on the groups axis an aircraft carries its track as a bearing', async ({ page }) => {
  await page.goto(`${FLIGHTS}?demo`);
  await page.locator('.tile[data-system="sky"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('In the air');
  await expect(front.locator('.face-big')).toHaveText('9,400');
  await expect(front.locator('.face-globe .radar-dot')).toHaveCount(await front.locator('.face-globe .radar-dot').count());
  await expect(front.locator('.face-globe')).toHaveAttribute('aria-label', /^In the air: \d+ on the globe$/);
  await page.goto(`${FLIGHTS}?demo&axis=groups`);
  await page.addInitScript(() => { localStorage.setItem('pulse-flights-settings', '{"calm":"open","axis":"groups","groups":["e0a1b2","e0a1b9"]}'); });
  await page.reload();
  await expect(page.locator('.tile[data-system]')).toHaveCount(2);
  await expect(page.locator('.tile[data-system="ac:e0a1b9"] .tile-big')).toHaveText('-5,200 ft/min');
  await page.locator('.tile[data-system="ac:e0a1b2"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Flight');
  await expect(current(page).locator('.layer-front .bearing-orbit')).toHaveAttribute('aria-label', 'bearing 215°');
  await expect(current(page).locator('.layer-front .face-label')).toContainText('B738 LV-FUC · descending 1,500 ft/min');
});
