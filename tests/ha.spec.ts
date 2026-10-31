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
  // Three layers by default (the rest are named under the object, each a button); the gear can stack all six.
  await expect(page.locator('.board .layer[data-depth]')).toHaveCount(3);
  await expect(page.locator('.board-strip .more')).toHaveCount(3);
  await gear.click();
  await panel.locator('select[name="layers"]').selectOption('6');
  await expect(page.locator('.board .layer[data-depth]')).toHaveCount(6);
  await expect(page.locator('.board-strip .more')).toHaveCount(0);
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
  await expect(panel.locator('input[name="areas"]')).toHaveCount(6);
  await expect(panel.locator('.settings-areas-list .settings-group-title')).toHaveText(['Ground floor', 'Upstairs', 'No floor']);
  // Without the bedroom, its 15% battery is out: the other one is the lowest.
  await panel.locator('input[name="areas"][value="bedroom"]').uncheck();
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('88% lowest');
  await panel.locator('input[name="areas"][value="bedroom"]').check();
  await expect(page.locator('.tile[data-system="maintenance"] .tile-big')).toHaveText('15%');
  // The only channel with something cannot be hidden; another one can.
  await panel.locator('input[name="channel"][value="maintenance/batteries"]').click();
  await expect(panel.locator('input[name="channel"][value="maintenance/batteries"]')).toBeChecked();
  await panel.locator('input[name="channel"][value="lights/plugs"]').uncheck();
  // The brightness dial follows another light.
  const select = panel.locator('select[name="entity"][data-key="lights/brightness"]');
  await expect(select).toHaveValue('light.bedroom_ceiling');
  await select.selectOption('light.bedside_lamp');
  await expect(panel.locator('input[name="channel"][value="lights/brightness"] + *, label:has(input[value="lights/brightness"])').first()).toContainText('Bedside lamp brightness');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="lights"]').click();
  const view = page.locator('.z-view.is-current-view');
  await expect(view.locator('.layer[data-ch]')).toHaveCount(2);
  await expect(view.locator('.layer[data-ch="brightness"]')).toContainText('Bedside lamp brightness');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pulse-ha-settings')!))).toEqual({
    channels: { lights: ['plugs'] }, entities: { 'lights/brightness': 'light.bedside_lamp' } });
});

