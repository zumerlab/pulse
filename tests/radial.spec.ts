import { expect, test, type Page } from '@playwright/test';

// The radial object with simulated data: board → system → detail, direct
// controls on the front ring and the alert wave. Zumly animates for 0.8 s, so
// the assertions wait for the view that becomes current.

const URL = '/';
const current = (page: Page) => page.locator('.z-view.is-current-view');
const backTitle = (page: Page) => page.locator('.z-nav-back .z-nav-title');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await expect(page.locator('.tile[data-system]')).toHaveCount(5);
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('the board shows one mini ring per system, in English', async ({ page }) => {
  await expect(page.locator('.board h1')).toHaveText('All calm, unless something calls.');
  await expect(page.locator('.tile .tile-title')).toHaveText(['Home', 'Car', 'Pet', 'Health', 'Server']);
  await expect(page.locator('.tile .mini-ring o-progress, .tile .mini-ring o-arc').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('zooming into a system names the level above on the back button', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  await expect(current(page).locator('.system')).toBeVisible();
  await expect(backTitle(page)).toHaveText('Board');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Climate');
  await expect(current(page).locator('.strip')).toContainText('Home · Climate in front · +1 behind');
  // No Zumly lateral bar on desktop: the systems are reached from the board.
  await expect(page.locator('.z-lateral-nav')).toHaveCount(0);
});

test('the front dial is a slider with its knob seated on the value', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  const dial = current(page).locator('.layer-front o-progress[data-dial="climate"]');
  await expect(dial).toHaveAttribute('role', 'slider');
  await expect(dial).toHaveAttribute('aria-valuenow', '23');
  // Orbit 2.1: the knob is an .at-value satellite on the same ring as the progress.
  await expect(current(page).locator('.layer-front .satellite.knob.at-value')).toHaveCount(1);

  await dial.focus();
  await page.keyboard.press('ArrowRight');
  await expect(dial).toHaveAttribute('aria-valuenow', '23.5');
  await page.keyboard.press('End');
  await expect(dial).toHaveAttribute('aria-valuenow', '30');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('target 30°');
  // The arrows moved the dial, not the navigation.
  await expect(current(page).locator('.system')).toBeVisible();
});

test('dragging the ring changes the value and does not open the detail', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  const dial = current(page).locator('.layer-front o-progress[data-dial="climate"]');
  await expect(dial).toHaveAttribute('aria-valuenow', '23');
  const ring = current(page).locator('.layer-front .orbit-12').first();
  const box = (await ring.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width / 2;
  // From the bottom (half a turn) to the right (a quarter turn).
  await page.mouse.move(cx, cy + r);
  await page.mouse.down();
  await page.mouse.move(cx + r * 0.7, cy + r * 0.7, { steps: 5 });
  await page.mouse.move(cx + r, cy, { steps: 5 });
  await page.mouse.up();
  await expect(dial).toHaveAttribute('aria-valuenow', '19.5');
  await page.waitForTimeout(500);
  await expect(current(page).locator('.system')).toBeVisible();
});

test('a simulated alert ripples from the failing segment, not from the disc', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  await current(page).locator('[data-act="alert"]').click();
  // Security (critical) comes to the front with its failing segment.
  const front = current(page).locator('.layer-front');
  await expect(front).toHaveClass(/is-alert/);
  await expect(front.locator('.face-name')).toHaveText('Security');
  await expect(front.locator('o-arc.ripple')).toHaveCount(1);
  await expect(current(page).locator('.strip')).toContainText('Opened with the alarm armed');
  const discWave = await front.locator('.disc').evaluate((el) => getComputedStyle(el, '::after').display);
  expect(discWave).toBe('none');
  // The stage zooms in with the alert and the 3D view switches on: the button shows it pressed.
  await expect(current(page).locator('.stage')).toHaveAttribute('data-zoom', 'alert');
  const view = current(page).locator('[data-act="view"]');
  await expect(view).toHaveAttribute('aria-label', 'View flat');
  await expect(view).toHaveAttribute('aria-pressed', 'true');
  await expect(current(page).locator('.stage')).toHaveClass(/is-3d/);
  // The toggle still decides while the alert lasts.
  await view.click();
  await expect(view).toHaveAttribute('aria-pressed', 'false');
  await expect(current(page).locator('.stage')).not.toHaveClass(/is-3d/);
  await view.click();
  await expect(current(page).locator('.stage')).toHaveClass(/is-3d/);

  await current(page).locator('[data-resolve="security"]').click();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Climate');
  await expect(current(page).locator('o-arc.ripple')).toHaveCount(0);
});

test('the disc opens the detail and the value changed there shows on the way back', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  await current(page).locator('.layer-front .disc').click();
  await expect(current(page).locator('.detail .crumb')).toHaveText(/Home.*Climate/);
  await expect(backTitle(page)).toHaveText('Home');
  // The same dial, closer: its knob says the value; the arrows move it by its step.
  const dial = current(page).locator('.detail-ring o-progress[data-dial="climate"]');
  await expect(current(page).locator('.detail-ring .knob .knob-text')).toHaveText('23°');
  await dial.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(dial).toHaveAttribute('aria-valuenow', '25');
  await expect(current(page).locator('.detail-ring .knob .knob-text')).toHaveText('25°');
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.system')).toBeVisible();
  await expect(current(page).locator('.layer-front o-progress[data-dial]')).toHaveAttribute('aria-valuenow', '25');
  await expect(backTitle(page)).toHaveText('Board');
});

test('tapping a ring behind brings it to the front; its segments are switches', async ({ page }) => {
  await page.locator('.tile[data-system="home"]').click();
  await current(page).locator('o-arc[data-pick="lights"]').dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Lights');
  await expect(front.locator('.face-big')).toHaveText('2 of 5');
  const seg = front.locator('o-arc[data-seg="2"]');
  await expect(seg).toHaveAttribute('role', 'switch');
  await expect(seg).toHaveAttribute('aria-checked', 'false');
  await seg.dispatchEvent('click');
  await expect(current(page).locator('.layer-front o-arc[data-seg="2"]')).toHaveAttribute('aria-checked', 'true');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('3 of 5');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('living room, kitchen and bedroom');
});

test('a critical alert from the board opens its system from the tile', async ({ page }) => {
  await page.locator('[data-act="critical"]').click();
  await expect(current(page).locator('.system')).toBeVisible();
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Tires');
  await expect(current(page).locator('.layer-front o-arc.ripple')).toHaveCount(1);
  await expect(current(page).locator('.strip')).toContainText('Losing pressure');
});
