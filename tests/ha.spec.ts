import { expect, test, type Page } from '@playwright/test';
import { HA } from '../playwright.config.ts';

// The Home Assistant app without a Home Assistant: the sign-in, and the demo
// homes of demo.home-assistant.io (entities that answer service calls in the
// browser). Connecting to a real one needs saved tokens and is not part of
// the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no saved tokens, the app asks to sign in and offers the demo homes', async ({ page }) => {
  await page.goto(HA);
  await expect(page.locator('.login h1')).toHaveText('Pulse');
  await expect(page.locator('.login [data-login="oauth"]')).toHaveText('Sign in with Home Assistant');
  await expect(page.locator('.login input[name="url"]')).toHaveValue(/^http/);
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The six homes of demo.home-assistant.io, the frontend's default first.
  await expect(page.locator('.login select[name="home"] option')).toHaveCount(6);
  await expect(page.locator('.login select[name="home"]')).toHaveValue('home');
  await expect(page.locator('[data-home-description]')).toContainText('two floors');
  // The token path needs both fields.
  await page.locator('.login summary').click();
  await page.locator('[data-login="token"]').click();
  await expect(page.locator('.login input[name="token"]')).toBeFocused();
});

test('a demo home opens from the sign-in panel and its entities answer the ring', async ({ page }) => {
  await page.goto(HA);
  await page.locator('.login select[name="home"]').selectOption('sections');
  await page.locator('[data-login="demo"]').click();
  await expect(page).toHaveURL(/\?demo=sections$/);
  await expect(page.locator('.login')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Home Assistant demo · Home Demo · live');
  await expect(page.locator('.conn [data-action="signout"]')).toHaveText('Leave the demo');
  // That home fills every system: its motion sensors make Security, its updates Maintenance.
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('Up to date');
  await expect(page.locator('.board h1')).not.toHaveText(/Connecting/);

  // A light segment toggles through the demo entity, confirmed a moment later like a real round trip.
  await page.locator('.tile[data-system="lights"]').click();
  await expect(current(page).locator('.system')).toBeVisible();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-big')).toHaveText('4 of 8');
  const seg = front.locator('o-arc[data-seg="0"]');
  await expect(seg).toHaveAttribute('aria-label', 'Bar lamp');
  const was = await seg.getAttribute('aria-checked');
  await seg.dispatchEvent('click');
  await expect(current(page).locator('.layer-front o-arc[data-seg="0"]')).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(was === 'true' ? '3 of 8' : '5 of 8');
});

test('the index previews every demo home with the rings it fills, and opens one', async ({ page }) => {
  await page.goto(`${HA}/gallery.html`);
  await expect(page.locator('.home-card-live')).toContainText('Your Home Assistant');
  const cards = page.locator('[data-homes] .home-card');
  await expect(cards).toHaveCount(6);
  await expect(cards.first()).toContainText('Home page');
  await expect(cards.first().locator('.tile')).toHaveCount(6);
  await expect(cards.first().locator('.tile[data-system="climate"] .tile-big')).toHaveText('21.5°C');
  await expect(cards.nth(1).locator('.tile')).toHaveCount(7);
  await expect(cards.first()).toContainText(/\d+ entities · 6 systems/);
  // No timers left running from the previews: the page stays quiet.
  await cards.nth(1).click();
  await expect(page).toHaveURL(/\?demo=sections$/);
  await expect(page.locator('.conn')).toContainText('Home Demo · live');
});

test('a shared link opens a demo home directly and leaving it returns to the sign-in', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await expect(page.locator('.conn')).toContainText('Home Assistant demo · Home page · live');
  // No updates or vacuums in that home: no Maintenance.
  await expect(page.locator('.tile[data-system]')).toHaveCount(6);
  await expect(page.locator('.tile[data-system="maintenance"]')).toHaveCount(0);
  await page.locator('.conn [data-action="signout"]').click();
  await expect(page.locator('.login h1')).toHaveText('Pulse');
  await expect(page).toHaveURL(/5174\/$/);
});

// The card (card/pulse-card.ts) on its bench, card.html: a `hass` object built
// from a demo home, the object inside the card's shadow root.
const card = (page: Page) => page.locator('pulse-card');

