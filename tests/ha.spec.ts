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
  await expect(cards.first().locator('.tile')).toHaveCount(7);
  await expect(cards.first().locator('.tile[data-system="climate"] .tile-big')).toHaveText('21.5°C');
  await expect(cards.nth(1).locator('.tile')).toHaveCount(7);
  await expect(cards.first()).toContainText(/\d+ entities · 7 systems/);
  // No timers left running from the previews: the page stays quiet.
  await cards.nth(1).click();
  await expect(page).toHaveURL(/\?demo=sections$/);
  await expect(page.locator('.conn')).toContainText('Home Demo · live');
});

test('a shared link opens a demo home directly and leaving it returns to the sign-in', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await expect(page.locator('.conn')).toContainText('Home Assistant demo · Home page · live');
  // No updates or vacuums in that home, but two battery sensors, one at 15%:
  // Maintenance shows the low one.
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('15%');
  // The alert says where: the sensor's area from the registry.
  await page.locator('.tile[data-system="maintenance"]').click();
  await expect(page.locator('.layer-front .face-label')).toContainText('bedroom');
  await page.locator('.z-nav-back').click();
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
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
  // Three layers at most; the other three systems are named under the object, each a button.
  await expect(page.locator('.board .layer[data-depth]')).toHaveCount(3);
  await expect(page.locator('.board-strip .more')).toHaveCount(3);
  await gear.click();
  await panel.locator('[data-settings-reset]').click();
  await expect(page.locator('.board')).toHaveClass(/mode-grid/);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
});

test('the gear goes one level down: areas by floor, the channels of each system, the entity a dial follows', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  await page.locator('.gear').click();
  const panel = page.locator('.settings');
  // The home's six areas, grouped by its two floors (the garden has none).
  await expect(panel.locator('input[name="groups"]')).toHaveCount(6);
  await expect(panel.locator('.settings-groups-list .settings-group-title')).toHaveText(['Ground floor', 'Upstairs', 'No floor']);
  // Without the bedroom, its 15% battery is out: the other one is the lowest.
  await panel.locator('input[name="groups"][value="bedroom"]').uncheck();
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('88% lowest');
  await panel.locator('input[name="groups"][value="bedroom"]').check();
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('15%');
  // The only channel with something cannot be hidden; another one can.
  await panel.locator('input[name="channel"][value="maintenance/batteries"]').click();
  await expect(panel.locator('input[name="channel"][value="maintenance/batteries"]')).toBeChecked();
  await panel.locator('input[name="channel"][value="lights/plugs"]').uncheck();
  // The brightness dial follows another light.
  const select = panel.locator('select[name="pick"][data-key="lights/brightness"]');
  await expect(select).toHaveValue('light.bedroom_ceiling');
  await select.selectOption('light.bedside_lamp');
  await expect(panel.locator('input[name="channel"][value="lights/brightness"] + *, label:has(input[value="lights/brightness"])').first()).toContainText('Bedside lamp brightness');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="lights"]').click();
  const view = page.locator('.z-view.is-current-view');
  await expect(view.locator('.layer[data-ch]')).toHaveCount(2);
  await expect(view.locator('.layer[data-ch="brightness"]')).toContainText('Bedside lamp brightness');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pulse-ha-settings')!))).toEqual({
    channels: { lights: ['plugs'] }, picks: { 'lights/brightness': 'light.bedside_lamp' } });
});

test('the card takes areas: only what is in them, and the gear offers no areas when one is left', async ({ page }) => {
  await page.goto(`${HA}/card.html?home=home&config=${encodeURIComponent(JSON.stringify({ areas: ['kitchen'] }))}`);
  const c = card(page);
  await expect(c.locator('.tile[data-system]')).toHaveCount(4);
  await expect(c.locator('.tile[data-system="lights"] .tile-big')).toHaveText(/of 2/);
  await c.locator('.gear').click();
  await expect(c.locator('.settings-groups')).toBeHidden();
});

test('the URL fixes what the page shows and the gear chooses within it', async ({ page }) => {
  await page.goto(`${HA}?demo=sections&systems=lights,climate,security&mode=orbit`);
  await expect(page.locator('.board')).toHaveClass(/mode-orbit/);
  await expect(page.locator('.otile[data-system]')).toHaveCount(3);
  await page.locator('.gear').click();
  await expect(page.locator('.settings input[name="systems"]')).toHaveCount(3);
  await expect(page.locator('.settings select[name="start"] option')).toHaveCount(4);
});

// ─── The primitives beyond the dial and the switches ───

const bring = async (page: Page, key: string) => {
  const view = current(page);
  if (await view.locator(`.layer-front[data-ch="${key}"]`).count()) return;
  await view.locator(`[data-pick="${key}"]`).first().dispatchEvent('click');
  // (the layer itself is a zero-width gravity-spot: its disc is what shows)
  await expect(view.locator(`.layer-front[data-ch="${key}"] .disc`)).toBeVisible();
  await expect(view.locator('.stage')).not.toHaveClass(/is-locked/);
};