test('the card takes areas: only what is in them, and the gear offers no areas when one is left', async ({ page }) => {
  await page.goto(`${HA}/card.html?home=home&config=${encodeURIComponent(JSON.stringify({ areas: ['kitchen'] }))}`);
  const c = card(page);
  await expect(c.locator('.tile[data-system]')).toHaveCount(4);
  await expect(c.locator('.tile[data-system="lights"] .tile-big')).toHaveText(/of 2/);
  await c.locator('.gear').click();
  await expect(c.locator('.settings-areas')).toBeHidden();
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

test('a camera fills the face of its layer, and the face of its detail', async ({ page }) => {
  await page.goto(`${HA}?demo=arsaboo`);
  await page.locator('.tile[data-system="security"]').click();
  await bring(page, 'cameras');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.disc.has-image .face-image')).toHaveAttribute('src', /camera\.backyard\.jpg\?t=\d+/);
  await expect(front.locator('.face-big')).toHaveText('Live');
  await expect(front.locator('.face-label')).toHaveText('4 cameras');
  await front.locator('.disc').click();
  // The same disc, closer: the camera is the face of the detail's object, the channel's ring around it.
  const face = current(page).locator('.detail-obj .detail-face.has-image');
  await expect(face.locator('img')).toHaveAttribute('alt', 'Backyard');
  await expect(face.locator('.face-big')).toHaveText('Live');
  await expect(current(page).locator('.crumb')).toHaveText(/Security.*Backyard/);
  // The demo cannot stream: no live button.
  await expect(current(page).locator('[data-live]')).toHaveCount(0);
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
  await expect(current(page).locator('.chips.choice [role="radio"]')).toHaveCount(3);
  await expect(current(page).locator('.chips.choice [role="radio"][aria-checked="true"]')).toContainText('Auto');
  // And on the detail's own ring, the choice with its names.
  await expect(current(page).locator('.detail-ring o-arc[role="radio"]')).toHaveCount(3);
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
  // The detail draws the same band, big, with its two knobs and the range in the center.
  await front.locator('.disc').click();
  const ring = current(page).locator('.detail-ring');
  await expect(ring.locator('.knob[data-handle]')).toHaveCount(2);
  await expect(ring.locator('.knob[data-handle="lo"]')).toHaveAttribute('aria-valuetext', '25°');
  await expect(ring.locator('.ring-big')).toHaveText('25–25°');
  await expect(current(page).locator('.detail-big')).toHaveCount(0);
});

test("a numeric channel's detail draws its last 24 hours as a ring", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="climate"]').click();
  await bring(page, 'humidity');
  await current(page).locator('.layer-front .disc').click();
  const ring = current(page).locator('.time-ring');
  // Sectors from a baseline, the current hour at the top; the face in the center says now and the day's range.
  await expect(ring).toHaveAttribute('aria-label', /^last 24 hours: 5\d–6\d%$/);
  // Two sectors an hour, the half hours interpolated; the current one is the last, at the top.
  await expect(ring.locator('.time-bar')).toHaveCount(47);
  await expect(ring.locator('.time-bar.is-now')).toHaveAttribute('title', /^now: 52%/);
  await expect(ring.locator('.time-bar[title]')).toHaveCount(24);
  await expect(ring.locator('.detail-face .face-big')).toHaveText('52%');
  await expect(ring.locator('.detail-face .face-label')).toHaveText(/^5\d–6\d% · last 24 hours$/);
  // Bare by default; the gear can add the hour marks.
  await expect(ring.locator('.time-tick')).toHaveCount(0);
});

test("a switched channel's detail draws a day per entity as rings, outside in, named on themselves with the hours around, and a tap on a ring toggles it", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="lights"]').click();
  await current(page).locator('.layer-front .disc').click();
  const rings = current(page).locator('.timeline');
  await expect(rings).toHaveAttribute('aria-label', 'The last 24 hours of Lights');
  // The home has nine lights: eight rings (the outermost is the first light), each on its own orbit.
  await expect(rings.locator('.track')).toHaveCount(8);
  await expect(rings.locator('.track').first()).toHaveClass(/orbit-12/);
  await expect(rings.locator('.track').last()).toHaveClass(/orbit-5/);
  // Each ring says which light it is, and the hours go around.
  await expect(rings.locator('.track-name')).toHaveCount(8);
  await expect(rings.locator('.track-name').first()).toContainText('Ceiling light');
  await expect(rings.locator('.time-tick')).toHaveCount(24);
  await expect(rings.locator('.time-hour')).toHaveCount(3);
  const spans = await rings.locator('.track-span').count();
  expect(spans).toBeGreaterThan(0);
  // What is now sits in the center, as the face of the object; nothing is said twice above it.
  await expect(rings.locator('.detail-face .face-big')).toHaveText('4 of 9');
  await expect(current(page).locator('.detail-big')).toHaveCount(0);
  await expect(current(page).locator('.detail h1')).toHaveCount(0);
  // The names share one angle, a wedge after now, outside in.
  const froms = await rings.locator('.track-name-orbit').evaluateAll((l) => l.map((x) => (x as HTMLElement).style.getPropertyValue('--o-from')));
  expect(new Set(froms).size).toBe(1);
  // The rings that are on now reach the top; three of the eight (the ninth light is on too).
  await expect(rings.locator('.track.is-on')).toHaveCount(3);
  // A tap on a ring (its faint track or a span) toggles that light.
  const first = rings.locator('.track.is-on').first();
  const entity = await first.locator('.track-back').getAttribute('data-track');
  await first.locator('.track-back').evaluate((e) => (e as HTMLElement).click());
  await expect(rings.locator('.track.is-on')).toHaveCount(2);
  await expect(rings.locator('.detail-face .face-big')).toHaveText('3 of 9');
  // The chips under the object say so too, and they switch as well.
  const chips = current(page).locator('.chips [data-seg]');
  await expect(chips).toHaveCount(9);
  await expect(chips.nth(await rings.locator('.track').evaluateAll((l, id) => l.findIndex((x) => x.querySelector('[data-track]')?.getAttribute('data-track') === id), entity))).toHaveAttribute('aria-checked', 'false');
  await chips.first().click();
  await expect(chips.first()).toHaveAttribute('aria-checked', (await chips.first().getAttribute('aria-checked')) === 'true' ? 'false' : 'true');
});