test('the card renders a demo home inside its shadow root and toggles a light through hass.callService', async ({ page }) => {
  await page.goto(`${HA}/card.html?home=sections`);
  const c = card(page);
  await expect(c.locator('.tile[data-system]')).toHaveCount(7);
  await expect(c.locator('.board h1')).toHaveText('All calm.');
  // Orbit's rings draw inside the shadow root: the registered properties reach it.
  await expect(c.locator('.tile[data-system="lights"] o-arc').first()).toBeVisible();
  await c.locator('.tile[data-system="lights"]').click();
  const front = c.locator('.z-view.is-current-view .layer-front');
  await expect(front.locator('.face-big')).toHaveText('4 of 8');
  const seg = front.locator('o-arc[data-seg="0"]');
  const was = await seg.getAttribute('aria-checked');
  await seg.dispatchEvent('click');
  await expect(c.locator('.z-view.is-current-view .layer-front .face-big')).toHaveText(was === 'true' ? '3 of 8' : '5 of 8');
});

test('the card takes its options: which systems, the board view, and the system to open inside', async ({ page }) => {
  const config = encodeURIComponent(JSON.stringify({ systems: ['lights', 'climate', 'security'], mode: 'layers' }));
  await page.goto(`${HA}/card.html?home=home&config=${config}`);
  const c = card(page);
  await expect(c.locator('.board')).toHaveClass(/mode-layers/);
  await expect(c.locator('.board .modes [aria-pressed="true"]')).toHaveText('Layers');
  await expect(c.locator('.board .layer[data-depth]')).toHaveCount(3);

  const start = encodeURIComponent(JSON.stringify({ systems: ['climate'], start: 'climate' }));
  await page.goto(`${HA}/card.html?home=sections&size=section&config=${start}`);
  await expect(card(page).locator('.z-view.is-current-view .system')).toBeVisible();
  await expect(card(page).locator('.z-view.is-current-view .layer-front .face-big')).toHaveText('21.7°C');
  // The board is one step back, with the one system.
  await expect(card(page).locator('.z-view.is-previous-view .tile[data-system]')).toHaveCount(1);
  await expect(card(page).locator('.gear')).toHaveCount(1);

  const locked = encodeURIComponent(JSON.stringify({ settings: false }));
  await page.goto(`${HA}/card.html?home=sections&config=${locked}`);
  await expect(card(page).locator('.tile[data-system]')).toHaveCount(7);
  await expect(card(page).locator('.gear')).toHaveCount(0);
});

test('the gear lets the viewer choose what this screen shows, kept in the browser', async ({ page }) => {
  await page.goto(`${HA}?demo=sections`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  const gear = page.locator('.gear');
  await expect(gear).toHaveAttribute('aria-expanded', 'false');
  await gear.click();
  const panel = page.locator('.settings');
  await expect(panel).toBeVisible();
  await expect(panel.locator('input[name="systems"]')).toHaveCount(7);
  await expect(panel.locator('input[name="systems"]').first()).toBeFocused();
  await panel.locator('input[name="systems"][value="media"]').uncheck();
  await expect(page.locator('.tile[data-system]')).toHaveCount(6);
  await panel.locator('input[name="mode"][value="layers"]').check();
  await expect(page.locator('.board')).toHaveClass(/mode-layers/);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(gear).toBeFocused();
  // Remembered by this browser.
  await page.reload();
  await expect(page.locator('.board')).toHaveClass(/mode-layers/);
  await expect(page.locator('.board .layer[data-depth]')).toHaveCount(6);
  await gear.click();
  await panel.locator('[data-settings-reset]').click();
  await expect(page.locator('.board')).toHaveClass(/mode-grid/);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
});

test('the URL fixes what the page shows and the gear chooses within it', async ({ page }) => {
  await page.goto(`${HA}?demo=sections&systems=lights,climate,security&mode=orbit`);
  await expect(page.locator('.board')).toHaveClass(/mode-orbit/);
  await expect(page.locator('.otile[data-system]')).toHaveCount(3);
  await page.locator('.gear').click();
  await expect(page.locator('.settings input[name="systems"]')).toHaveCount(3);
  await expect(page.locator('.settings select[name="start"] option')).toHaveCount(4);
});