test('a camera fills the face of its layer, and the detail shows it round or square', async ({ page }) => {
  await page.goto(`${HA}?demo=arsaboo`);
  await page.locator('.tile[data-system="security"]').click();
  await bring(page, 'cameras');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.disc.has-image .face-image')).toHaveAttribute('src', /camera\.backyard\.jpg\?t=\d+/);
  await expect(front.locator('.face-big')).toHaveText('Live');
  await expect(front.locator('.face-label')).toHaveText('4 cameras');
  await front.locator('.disc').click();
  const figure = current(page).locator('.detail-image');
  await expect(figure.locator('img')).toHaveAttribute('alt', 'Backyard');
  await expect(figure).not.toHaveClass(/is-square/);
  await figure.locator('[data-shape]').click();
  await expect(figure).toHaveClass(/is-square/);
  await expect(figure.locator('[data-shape]')).toHaveText('Show round');
  // The demo cannot stream: no live button.
  await expect(figure.locator('[data-live]')).toHaveCount(0);
});

test('a choice on the ring: the thermostat mode is a radio group, and tapping an option sets it', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="climate"]').click();
  await bring(page, 'mode');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Thermostat mode');
  await expect(front.locator('.face-big')).toHaveText('Heat');
  const radios = front.locator('o-arc[role="radio"]');
  await expect(radios).toHaveCount(3);
  await expect(front.locator('o-arc[role="radio"][aria-checked="true"]')).toHaveAttribute('aria-label', 'Heat');
  // The names run along the inside of the ring; the chosen one is lit.
  expect(await front.locator('.choice-label').evaluateAll((l) => l.map((x) => x.getAttribute('data-label')))).toEqual(['Auto', 'Heat', 'Off']);
  await expect(front.locator('.choice-label.is-on')).toHaveAttribute('data-label', 'Heat');
  await front.locator('o-arc[role="radio"][aria-label="Auto"]').dispatchEvent('click');
  await expect(front.locator('.face-big')).toHaveText('Auto');
  await expect(front.locator('o-arc[role="radio"][aria-checked="true"]')).toHaveAttribute('aria-label', 'Auto');
  // In the detail the options are radios too.
  await front.locator('.disc').click();
  await expect(current(page).locator('.switches.choice input[type="radio"]')).toHaveCount(3);
  await expect(current(page).locator('.switches.choice input:checked + *, .switches.choice label:has(input:checked)').first()).toContainText('Auto');
});

test('a thermostat with a range has two knobs, and one end never crosses the other', async ({ page }) => {
  await page.goto(`${HA}?demo=arsaboo`);
  await page.locator('.tile[data-system="climate"]').click();
  await bring(page, 'ecobee');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-label')).toHaveText('between 20° and 24°');
  const lo = front.locator('.knob[data-handle="lo"]'), hi = front.locator('.knob[data-handle="hi"]');
  await expect(lo).toHaveAttribute('aria-valuetext', '20°');
  await expect(hi).toHaveAttribute('aria-valuetext', '24°');
  await hi.focus();
  await page.keyboard.press('ArrowRight');
  await expect(front.locator('.face-label')).toHaveText('between 20° and 25°');
  // The low end cannot go past the high one.
  await lo.focus();
  await page.keyboard.press('End');
  await expect(front.locator('.face-label')).toHaveText('between 25° and 25°');
  // The command went out and the demo took it.
  await expect(front.locator('.face-label')).toHaveText('between 25° and 25°');
  await front.locator('.disc').click();
  await expect(current(page).locator('.ranges input[type="range"]')).toHaveCount(2);
  await expect(current(page).locator('.ranges input[data-handle="lo"]')).toHaveValue('25');
});

test("a numeric channel's detail draws its last 24 hours as a ring", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="climate"]').click();
  await bring(page, 'humidity');
  await current(page).locator('.layer-front .disc').click();
  const ring = current(page).locator('.time-ring');
  // Sectors from a baseline, the current hour at the top; the center says now and the day's range.
  await expect(ring).toHaveAttribute('aria-label', /^last 24 hours: 5\d–6\d%$/);
  // Two sectors an hour, the half hours interpolated; the current one is the last, at the top.
  await expect(ring.locator('.time-bar')).toHaveCount(47);
  await expect(ring.locator('.time-bar.is-now')).toHaveAttribute('title', /^now: 52%/);
  await expect(ring.locator('.time-bar[title]')).toHaveCount(24);
  await expect(ring.locator('.time-big')).toHaveText('52%');
  await expect(ring.locator('.time-range')).toHaveText(/^5\d–6\d%$/);
  // Bare by default; the gear can add the hour marks.
  await expect(ring.locator('.time-tick')).toHaveCount(0);
});