test("the heating's detail puts the windows under the thermostat's ring and names the open ones at their hour", async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="climate"]').click();
  await current(page).locator('.layer-front .disc').click();
  const rings = current(page).locator('.timeline');
  // The thermostat, then the two windows in the alert's color.
  await expect(rings.locator('.track')).toHaveCount(3);
  await expect(rings.locator('.track.warn')).toHaveCount(2);
  // The two open windows are dots at their hour (the demo gives each a random
  // one); the most recent is named, the other only on hover (two words would overlap).
  await expect(rings.locator('.time-event-dot.warn')).toHaveCount(await rings.locator('.time-event-dot').count());
  expect(await rings.locator('.time-event-dot').count()).toBeLessThanOrEqual(2);
  await expect(rings.locator('.time-event')).toHaveCount(1);
  await expect(rings.locator('.time-event').first()).toHaveText(/open( \+1)?$/);
  // The dial sits in the center of the rings: the band itself, its knob saying the target, the measurement marked.
  const dial = current(page).locator('.timeline .detail-ring');
  await expect(dial.locator('.knob .knob-text')).toHaveText('21°');
  await expect(dial.locator('.now-text')).toHaveText('now · 21.5°');
  await expect(dial.locator('o-progress[data-dial="heating"]')).toHaveCount(1);
  await expect(dial.locator('.ring-big')).toHaveText('21°');
  await expect(dial.locator('.ring-label')).toHaveText('target');
  // The keyboard moves it there too, and the command goes out after a pause.
  await dial.locator('[data-dial="heating"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dial.locator('.ring-big')).toHaveText('20°');
  await expect(dial.locator('.knob .knob-text')).toHaveText('20°');
  await expect(dial.locator('o-progress[data-dial="heating"]')).toHaveAttribute('aria-valuenow', '20');
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

test('a color light takes its hue and saturation from two curved sliders inside its brightness dial', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.gear').click();
  await page.locator('select[name="entity"][data-key="lights/brightness"]').selectOption('light.living_room_floor_lamp');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="lights"]').click();
  await bring(page, 'brightness');
  await current(page).locator('.layer-front .disc').click();
  const ring = current(page).locator('.detail-ring');
  // The brightness dial, the hue around inside it, the saturation inside that: three sliders, one object.
  await expect(ring.locator('o-progress[data-dial="brightness"]')).toHaveCount(1);
  await expect(ring.locator('.hue-ring o-arc')).toHaveCount(36);
  const hue = ring.locator('.ring-grab[data-dial="brightness:hue"]'), sat = ring.locator('.ring-grab[data-dial="brightness:sat"]');
  await expect(hue).toHaveAttribute('aria-label', 'Hue of Floor lamp brightness');
  // White light: no hue yet.
  await expect(ring.locator('.hue-ring')).toHaveClass(/is-unset/);
  await hue.focus();
  await page.keyboard.press('ArrowRight');
  await expect(hue).toHaveAttribute('aria-valuenow', '5');
  await expect(sat).toHaveAttribute('aria-valuenow', '100');
  await expect(ring.locator('.hue-ring')).not.toHaveClass(/is-unset/);
  await expect(ring.locator('.ring-center')).toHaveClass(/has-color/);
  // After the pause the light gets the color, and the reading keeps it.
  await page.waitForTimeout(900);
  await page.keyboard.press('Tab');
  await expect(current(page).locator('.ring-grab[data-dial="brightness:hue"]')).toHaveAttribute('aria-valuenow', '5');
  await expect(current(page).locator('.hue-ring')).not.toHaveClass(/is-unset/);
  // Back on the ring, the dial takes the light's color.
  await page.locator('.z-nav-back').click();
  await expect(current(page).locator('.layer-front .dial')).toHaveAttribute('style', /--o-fill:\s*(hsl\(5 100% 50%\)|rgb\(255,\s*21,\s*0\))/);
});

