import { expect, test, type Page } from '@playwright/test';

// The tutorial's greenhouse (demo/greenhouse/, docs/tutorial.html): a simulated
// source as three objects on the board, mounted with `mountBoard`. The page
// exposes the greenhouse on `window.greenhouse`, as the tutorial says, so a
// test can empty the tank the way a reader would from the console.

const URL = '/greenhouse/';
const current = (page: Page) => page.locator('.z-view.is-current-view');
type Window = { greenhouse: { set(id: string, state: number | string): void; number(id: string): number } };
const nudge = (page: Page, id: string, state: number | string) => page.evaluate(([id, state]) => (window as unknown as Window).greenhouse.set(id, state), [id, state] as const);
const numberOf = (page: Page, id: string) => page.evaluate((id) => (window as unknown as Window).greenhouse.number(id), id);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('the board shows the three systems of the greenhouse, live', async ({ page }) => {
  await expect(page.locator('.tile .tile-title')).toHaveText(['Climate', 'Water', 'Light']);
  await expect(page.locator('.board-head h1')).toHaveText('All calm.');
  await expect(page.locator('.conn')).toContainText('Greenhouse · live');
});

test('the heater dial sets the target and the greenhouse confirms it', async ({ page }) => {
  await page.locator('.tile[data-system="climate"]').click();
  const dial = current(page).locator('.layer-front o-progress[data-dial="air"]');
  await expect(dial).toHaveAttribute('aria-valuenow', '24');
  await dial.focus();
  await page.keyboard.press('End');
  await expect(dial).toHaveAttribute('aria-valuenow', '35');
  await expect.poll(() => numberOf(page, 'air.target'), { timeout: 10_000 }).toBe(35);
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('target 35°');
});

test('an empty tank calls, and Refill resolves it through the greenhouse', async ({ page }) => {
  await page.locator('.tile[data-system="water"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Tank');
  await nudge(page, 'tank.level', 9);
  const strip = current(page).locator('.strip');
  await expect(strip).toContainText('Down to 9%, with beds watering');
  await strip.locator('[data-resolve="tank"]').click();
  // Refilled to 100; the beds keep watering, so by now it may be a little under.
  await expect.poll(() => numberOf(page, 'tank.level'), { timeout: 10_000 }).toBeGreaterThan(90);
  await expect(strip).toContainText('Water · Tank in front');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^(9\d|100)%$/);
});

test('the watering time is a choice with the chosen one marked', async ({ page }) => {
  await page.locator('.tile[data-system="water"]').click();
  await current(page).locator('.layer-index [data-pick="when"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Watering');
  await expect(current(page).locator('.layer-front [role="radio"]')).toHaveCount(4);
  await expect(current(page).locator('.layer-front [role="radio"][aria-checked="true"]')).toHaveAttribute('aria-label', 'Dawn');
});

test('the temperature opens a detail with a day of the air as a ring', async ({ page }) => {
  await page.locator('.tile[data-system="climate"]').click();
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('Temperature');
  await expect(current(page).locator('.detail .history .time-ring')).toBeVisible();
  await expect(current(page).locator('.detail .history .time-label')).toHaveText('last 24 hours');
});

// What is fine folds only while something critical calls: a notice (level 1)
// leaves the board as it is, its system first.
test('a notice keeps the board whole; a critical alert folds what is calm into one tile', async ({ page }) => {
  await nudge(page, 'air.temperature', 34);
  await expect(page.locator('.tile[data-system].has-alert')).toHaveCount(1);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system]').first()).toHaveAttribute('data-system', 'climate');
  await expect(page.locator('.tile.calm-fold')).toHaveCount(0);
  await nudge(page, 'tank.level', 9);
  // What is critical opens its system by itself: back to the board to see it folded.
  await expect(current(page).locator('.sys-title')).toHaveText('Water');
  await expect(page.locator('.z-view.is-current-view')).toHaveCount(1);
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.board')).toBeVisible();
  await expect(page.locator('.z-view')).toHaveCount(1);
  const fold = page.locator('.tile.calm-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  // Only what calls is left, the critical one first.
  await expect(page.locator('.tile[data-system]:not(.has-alert)')).toHaveCount(0);
  await expect(page.locator('.tile[data-system]').first()).toHaveAttribute('data-system', 'water');
  await fold.click();
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile.calm-fold')).toHaveText('Fold the calm');
  await page.locator('.tile.calm-fold').click();
  await expect(page.locator('.tile[data-system]:not(.has-alert)')).toHaveCount(0);
});
