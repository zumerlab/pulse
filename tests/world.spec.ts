import { expect, test, type Page } from '@playwright/test';
import { WORLD } from '../playwright.config.ts';

// The world app without its feeds: the panel when nothing answers, and the
// recorded day of calamities (an M7.1 at sea, a red typhoon, an orange flood
// and a green one near Buenos Aires, an orange wildfire, Kilauea on watch)
// read through the same parsers the live feeds go through. The feeds
// themselves are not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  // The calm systems open on the board (the suite looks at every tile), as the other suites do.
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-world-settings')) localStorage.setItem('pulse-world-settings', '{"calm":"open","mode":"grid"}'); });
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
  await expect(page.locator('.connect .error')).toContainText('None of the feeds answered yet: Earthquakes, Tropical cyclones');
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · a day of calamities · live');
});

test('the recorded day fills five hazards, six things calling', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(5);
  await expect(page.locator('.board h1')).toContainText('6 things calling');
  await expect(page.locator('.tile[data-system="quakes"] .tile-big')).toHaveText('M 7.1');
  await expect(page.locator('.tile[data-system="cyclones"] .tile-big')).toHaveText('204 km/h');
  await expect(page.locator('.tile[data-system="floods"] .tile-big')).toHaveText('Orange');
  await expect(page.locator('.tile[data-system="fires"] .tile-big')).toHaveText('48k ha');
  await expect(page.locator('.tile[data-system="volcanoes"] .tile-big')).toHaveText('Orange');
});

test("the day's earthquakes list in the detail, the strongest first", async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="quakes"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Strongest');
  await expect(front.locator('.face-big')).toHaveText('M 7.1');
  // USGS's tsunami flag is not a warning: the strip says where to look.
  await expect(current(page).locator('.strip')).toContainText('at sea: see tsunami.gov');
  // The strongest on the street map around its epicenter, the day's two other Kermadec quakes with it.
  await expect(front.locator('.face-map')).toHaveAttribute('data-zoom', '5');
  await expect(front.locator('.face-map .map-dot')).toHaveCount(3);
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Strongest');
  // Beside the map, the day's quakes as rows: the magnitude and the region, then where in it and when; the M7 calls.
  const first = current(page).locator('.detail-pair .scroll-item').first();
  await expect(first.locator('.sl-text')).toHaveText('M 7.1 · Kermadec Islands');
  await expect(first.locator('.sl-detail')).toHaveText('98 km NE of Raoul Island · 3 h ago');
  await expect(first).toHaveClass(/level-2/);
  // A row pointed at lights its quake on the map.
  await first.hover();
  await expect(current(page).locator('.detail-map .map-dot.is-lit')).toHaveCount(1);
  // Each quake of the list is an object of its own: where it struck, how deep, how far from you, when.
  await current(page).locator('.scroll-item', { hasText: 'Sand Point' }).click();
  await expect(current(page)).toHaveAttribute('data-title', 'M 5.6 · 120 km SE of Sand Point, Alaska');
  await expect(current(page).locator('.layer-index .layer-item')).toHaveText([/Epicenter/, /Depth/, /From you/, /When/]);
  await expect(current(page).locator('.layer-front .face-map')).toHaveAttribute('data-zoom', '6');
  // The nearest on a map with Buenos Aires, both in the disc.
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.detail h1')).toContainText('Strongest');
  await expect(page.locator('.z-nav-back .z-nav-title')).toHaveText('Earthquakes');
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Strongest');
  await current(page).locator('[data-pick="near"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Nearest');
  await expect(current(page).locator('.layer-front .face-map')).toHaveAttribute('data-zoom', '4');
  await expect(current(page).locator('.layer-front .face-map .map-dot')).toHaveCount(2);
});

