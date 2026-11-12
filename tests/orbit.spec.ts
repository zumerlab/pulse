import { expect, test, type Page } from '@playwright/test';

// The board opened straight in a view, the way a shell's `mode` or a viewer's
// saved choice does, over the tutorial's greenhouse. Orbit says in the console
// when a universe has no size as it measures it (`[orbit] … has no size`): a
// view must be sized from its first frame, not a frame later.

const URL = '/greenhouse/';
const MODES = ['grid', 'orbit', 'layers', 'list'] as const;
type Window = { board: { setSettings(patch: { mode: string }): void } };

// Everything the console says while the page lives, errors and warnings alike.
const consoleOf = (page: Page) => {
  const said: string[] = [];
  page.on('pageerror', (e) => said.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(m.text()); });
  return said;
};
const openIn = async (page: Page, mode: string) => {
  await page.addInitScript((mode) => localStorage.setItem('pulse-greenhouse-settings', JSON.stringify({ mode })), mode);
  await page.goto(URL);
  await expect(page.locator(`.z-view.is-current-view .board.mode-${mode}`)).toBeVisible();
};

for (const mode of MODES) {
  test(`the board opens in ${mode} without a warning`, async ({ page }) => {
    const said = consoleOf(page);
    await openIn(page, mode);
    await expect(page.locator('.conn')).toContainText('Greenhouse · live');
    // Orbit measures on the frames after the mount.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect(said).toEqual([]);
  });
}

test('the orbit has its universe sized on its first frame', async ({ page }) => {
  const said = consoleOf(page);
  // The universe's width as the first frame after it is in the page finds it: what Orbit measures.
  await page.addInitScript(() => {
    const seen = new MutationObserver(() => {
      const universe = document.querySelector<HTMLElement>('.orbit-stage .obj > .bigbang');
      if (!universe) return;
      seen.disconnect();
      requestAnimationFrame(() => { (window as unknown as { firstWidth: number }).firstWidth = universe.clientWidth; });
    });
    seen.observe(document, { subtree: true, childList: true });
  });
  await openIn(page, 'orbit');
  await expect(page.locator('.orbit-stage .otile')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => (window as unknown as { firstWidth?: number }).firstWidth)).toBeGreaterThanOrEqual(240);
  // The largest square of the space left: the same size the board settles on.
  const settled = await page.locator('.orbit-stage .obj > .bigbang').evaluate((el) => el.clientWidth);
  const body = await page.locator('.board-body').evaluate((el) => Math.min(el.clientWidth, el.clientHeight));
  expect(settled).toBe(Math.max(240, body));
  expect(said).toEqual([]);
});

test('changing the view on a board already open warns of nothing either', async ({ page }) => {
  const said = consoleOf(page);
  await openIn(page, 'grid');
  for (const mode of ['orbit', 'layers', 'list', 'grid', 'orbit']) {
    await page.evaluate((mode) => (window as unknown as Window).board.setSettings({ mode }), mode);
    await expect(page.locator(`.z-view.is-current-view .board.mode-${mode}`)).toBeVisible();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }
  await expect(page.locator('.orbit-stage .otile')).toHaveCount(3);
  expect(said).toEqual([]);
});