test('the hue and the saturation rings are dragged with the pointer, like the brightness dial around them', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.gear').click();
  await page.locator('select[name="entity"][data-key="lights/brightness"]').selectOption('light.living_room_floor_lamp');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="lights"]').click();
  await bring(page, 'brightness');
  await current(page).locator('.layer-front .disc').click();
  const ring = current(page).locator('.detail-ring');
  await expect(ring.locator('.ring-grab[data-dial="brightness:sat"]')).toBeVisible();
  const box = (await ring.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width / 2;
  // A point on the ring at orbit n (of 12), at `a` radians clockwise from the top.
  const at = (n: number, a: number): [number, number] => [cx + R * n / 12 * Math.sin(a), cy - R * n / 12 * Math.cos(a)];
  const drag = async (n: number) => {
    const [x0, y0] = at(n, 1), [x1, y1] = at(n, 2.4);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
    await page.mouse.up();
  };
  // The hue ring (orbit 10): from white, a drag to ~137° gives that hue.
  await drag(10);
  const hue = ring.locator('.ring-grab[data-dial="brightness:hue"]');
  await expect(hue).toHaveAttribute('aria-valuenow', /^13\d$/);
  await expect(ring.locator('.hue-ring')).not.toHaveClass(/is-unset/);
  // The saturation ring (orbit 8): the same drag leaves it near 38 %.
  await drag(8);
  await expect(ring.locator('.ring-grab[data-dial="brightness:sat"]')).toHaveAttribute('aria-valuenow', /^3\d$/);
  // The drags were drags: the detail is still open, no zoom in or out happened.
  await page.waitForTimeout(600);
  await expect(ring).toBeVisible();
});

test('the wheel over a view never moves the navigation: no zoom out, no scrub of the views behind', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.tile[data-system="security"]').click();
  await current(page).locator('.layer-front .disc').click();
  const detail = current(page).locator('.detail');
  await expect(detail).toBeVisible();
  await page.waitForTimeout(1000);                  // the zoom in has ended: Zumly listens again
  const box = (await detail.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  // Small ticks like a trackpad's on an empty spot of the view: Zumly's wheel
  // scrub (gestures.follow) would animate the view toward the blurred board behind.
  const moved = () => page.locator('.z-view.is-current-view').evaluate((v) => v.getAnimations().length > 0 || getComputedStyle(v).transform !== 'matrix(1, 0, 0, 1, 0, 0)');
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 12);
    expect(await moved(), `scrub after tick ${i}`).toBe(false);
  }
  // A long tick would be a zoom out outright.
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(900);
  await expect(current(page).locator('.detail')).toHaveCount(1);
  expect(await moved()).toBe(false);
});

test('the list puts the systems on a ring that turns: arrows bring the next to the top, and the center opens it', async ({ page }) => {
  await page.goto(`${HA}?demo=home&mode=list`);
  const list = page.locator('.radial-list');
  await expect(list).toHaveAttribute('role', 'listbox');
  await expect(list.locator('[role="option"]')).toHaveCount(7);
  await expect(list.locator('[role="option"][aria-selected="true"]')).toHaveAttribute('aria-label', 'Lights');
  await expect(list.locator('.list-center .face-name')).toHaveText('Lights');
  await list.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list.locator('[role="option"][aria-selected="true"]')).toHaveAttribute('aria-label', 'Climate');
  await expect(list.locator('.list-center .face-name')).toHaveText('Climate');
  // The last one comes before the first: the ring has no ends.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(list.locator('.list-center .face-name')).toHaveText('Maintenance');
  await page.keyboard.press('Enter');
  await expect(current(page).locator('.system')).toBeVisible();
  await expect(current(page).locator('.sys-title')).toHaveText('Maintenance');
});