test("the red typhoon on the map with the path EONET recorded, each cyclone an object of its own", async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="cyclones"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Worst');
  await expect(front.locator('.face-big')).toHaveText('204 km/h');
  // Calling, the face names the storm; the alert says how bad.
  await expect(front.locator('.face-label')).toHaveText('Cyclone Halia');
  await expect(current(page).locator('.strip')).toContainText('Cyclone Halia: GDACS red alert, category 3, winds of 204 km/h');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('See it on GDACS');
  // Fifteen points of its path and the typhoon itself (the other storm is in the Atlantic, off this map).
  await expect(front.locator('.face-map .map-dot')).toHaveCount(16);
  // The face is about Halia: it opens the storm itself, not a list.
  await front.locator('.disc').click();
  await expect(current(page)).toHaveAttribute('data-title', 'Cyclone Halia');
  await expect(current(page).locator('.layer-index .layer-item')).toHaveText([/Where/, /Alert/, /From you/, /Since/]);
  // The list of them all is Active's: the two at sea; the one of last month is over, not listed.
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="cyclones"]').click();
  await current(page).locator('[data-pick="active"]').first().dispatchEvent('click');
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.scroll-item')).toHaveCount(2);
  await current(page).locator('.scroll-item', { hasText: 'Brisa' }).click();
  await expect(current(page)).toHaveAttribute('data-title', 'Cyclone Brisa');
  await expect(current(page).locator('.layer-index .layer-item')).toHaveText([/Where/, /Alert/, /From you/, /Since/]);
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('83 km/h');
});

test('the nearest flood calls by its distance, even green', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="floods"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Worst');
  await expect(current(page).locator('.strip')).toContainText('Flood in Bangladesh: GDACS orange alert, for 9 days');
  await current(page).locator('[data-pick="near"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-big')).toHaveText('178 km');
  await expect(current(page).locator('.strip')).toContainText('178 km from Buenos Aires: Flood in Argentina');
  // You and the flood on one map.
  await expect(front.locator('.face-map .map-dot')).toHaveCount(2);
});

test("a US volcano rated by its observatory, and the eruptions GDACS saw this month", async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="volcanoes"]').click();
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('Kilauea');
  await expect(current(page).locator('.strip')).toContainText('Aviation code orange at Kilauea, alert level watch (Hawaiian Volcano Observatory)');
  await expect(current(page).locator('.strip [data-resolve]')).toHaveText('See it on USGS');
  await current(page).locator('[data-pick="active"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  // Kilauea, Great Sitkin, Ahyi and Kanlaon; Semeru erupted two months ago.
  await expect(front.locator('.face-big')).toHaveText('4');
  await expect(front.locator('.face-label')).toHaveText('2 orange');
  await expect(front.locator('.face-globe')).toBeVisible();
  // Its detail: the globe big beside the list, the orange ones with a dot, each row its color and where.
  await front.locator('.disc').click();
  const pair = current(page).locator('.detail-pair');
  await expect(pair.locator('.detail-globe .face-globe')).toBeVisible();
  await expect(pair.locator('.scroll-item .sl-text')).toHaveText(['Kilauea', 'Kanlaon', 'Great Sitkin', 'Ahyi Seamount']);
  await expect(pair.locator('.scroll-item.level-1 .sl-mark')).toHaveCount(2);
  await expect(pair.locator('.scroll-item').nth(1).locator('.sl-detail')).toHaveText('Orange · Philippines · erupted 5 d ago');
});

test('a US volcano opens as itself: what it is doing, its alert level among the four, its summit, its last notice', async ({ page }) => {
  await page.goto(`${WORLD}?demo`);
  await page.locator('.tile[data-system="volcanoes"]').click();
  // The worst volcano's face opens Kilauea, not a list of the others.
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page)).toHaveAttribute('data-title', 'Kilauea');
  await expect(current(page).locator('.layer-index .layer-item')).toHaveText([/Activity/, /Alert level/, /Summit/, /Where/, /From you/, /Last notice/]);
  // What it is doing, in the observatory's words, over its picture.
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-big')).toHaveText('Orange');
  await expect(front.locator('.face-label')).toContainText('Intermittent lava flows have continued from the north vent');
  await expect(front.locator('.disc.has-image')).toHaveCount(1);
  // The ground alert level: the four as a choice ring, Watch the one in force.
  await page.waitForTimeout(900);
  await current(page).locator('.layer-index [data-pick="level"]').click();
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Watch');
  await expect(current(page).locator('.layer-front .choice-label')).toHaveText(['Normal', 'Advisory', 'Watch', 'Warning']);
  await expect(current(page).locator('.layer-front .choice-label.is-on')).toHaveAttribute('data-label', 'Watch');
  await page.waitForTimeout(900);
  await current(page).locator('.layer-index [data-pick="summit"]').click();
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('1,247 m');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('very high threat · Hawaii');
  // Its detail reads the notice in full: the picture big and the way to the notice.
  await page.waitForTimeout(900);
  await current(page).locator('.layer-index [data-pick="activity"]').click();
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.detail-image img')).toHaveCount(1);
  await expect(current(page).locator('.detail-link')).toContainText('Read the notice on USGS');
});