test("a switched channel's detail draws a day per entity as rings, outside in, and a tap on a ring toggles it", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="lights"]').click();
  await current(page).locator('.layer-front .disc').click();
  const rings = current(page).locator('.timeline');
  await expect(rings).toHaveAttribute('aria-label', 'The last 24 hours of Lights');
  // The home has nine lights: eight rings (the outermost is the first light), each on its own orbit.
  await expect(rings.locator('.track')).toHaveCount(8);
  await expect(rings.locator('.track').first()).toHaveClass(/orbit-12/);
  await expect(rings.locator('.track').last()).toHaveClass(/orbit-5/);
  const spans = await rings.locator('.track-span').count();
  expect(spans).toBeGreaterThan(0);
  // What is now sits in the center; the header's big number moved there.
  await expect(rings.locator('.time-big')).toHaveText('4 of 9');
  await expect(current(page).locator('.detail-big')).toHaveCount(0);
  await expect(current(page).locator('.rings-order')).toHaveText('The rings, outside in (the first 8):');
  // The rings that are on now reach the top; three of the eight (the ninth light is on too).
  await expect(rings.locator('.track.is-on')).toHaveCount(3);
  // A tap on a ring (its faint track or a span) toggles that light.
  const first = rings.locator('.track.is-on').first();
  const entity = await first.locator('.track-back').getAttribute('data-track');
  await first.locator('.track-back').evaluate((e) => (e as HTMLElement).click());
  await expect(rings.locator('.track.is-on')).toHaveCount(2);
  await expect(rings.locator('.time-big')).toHaveText('3 of 9');
  await expect(current(page).locator(`.switches input[data-seg]`).nth(await rings.locator('.track').evaluateAll((l, id) => l.findIndex((x) => x.querySelector('[data-track]')?.getAttribute('data-track') === id), entity))).not.toBeChecked();
});

test("the heating's detail puts the windows under the thermostat's ring and names the open ones at their hour", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="climate"]').click();
  await current(page).locator('.layer-front .disc').click();
  const rings = current(page).locator('.timeline');
  // The thermostat, then the two windows in the alert's color.
  await expect(rings.locator('.track')).toHaveCount(3);
  await expect(rings.locator('.track.warn')).toHaveCount(2);
  await expect(rings.locator('.time-big')).toHaveText('21.5°C');
  // Both windows opened when the demo loaded: one word for both, at "now".
  await expect(rings.locator('.time-event')).toHaveCount(1);
  await expect(rings.locator('.time-event')).toHaveText(/open, .* open$/);
  // The dial stays under the rings.
  await expect(current(page).locator('.slider input[type="range"]')).toHaveCount(1);
});

test('the gear can open the dial at the bottom and put hour marks on the day ring', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.gear').click();
  await page.locator('.settings input[name="dial"][value="open"]').check();
  await page.locator('.settings input[name="day"][value="marks"]').check();
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="climate"]').click();
  const front = current(page).locator('.layer-front');
  // The thermostat's band runs from 225° through the top to 135°, its ends named, a mark at the measurement.
  await expect(front.locator('.orbit-12').first()).toHaveAttribute('style', /--o-from: ?225deg; --o-range: ?270deg/);
  await expect(front.locator('.dial-end')).toHaveText(['7°', '35°']);
  await expect(front.locator('.now-mark')).toHaveCount(1);
  // The keyboard still moves the target by its step (down: up would heat with the windows open and raise the alert).
  const dial = front.locator('[data-dial]');
  await expect(dial).toHaveAttribute('aria-valuenow', '21');
  await dial.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dial).toHaveAttribute('aria-valuenow', '20');
  // The day ring, in a detail, carries its marks.
  await bring(page, 'humidity');
  await current(page).locator('.layer-front .disc').click();
  const ring = current(page).locator('.time-ring.has-marks');
  await expect(ring.locator('.time-tick')).toHaveCount(24);
  await expect(ring.locator('.time-hour')).toHaveCount(3);
});

test('a color light takes its hue and saturation from a wheel in the detail', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.gear').click();
  await page.locator('select[name="pick"][data-key="lights/brightness"]').selectOption('light.living_room_floor_lamp');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="lights"]').click();
  await bring(page, 'brightness');
  await current(page).locator('.layer-front .disc').click();
  const wheel = current(page).locator('.color-wheel');
  // White light: no hue yet.
  await expect(wheel).toHaveClass(/is-unset/);
  await wheel.focus();
  await page.keyboard.press('ArrowRight');
  await expect(wheel).toHaveAttribute('aria-valuetext', 'hue 5°, saturation 100%');
  await expect(wheel).not.toHaveClass(/is-unset/);
  // After the pause the light gets the color, and the reading keeps it.
  await page.waitForTimeout(900);
  await page.keyboard.press('Tab');
  await expect(current(page).locator('.color-wheel')).toHaveAttribute('aria-valuetext', 'hue 5°, saturation 100%');
  await expect(current(page).locator('.color-wheel')).not.toHaveClass(/is-unset/);
  // Back on the ring, the dial takes the light's color.
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.layer-front .dial')).toHaveAttribute('style', /--o-fill:\s*(hsl\(5 100% 50%\)|rgb\(255,\s*21,\s*0\))/);
});