test('Media carries its sound visual in its tile and in its face while something plays', async ({ page }) => {
  await page.goto(`${HA}?demo=home&mode=grid`);
  await expect(page.locator('.tile[data-system="media"] canvas.face-visual')).toHaveCount(1);
  await page.locator('.tile[data-system="media"]').click();
  await expect(current(page).locator('.layer-front .disc canvas.face-visual')).toHaveCount(1);
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Playing');
});

test("the orbit's center carries the clock's rim: the hours, now, and the time in the pulse", async ({ page }) => {
  await page.goto(`${HA}?demo=home&mode=orbit`);
  const hub = page.locator('.hub-ring');
  await expect(hub.locator('.clock-tick')).toHaveCount(12);
  await expect(hub.locator('.clock-now')).toHaveCount(1);
  const now = new Date(), angle = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  const from = await hub.locator('.clock-now-orbit').evaluate((el) => parseFloat(el.style.getPropertyValue('--o-from')));
  expect(Math.abs(from - angle)).toBeLessThan(1.5);
  // The pulse slide names the time.
  await page.locator('.hub-dot.pulse').click();
  await expect(page.locator('.hub-slide .eyebrow')).toHaveText(/^Pulse · \d\d:\d\d$/);
});

test("a long choice scrolls in a circle: the sources along the ring, a curved scrollbar, the wheel and the keys move it, a tap picks", async ({ page }) => {
  await page.goto(`${HA}?demo=arsaboo&mode=grid`);
  await page.locator('.tile[data-system="media"]').click();
  await current(page).locator('o-arc[data-pick="source"]').first().dispatchEvent('click');
  await current(page).locator('.layer-front .disc').click();
  const list = current(page).locator('.scroll-list');
  await expect(list).toHaveAttribute('role', 'listbox');
  await expect(list.locator('[role="option"]')).toHaveCount(11);
  const thumb = list.locator('.scroll-thumb');
  await expect(thumb).toHaveAttribute('aria-valuemax', '4');
  await expect(thumb).toHaveAttribute('aria-valuenow', '0');
  // Seven fit; the rest wait past the end.
  await expect(list.locator('.scroll-orbit:not(.is-hidden)')).toHaveCount(7);
  const box = (await list.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.mouse.wheel(0, 160);
  await expect(thumb).toHaveAttribute('aria-valuenow', '4');
  // The wheel stays in the list: Zumly does not read it as a zoom out.
  await page.waitForTimeout(1200);
  await expect(current(page).locator('.detail')).toBeVisible();
  await list.focus();
  await page.keyboard.press('End');
  await expect(list.locator('.scroll-item.is-focus .sl-text')).toHaveText('Retro 70s and 80s');
  await page.keyboard.press('Enter');
  await expect(list.locator('.scroll-item.is-on .sl-text')).toHaveText('Retro 70s and 80s');
  await expect(current(page).locator('.scroll-list .detail-face .face-big')).toHaveText('Retro 70s and 80s');
});

test("the Power detail puts this month under the day: a sector per day of the energy meter, today in the center", async ({ page }) => {
  await page.goto(`${HA}?demo=home&mode=grid`);
  await page.locator('.tile[data-system="energy"]').click();
  await current(page).locator('.layer-front .disc').click();
  // One object at a time: the day first, the month behind its tab.
  await expect(current(page).locator('.time-ring')).toHaveCount(1);
  await current(page).locator('[data-tab="month"]').click();
  await expect(current(page).locator('.time-ring')).toHaveCount(0);
  const month = current(page).locator('.month-ring');
  const now = new Date(), days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  await expect(month.locator('.day')).toHaveCount(days);
  await expect(month.locator('.day.is-today')).toHaveText(String(now.getDate()));
  await expect(month.locator('.month-bar')).toHaveCount(now.getDate());
  await expect(month.locator('.time-big')).toHaveText(/kWh$/);
  await expect(month.locator('.time-range')).toHaveText(now.toLocaleDateString('en', { month: 'long', year: 'numeric' }));
});

// ─── Several alerts: satellites, the summary, Later and Mute; the styles ───

test('with three alerts the summary goes in front; one opens from it while the others wait as satellites; Later and Mute', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(7);
  // Three things at once in Security: the lock jams, the alarm goes off, a sensor turns into a wet one.
  await page.evaluate(() => {
    const demo = (window as unknown as { pulseHA: { demo: { entities: Map<string, { update(c: { state?: string; attributes?: Record<string, unknown> }): void }> } } }).pulseHA.demo;
    demo.entities.get('lock.front_door')!.update({ state: 'jammed' });
    demo.entities.get('alarm_control_panel.home_alarm')!.update({ state: 'triggered' });
    demo.entities.get('binary_sensor.kitchen_motion')!.update({ state: 'on', attributes: { device_class: 'moisture' } });
  });
  // A critical alert opens its system on its own.
  const view = current(page);
  await expect(view.locator('.system')).toBeVisible();
  await expect(view.locator('.sys-title')).toHaveText('Security');
  // Rule 4: "3 alerts" in front, one segment per alert, each a button to that alert.
  const summary = view.locator('.layer-front[data-ch="summary"]');
  await expect(summary.locator('.face-big')).toHaveText('3 alerts');
  await expect(summary.locator('o-arc[data-pick]')).toHaveCount(3);
  await expect(view.locator('.strip')).toContainText('3 alerts');
  // The disc opens the most serious one: it comes in front, the summary waits right behind, the other two orbit the ring (rule 3).
  await summary.locator('.disc').click();
  await expect(view.locator('.layer-front')).toHaveAttribute('data-ch', 'alarm');
  await expect(view.locator('.layer[data-ch="summary"]:not(.layer-front)')).toHaveCount(1);
  await expect(view.locator('.layer-front .alert-sat')).toHaveCount(2);
  await expect(view.locator('.layer-front .sat-btn').first()).toHaveAttribute('aria-label', /^Bring .* to the front$/);
  await expect(view.locator('.strip')).toContainText('The alarm went off');
  // Mute: the wave stops, the alert stays in front in its color.
  await view.locator('.strip [data-mute]').click();
  await expect(view.locator('.layer-front')).toHaveClass(/is-muted/);
  await expect(view.locator('.strip [data-mute]')).toHaveCount(0);
  // A satellite brings its alert to the front.
  await view.locator('.layer-front .sat-btn').first().click();
  await expect(view.locator('.stage')).not.toHaveClass(/is-locked/);
  await expect(view.locator('.layer-front')).toHaveAttribute('data-ch', 'locks');
  // Later: the lock goes behind and lets the next one through; two alerts left, no summary.
  await view.locator('.strip [data-seen]').click();
  await expect(view.locator('.layer[data-ch="summary"]')).toHaveCount(0);
  await expect(view.locator('.layer-front')).not.toHaveAttribute('data-ch', 'locks');
  await expect(view.locator('.layer-front .alert-sat')).toHaveCount(1);
});

test('the tiles draw the system as an icon: the front ring on the edge, the next channels inside', async ({ page }) => {
  await page.goto(`${HA}?demo=home&mode=grid`);
  const tile = page.locator('.tile[data-system="lights"] .mini-ring');
  await expect(tile.locator('.orbit-12')).toHaveCount(1);
  await expect(tile.locator('.orbit-10')).toHaveCount(1);
  await expect(tile.locator('.orbit-8')).toHaveCount(1);
});

test('the gear picks a style: tokens only, kept in the browser', async ({ page }) => {
  await page.goto(`${HA}?demo=home`);
  await page.locator('.gear').click();
  await page.locator('.settings input[name="theme"][value="ivory"]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ivory');
  await expect(page.locator('.settings input[name="theme"][value="ha"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ivory');
  await page.locator('.gear').click();
  await page.locator('[data-settings-reset]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});
