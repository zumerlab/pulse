import { expect, test, type Locator, type Page } from '@playwright/test';

// The greenhouse on a round screen, handled with one knob (demo/round/):
// `round` keeps every view inside the circle with the object in its center,
// `knob` hands the board to the arrows (turn), Enter (press; held, back) and
// the wheel.

const URL = '/round/';
const current = (page: Page) => page.locator('.z-view.is-current-view');
type Window = { greenhouse: { set(id: string, state: number | string): void; number(id: string): number }; board: { knob: { turn(n: number): void; press(): void; back(): void } } };
const numberOf = (page: Page, id: string) => page.evaluate((id) => (window as unknown as Window).greenhouse.number(id), id);
const centerOf = async (el: Locator) => { const b = (await el.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const hold = async (page: Page, key: string) => { await page.keyboard.down(key); await page.waitForTimeout(800); await page.keyboard.up(key); };

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await expect(page.locator('.otile[data-system]')).toHaveCount(3);
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('the round board is a circle with the object in its center, and no gear', async ({ page }) => {
  const canvas = page.locator('#canvas');
  await expect(canvas).toHaveClass(/round/);
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeCloseTo(box.height, 0);
  expect(box.width).toBe(800);                     // the circle inscribed in a 1280 × 800 window
  await expect(canvas).toHaveCSS('border-radius', '50%');
  await expect(page.locator('.gear')).toHaveCount(0);
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hub = await centerOf(page.locator('.hub-face'));
  expect(Math.abs(hub.x - middle.x)).toBeLessThan(2);
  expect(Math.abs(hub.y - middle.y)).toBeLessThan(2);
  // Inside a system the object keeps the center, calm and when something calls.
  await page.locator('.otile[data-system="water"]').click();
  const disc = current(page).locator('.layer-front .disc');
  await expect(disc).toBeVisible();
  await page.waitForTimeout(1000);
  for (const level of [34, 5]) {
    await page.evaluate((v) => (window as unknown as Window).greenhouse.set('tank.level', v), level);
    await page.waitForTimeout(600);
    const at = await centerOf(disc);
    expect(Math.abs(at.x - middle.x)).toBeLessThan(2);
    expect(Math.abs(at.y - middle.y)).toBeLessThan(2);
  }
  // The way back sits in the middle of the bottom, inside the circle.
  const back = await centerOf(page.locator('.z-depth-nav'));
  expect(Math.abs(back.x - middle.x)).toBeLessThan(2);
});

test('the knob walks the board, opens a system and comes back to where it was', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#canvas')).toHaveAttribute('data-knob', 'on');
  await expect(page.locator('.otile[data-system="climate"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.otile[data-system="water"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(current(page).locator('.sys-title')).toHaveText('Climate');
  // The dial in front is the knob's from the moment the system opens: a turn moves it.
  const dial = current(page).locator('.layer-front o-progress[data-dial="air"]');
  await expect(dial).toBeFocused();
  await expect(page.locator('#canvas')).toHaveAttribute('data-knob', 'held');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(dial).toHaveAttribute('aria-valuenow', '25');
  await expect.poll(() => numberOf(page, 'air.target'), { timeout: 10_000 }).toBe(25);
  // A press lets go of it: the knob walks to the layers behind, and a press brings one to the front.
  await page.keyboard.press('Enter');
  await expect(page.locator('#canvas')).toHaveAttribute('data-knob', 'on');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(current(page).locator('o-arc[data-pick="humidity"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Humidity');
  // A long press steps back, to the tile the system was opened from.
  await page.waitForTimeout(900);
  await hold(page, 'Enter');
  await expect(current(page).locator('.orbit-stage')).toBeVisible();
  await expect(page.locator('.otile[data-system="climate"]')).toBeFocused();
});

test('the knob switches a lamp, and the wheel and the handle turn it too', async ({ page }) => {
  await page.mouse.move(640, 400);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(50); }
  await expect(page.locator('.otile[data-system="light"]')).toBeFocused();
  await page.evaluate(() => (window as unknown as Window).board.knob.press());
  await expect(current(page).locator('.sys-title')).toHaveText('Light');
  const seg = current(page).locator('.layer-front o-arc[data-seg="0"]');
  await expect(seg).toBeFocused();
  await expect(seg).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(seg).toHaveAttribute('aria-checked', 'false');
  await page.evaluate(() => (window as unknown as Window).board.knob.turn(1));
  await expect(current(page).locator('.layer-front o-arc[data-seg="1"]')).toBeFocused();
  // A touch takes over: the knob's mark goes.
  await current(page).locator('.sys-title').click();
  await expect(page.locator('#canvas')).not.toHaveAttribute('data-knob', /./);
});
