import { expect, test, type Page } from '@playwright/test';
import { CAMERAS } from '../playwright.config.ts';

// The cameras app without its feeds: the panel when nothing answers, London
// as recorded on the evening of November 5, 2026 (a building fire closing
// Seven Sisters Road with the fire engines on the nearest camera, a camera
// switched off over a breakdown), and the Bay Area as recorded that afternoon
// (the CHP's incidents, Caltrans' signs, its cameras: the streams are live, so
// here only their element and its source are looked at, not the video).

const current = (page: Page) => page.locator('.z-view.is-current-view');
const settled = (page: Page) => expect(current(page).locator('.is-locked')).toHaveCount(0);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { for (const city of ['london', 'bayarea']) if (!localStorage.getItem(`pulse-cameras-settings-${city}`)) localStorage.setItem(`pulse-cameras-settings-${city}`, '{"calm":"open"}'); });
  // The demo asks the feeds only for the stills it did not record, and the streams: none of them is needed here.
  await page.route(/^https:\/\/(s3-eu-west-1\.amazonaws\.com|cwwp2\.dot\.ca\.gov|wzmedia\.dot\.ca\.gov)\//, (r) => r.abort());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no feed answering, the app says so and offers the demo', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)|^http:\/\/127\.0\.0\.1:\d+\/net\//, (r) => r.abort());
  await page.goto(`${CAMERAS}?city=london`);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('The feeds did not answer');
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.conn')).toContainText('Demo · London, recorded · live');
  await expect(page.locator('.conn a')).toHaveText('Powered by TfL Open Data');
});

test('the worst incident is the fire, with the nearest camera’s picture in the face', async ({ page }) => {
  await page.goto(`${CAMERAS}?city=london&demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system="incidents"] .tile-big')).toHaveText('Fire');
  await expect(page.locator('.tile[data-system="cameras"] .tile-big')).toHaveText('Off');
  await expect(page.locator('.tile[data-system="roads"] .tile-big')).toHaveText('24 of 24');
  await page.locator('.tile[data-system="incidents"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Worst');
  await expect(front.locator('.face-image')).toHaveAttribute('src', /\/demo\/london\/00001\.09622\.jpg$/);
  await expect(front.locator('.face-image')).toHaveAttribute('alt', 'Seven Sisters Rd Op Yonge Pk');
  await expect(current(page).locator('.strip')).toContainText('A503 Seven Sisters Road (Eastbound) at the junction of Durham Road: Use alternative route');
  // Its detail: the picture big, and the camera's last clip as the way out.
  await front.locator('.disc').click();
  await expect(current(page).locator('[data-link]')).toHaveText('Watch the last clip ↗');
});

test('the incidents on the map: a row opens the camera that watches it', async ({ page }) => {
  await page.goto(`${CAMERAS}?city=london&demo&start=incidents`);
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
  await page.goto(`${CAMERAS}?city=london&demo&start=cameras`);
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Watching');
  await expect(current(page).locator('.strip')).toContainText('The camera at Westhorn Av E of Burnt Ash Hill, watching vehicle breakdown, is switched off');
  await settled(page);
  await current(page).locator('[data-pick="available"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('792 of 890');
  await page.goto(`${CAMERAS}?city=london&demo&start=roads`);
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Corridors');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('flowing');
});

test('the Bay Area: the CHP’s worst incident in plain words, the cameras that are down called dark', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo`);
  await expect(page.locator('.conn')).toContainText('Demo · Bay Area, recorded · live');
  await expect(page.locator('.conn a')).toHaveText('Caltrans · CHP');
  await expect(page.locator('.tile[data-system="incidents"] .tile-big')).toHaveText('Collision');
  await page.locator('.tile[data-system="incidents"]').click();
  await expect(current(page).locator('.strip')).toContainText('Coyote Valley Rd / Hartmann Rd: ambulance on its way');
  await page.goto(`${CAMERAS}?demo&start=cameras`);
  // A camera whose still is Caltrans' "unavailable" card, or whose stream answers with nothing, is dark.
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Watching');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Dark');
  await expect(current(page).locator('.strip')).toContainText('is not answering');
});

test('the Bay Area’s live camera plays its stream in the face, its recorded still as the poster', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo&start=cameras`);
  await settled(page);
  await current(page).locator('[data-pick="live"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Live');
  const video = front.locator('pulse-video.face-image');
  await expect(video).toHaveAttribute('src', /^https:\/\/wzmedia\.dot\.ca\.gov\/D4\/.+\.m3u8$/);
  await expect(video).toHaveAttribute('poster', /\/demo\/bayarea\/.+\.jpg$/);
  await expect(video.locator('video')).toHaveAttribute('muted', '');
  // Every live camera is a row of the detail, and each opens its own object, its stream again in the face.
  await settled(page);
  await front.locator('.disc').click();
  await current(page).locator('.scroll-item').first().click();
  await expect(current(page).locator('.layer-front pulse-video')).toHaveAttribute('src', /\.m3u8$/);
});

test('the signs are read: what the Bay Area’s freeway signs say, none of them warning of an incident now', async ({ page }) => {
  await page.goto(`${CAMERAS}?demo&start=roads`);
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Signs');
  await expect(current(page).locator('.layer-front .face-label')).toContainText('signs with a message');
});
