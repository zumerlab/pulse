import { expect, test, type Page } from '@playwright/test';
import { HOMELAB } from '../playwright.config.ts';

// The homelab app without a collector: the connect panel, and the demo
// machine (a MacBook that is not there, with a few things calling, answering
// the collector's actions in the browser). A real machine needs the collector
// running on it, which is not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no collector answering, the app says so and offers the demo', async ({ page }) => {
  await page.goto(`${HOMELAB}?collector=http://127.0.0.1:5999`);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('No collector answered at http://127.0.0.1:5999');
  await expect(page.locator('.connect input[name="url"]')).toHaveValue('http://127.0.0.1:5999');
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('.connect summary').click();
  await expect(page.locator('.connect code')).toHaveText('node apps/homelab/collector/collector.mjs');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · a MacBook · live');
});

test('the demo machine fills seven systems, stacked by what calls', async ({ page }) => {
  await page.goto(`${HOMELAB}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  await expect(page.locator('.board h1')).toContainText('5 things calling');
  await expect(page.locator('.tile[data-system="storage"] .tile-big')).toHaveText('93%');
  await expect(page.locator('.tile[data-system="services"] .tile-big')).toHaveText('Exited');
  await expect(page.locator('.tile[data-system="care"] .tile-big')).toHaveText('8 new');
  await expect(page.locator('.tile[data-system="peripherals"] .tile-big')).toHaveText('12%');
  await expect(page.locator('.tile[data-system="power"] .tile-big')).toHaveText(/\d+%/);
  // Layers: the ones calling in front, the quiet ones behind.
  await page.locator('[data-mode="layers"]').click();
  await expect(page.locator('.board .layer[data-depth="0"]')).toHaveAttribute('data-level', '1');
  await expect(page.locator('.board-strip .more')).toHaveCount(4);
});

test('an exited container is the front ring of Services; starting it resolves the alert and the day rings show it', async ({ page }) => {
  await page.goto(`${HOMELAB}?demo`);
  await page.locator('.tile[data-system="services"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-big')).toHaveText('Exited');
  await expect(current(page).locator('.strip')).toContainText('zigbee2mqtt exited');
  // The failing segment is the exited one, the only one with something to do (start it);
  // the running ones are plain segments.
  await expect(front.locator('o-arc[data-seg]')).toHaveCount(1);
  await expect(front.locator('o-arc[data-seg="0"]')).toHaveAttribute('aria-label', 'zigbee2mqtt');
  await expect(front.locator('o-arc[data-seg="0"]')).toHaveAttribute('aria-checked', 'false');
  await expect(front.locator('o-arc.ripple')).toHaveCount(1);
  // The detail: a ring per container, outside in, the exited one in the warning tone.
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Containers');
  await expect(current(page).locator('.history .track-back')).toHaveCount(5);
  await expect(current(page).locator('.switches li').first()).toContainText('zigbee2mqtt');
  // Start it: the demo answers like the collector would, and the alert is gone.
  await current(page).locator('.detail [data-resolve]').click();
  await expect(current(page).locator('.detail-why')).toHaveCount(0);
  await expect(current(page).locator('.switches li').first().locator('input')).toBeChecked();
});

test('a numeric channel draws its day as a ring and names the things behind it', async ({ page }) => {
  await page.goto(`${HOMELAB}?demo`);
  await page.locator('.tile[data-system="compute"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('CPU');
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('CPU');
  await expect(current(page).locator('.time-ring')).toBeVisible();
  await expect(current(page).locator('.time-ring .time-label')).toHaveText('last 24 hours');
  await expect(current(page).locator('.time-ring .time-big')).toHaveText(/\d+%/);
  await current(page).locator('.things summary').click();
  await expect(current(page).locator('.things li')).toContainText(['cpu.load']);
});

test('Time Machine behind on its backup: the alert starts one, and the strip follows it', async ({ page }) => {
  await page.goto(`${HOMELAB}?demo`);
  await page.locator('.tile[data-system="storage"]').click();
  // Volumes calls the most; the backup waits as a satellite and comes to the front when picked.
  await expect(current(page).locator('.sat[data-pick="backup"]')).toBeVisible();
  await current(page).locator('.sat[data-pick="backup"]').click();
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('61 h');
  await expect(current(page).locator('.strip')).toContainText('No Time Machine backup for 61 hours');
  await current(page).locator('.strip [data-resolve]').click();
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Backing up');
});
