import { expect, test } from '@playwright/test';
import { HA } from '../playwright.config.ts';

// Smoke test only: the Home Assistant app loads and, with no saved tokens,
// shows the sign-in. Connecting needs a real Home Assistant, which is not
// part of the suite.

test('the Home Assistant app loads and asks to sign in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(HA);
  await expect(page.locator('.login h1')).toHaveText('Pulse');
  await expect(page.locator('.login [data-login="oauth"]')).toHaveText('Sign in with Home Assistant');
  await expect(page.locator('.login input[name="url"]')).toHaveValue(/^http/);
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The token path needs both fields.
  await page.locator('.login summary').click();
  await page.locator('[data-login="token"]').click();
  await expect(page.locator('.login input[name="token"]')).toBeFocused();
  expect(errors).toEqual([]);
});
