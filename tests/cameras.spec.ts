import { expect, test, type Page } from '@playwright/test';
import { CAMERAS } from '../playwright.config.ts';

// The cameras app without TfL: the panel when nothing answers, and a recorded
// evening in London (November 5, 2026, 17:50) through the same parsers: a
// building fire closing Seven Sisters Road with the fire engines on the
// nearest camera, a breakdown on the A40, a camera switched off over another
// breakdown. The stills of the cameras that watched an incident are recorded.

const current = (page: Page) => page.locator('.z-view.is-current-view');
const settled = (page: Page) => expect(current(page).locator('.is-locked')).toHaveCount(0);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-cameras-settings')) localStorage.setItem('pulse-cameras-settings', '{"calm":"open"}'); });
  // The demo asks TfL only for the stills it did not record: none of them is needed here.
  await page.route(/^https:\/\/s3-eu-west-1\.amazonaws\.com\//, (r) => r.abort());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with TfL not answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(CAMERAS);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('TfL did not answer');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.conn')).toContainText('Demo · a recorded evening · live');
  await expect(page.locator('.conn a')).toHaveText('Powered by TfL Open Data');
});

test('the worst incident is the fire, with the nearest camera’s picture in the face', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system="incidents"] .tile-big')).toHaveText('Fire');
  await expect(page.locator('.tile[data-system="cameras"] .tile-big')).toHaveText('Off');
  await expect(page.locator('.tile[data-system="roads"] .tile-big')).toHaveText('24 of 24');
  await page.locator('.tile[data-system="incidents"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Worst');
  await expect(front.locator('.face-image')).toHaveAttribute('src', /\/demo\/00001\.09622\.jpg$/);
  await expect(front.locator('.face-image')).toHaveAttribute('alt', 'Seven Sisters Rd Op Yonge Pk');
  await expect(current(page).locator('.strip')).toContainText('A503 Seven Sisters Road (Eastbound) at the junction of Durham Road: Use alternative route');
  // Its detail: the picture big, and the camera's last clip as the way out.
  await front.locator('.disc').click();
  await expect(current(page).locator('[data-link]')).toHaveText('Watch the last clip ↗');
});

test('the incidents on the map: a row opens the camera that watches it', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo&start=incidents`);
  await current(page).locator('[data-pick="map"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('On the map');
  await expect(front.locator('.face-big')).toHaveText('9');
  await expect(front.locator('.face-map')).toHaveAttribute('data-zoom', '10');
  await settled(page);
  await front.locator('.disc').click();
  await current(page).locator('.scroll-item', { hasText: 'Fire' }).click();
  await expect(current(page)).toHaveAttribute('data-title', 'Seven Sisters Rd Op Yonge Pk');
  // The fire calls from its object too: what is near comes forward, the picture right behind it.
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Nearby');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Fire');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText(/^\d+ m away$/);
  await settled(page);
  await current(page).locator('[data-pick="picture"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-image')).toHaveAttribute('src', /00001\.09622\.jpg$/);
});

test('a camera switched off over a breakdown calls; the corridors and the cameras read as they were', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo&start=cameras`);
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Watching');
  await expect(current(page).locator('.strip')).toContainText('The camera at Westhorn Av E of Burnt Ash Hill, watching vehicle breakdown, is switched off');
  await settled(page);
  await current(page).locator('[data-pick="available"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('792 of 890');
  await page.goto(`${CAMERAS}?demo&start=roads`);
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Corridors');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('flowing');
});
