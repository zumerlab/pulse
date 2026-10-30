import { expect, test } from '@playwright/test';

// Under 600 px the prototype starts inside a system and moves sideways
// between systems with the view's own dots (Zumly's bar stays off).

test('the phone starts inside Home with one dot per system and no Zumly bar', async ({ page }) => {
  await page.goto('/prototypes/zumly-radial/');
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
