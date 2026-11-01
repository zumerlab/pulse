import { expect, test } from '@playwright/test';

// Under 600 px the prototype starts inside a system and moves sideways
// between systems with the view's own dots (Zumly's bar stays off).

test('the phone starts inside Home with one dot per system and no Zumly bar', async ({ page }) => {
  await page.goto('/');
  const current = page.locator('.z-view.is-current-view');
  await expect(current.locator('.system')).toBeVisible();
  await expect(current.locator('.layer-front .face-name')).toHaveText('Climate');
  await expect(current.locator('.dots .dot')).toHaveCount(5);
  await expect(current.locator('.dot[aria-current="true"]')).toHaveAttribute('aria-label', 'Home');
  await expect(page.locator('.z-lateral-nav')).toHaveCount(0);
  await expect(page.locator('.z-nav-back .z-nav-title')).toHaveText('Board');
  // Two visible layers: the third channel is counted, not drawn.
  await expect(current.locator('.layer:not([hidden])')).toHaveCount(2);
  await expect(current.locator('.strip')).toContainText('+2 behind');
  // No horizontal scroll.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);

  // Sideways to the next system: during the move both views are current, so wait for the car.
  await current.locator('.dot[aria-label="Car"]').click();
  const car = page.locator('.z-view.is-current-view[data-view-name="sys-car"]');
  await expect(car.locator('.layer-front .face-name')).toHaveText('Battery');
  await expect(car.locator('.dot[aria-current="true"]')).toHaveAttribute('aria-label', 'Car');
  await expect(page.locator('.z-view.is-current-view')).toHaveCount(1);
});

// A pinch is Zumly's way back, also when the first finger lands on the dial:
// the dial drops its drag and the touch reaches Zumly.
test('a pinch born on the dial zooms out to the board', async ({ page }) => {
  await page.goto('/');
  const current = page.locator('.z-view.is-current-view');
  await expect(current.locator('.system')).toBeVisible();
  const dial = current.locator('.layer-front [data-dial]').first();
  const box = (await dial.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  // The first finger on the ring, the second across the screen; both move toward the middle.
  const a0 = { x: box.x + 6, y: box.y + box.height / 2 }, b0 = { x: box.x + box.width + 40, y: box.y + box.height / 2 };
  const mid = { x: (a0.x + b0.x) / 2, y: a0.y };
  const at = (p: { x: number; y: number }, k: number) => ({ x: mid.x + (p.x - mid.x) * k, y: mid.y + (p.y - mid.y) * k });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a0] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a0, b0] });
  for (const k of [0.9, 0.75, 0.6, 0.45, 0.3]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(a0, k), at(b0, k)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.z-view.is-current-view .board')).toBeVisible();
});
