import { expect, test } from '@playwright/test';

// Smoke test only: the Home Assistant prototype loads and renders its board.
// Whether it connects depends on the local Home Assistant and .env.local, so
// the connection state is not asserted.

test('the Home Assistant prototype loads its board', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/prototypes/ha-radial/');
  await expect(page.locator('.board h1')).not.toBeEmpty();
  await expect(page.locator('.modes .mode')).toHaveText(['Grid', 'Orbit', 'Layers']);
  await expect(page.locator('.conn')).toContainText('Home Assistant');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(errors).toEqual([]);
});
