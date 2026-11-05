import { expect, test, type Page } from '@playwright/test';
import { FLEET } from '../playwright.config.ts';

// The fleet app without its broker: the panel when nothing answers, and the
// recorded trams (eighty-four on eleven lines, ten late, three crowded, two
// blind) as the fleet by dimension and as one object per vehicle. The feed
// itself is not part of the suite.

const current = (page: Page) => page.locator('.z-view.is-current-view');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('pulse-fleet-settings')) localStorage.setItem('pulse-fleet-settings', '{"calm":"open"}'); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_CONNECTION|Failed to load resource|WebSocket connection/.test(m.text())) errors.push(m.text()); });
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

test('with no broker answering, the app says so and offers the demo', async ({ page }) => {
  // A route does not see WebSockets: the broker's is closed as it opens.
  await page.routeWebSocket(/^wss?:\/\/(?!127\.0\.0\.1)/, (ws) => ws.close());
  await page.goto(FLEET);
  await expect(page.locator('.connect h1')).toHaveText('Pulse');
  await expect(page.locator('.connect .error')).toContainText('The broker did not answer', { timeout: 15_000 });
  await expect(page.locator('.zumly-canvas')).toBeHidden();
  await page.locator('[data-demo]').click();
  await expect(page).toHaveURL(/demo=1/);
  await expect(page.locator('.connect')).toBeHidden();
  await expect(page.locator('.conn')).toContainText('Demo · 84 trams, recorded · live');
});

test('the recorded fleet fills four systems; the late trams are the painted ticks of a swarm ring', async ({ page }) => {
  await page.goto(`${FLEET}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(4);
  await expect(page.locator('.board h1')).toContainText('4 things calling');
  await expect(page.locator('.tile[data-system="service"] .tile-big')).toHaveText('10 late');
  await expect(page.locator('.tile[data-system="load"] .tile-big')).toHaveText('3 crowded');
  await expect(page.locator('.tile[data-system="fleet"] .tile-big')).toHaveText('2 blind');
  // The fleet on the map of Helsinki: a tile window at a city's zoom, a dot per tram.
  await page.locator('.tile[data-system="fleet"]').click();
  await current(page).locator('[data-pick="map"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('On the map');
  await expect(current(page).locator('.layer-front .face-map')).toHaveAttribute('data-zoom', '10');
  await expect(current(page).locator('.layer-front .face-map .radar-dot')).toHaveCount(84);
  await page.locator('.z-nav-back').click();
  await expect(page.locator('.tile[data-system="lines"] .tile-big')).toHaveText('7 lines late');
  // The tile's mini ring is a swarm too: one SVG, eighty-four ticks.
  await expect(page.locator('.tile[data-system="service"] .swarm-ring')).toHaveAttribute('data-count', '84');
  await page.locator('.tile[data-system="service"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('On time');
  await expect(front.locator('.swarm-ring')).toHaveAttribute('aria-label', 'On time: 74 of 84 on, 10 failing');
  await expect(front.locator('.swarm-tick.is-fail')).toHaveCount(10);
  await expect(front.locator('.swarm-tick.is-calling')).toHaveCount(10);
  await expect(current(page).locator('.strip')).toContainText('10 of 84 trams more than 3 minutes late: Tram 9 · 1060 10:12');
  // The detail lists the members, the latest first, each late one with the dot of the alert.
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail h1')).toContainText('On time');
  const first = current(page).locator('.scroll-item').first();
  await expect(first.locator('.sl-text')).toHaveText('Tram 9 · 1060');
  await expect(first.locator('.sl-detail')).toHaveText('to Länsiterminaali · +10:12');
  await expect(current(page).locator('.scroll-item.level-2 .sl-mark')).toHaveCount(10);
});

test('on the groups axis each tram is an object: its timetable in front when late, its heading as a bearing', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-fleet-settings', '{"calm":"open","axis":"groups","groups":["40/1012","40/1013","40/1014"]}'); });
  await page.goto(`${FLEET}?demo`);
  await expect(page.locator('.tile[data-system]')).toHaveCount(3);
  await expect(page.locator('.tile[data-system="veh:40/1012"] .tile-title')).toHaveText('Tram 2 → Olympiaterminaali');
  await expect(page.locator('.tile[data-system="veh:40/1012"] .tile-big')).toHaveText('+4:08');
  // The gear groups the vehicles by line.
  await page.locator('.gear').click();
  await expect(page.locator('.settings')).toContainText('Line 2');
  await expect(page.locator('.settings')).toContainText('1012 → Olympiaterminaali');
  await page.keyboard.press('Escape');
  await page.locator('.tile[data-system="veh:40/1012"]').click();
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Timetable');
  await expect(current(page).locator('.strip')).toContainText('Tram 2 · 1012 to Olympiaterminaali is 4:08 behind schedule');
  // Its motion: the speed as the band, the heading as the bearing.
  await current(page).locator('[data-pick="fleet/motion"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Motion');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText(/^\d+ km\/h$/);
  await expect(current(page).locator('.layer-front .bearing-orbit')).toHaveAttribute('aria-label', /^bearing \d+°$/);
});

test('past twelve trams the groups axis climbs to the lines: each line an object with the fleet read within it, each tram one tap further', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-fleet-settings', '{"calm":"open","axis":"groups"}'); });
  await page.goto(`${FLEET}?demo`);
  // Eighty-four trams would be eighty-four objects: the board names the eleven lines instead.
  await expect(page.locator('.tile[data-system]')).toHaveCount(11);
  const line9 = page.locator('.tile[data-system="crowd:Line 9"]');
  await expect(line9.locator('.tile-title')).toHaveText('Line 9');
  await expect(line9.locator('.tile-big')).toHaveText('2 late');
  // A line is the fleet's channels read within it: its eight trams, the two late ones calling.
  await line9.click();
  await expect(current(page)).toHaveAttribute('data-title', 'Line 9');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('On time');
  await expect(front.locator('o-arc[data-seg]')).toHaveCount(8);
  await expect(current(page).locator('.strip')).toContainText('2 of 8 trams more than 3 minutes late: Tram 9 · 1060 10:12');
  // Each tram one tap further: from its row in the detail, its own object.
  await front.locator('.disc').click();
  await current(page).locator('.scroll-item', { hasText: 'Tram 9 · 1060' }).click();
  await expect(current(page)).toHaveAttribute('data-title', 'Tram 9 → Länsiterminaali');
  await expect(current(page).locator('.layer-front .face-name')).toHaveText('Timetable');
});

// The live feed, played by a broker of our own: an MQTT handshake, then two
// trams' positions. Commons answers from what it would say: the Artic 405 has
// a photo of its own, the X54 609 none, so it shows its model's.
const mqtt = (type: number, body: number[]) => { const len: number[] = []; let n = body.length; do { let d = n % 128; n = Math.floor(n / 128); if (n) d |= 0x80; len.push(d); } while (n); return Buffer.from([type, ...len, ...body]); };
const publish = (topic: string, json: unknown) => { const tp = [...Buffer.from(topic)]; return mqtt(0x30, [tp.length >> 8, tp.length & 0xff, ...tp, ...Buffer.from(JSON.stringify(json))]); };
const tram = (veh: number, desi: string, to: string) => publish(`/hfp/v2/journey/ongoing/vp/tram/0040/${String(veh).padStart(5, '0')}/10${desi.padStart(2, '0')}/1/${to}/12:00/1020447/4/60;24/19/73/88`,
  { VP: { desi, dir: '1', oper: 40, veh, tst: new Date().toISOString(), spd: 5.2, hdg: 90, lat: 60.1699, long: 24.9384, dl: -20, drst: 0, occu: 0, loc: 'GPS', stop: null, route: `10${desi.padStart(2, '0')}` } });
const file = (title: string, author: string, license: string, own: boolean) => ({ title, categories: [{ title: 'Category:Trams in Helsinki' }],
  imageinfo: [{ thumburl: `https://upload.wikimedia.org/test/${own ? 'own' : 'model'}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/${title.replace(/ /g, '_')}`, width: 4000, height: 3000,
    extmetadata: { Artist: { value: `<a href="//commons.wikimedia.org/wiki/User:${author}">${author}</a>` }, LicenseShortName: { value: license } } }] });

test('live: a tram shows a photo of itself from Commons, or of its model, always with its credit', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pulse-fleet-settings', '{"calm":"open","axis":"groups"}'); });
  await page.routeWebSocket(/mqtt\.hsl\.fi/, (ws) => ws.onMessage((m) => {
    const b = typeof m === 'string' ? Buffer.from(m) : m;
    if (b[0] === 0x10) ws.send(mqtt(0x20, [0, 0]));
    if (b[0] === 0x82) { ws.send(mqtt(0x90, [b[2], b[3], 0])); ws.send(tram(405, '2', 'Olympiaterminaali')); ws.send(tram(609, '15', 'Keilaniemi')); }
  }));
  const asked: string[] = [];
  await page.route('https://commons.wikimedia.org/w/api.php?**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    asked.push(q.get('gsrsearch') ?? q.get('titles') ?? '');
    const pages = q.get('gsrsearch')?.includes('"405"') ? [file('File:HKL HST Artic 405, Mannerheimintie, 2019 (01).jpg', 'Bahnfrend', 'CC BY-SA 4.0', true), file('File:Potsdam Tram 405.jpg', 'Someone', 'CC BY 2.0', true)]
      : q.get('titles') ? [file(q.get('titles')!, 'Taavi Väänänen', 'CC BY-SA 4.0', false)] : [];
    return route.fulfill({ json: { query: { pages } }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://upload.wikimedia.org/**', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }));
  await page.goto(FLEET);
  await expect(page.locator('.tile[data-system]')).toHaveCount(2);
  // The X54 609 has none of its own: its model's, said so.
  await page.locator('.tile[data-system="veh:40/609"]').click();
  await current(page).locator('[data-pick="fleet/vehicle"]').first().dispatchEvent('click');
  await expect(current(page).locator('.layer-front .face-big')).toHaveText('Artic X54 609');
  await expect(current(page).locator('.layer-front .face-label')).toHaveText('another Artic X54 · © Taavi Väänänen, CC BY-SA 4.0');
  await expect(current(page).locator('.layer-front .face-image')).toHaveAttribute('src', 'https://upload.wikimedia.org/test/model.jpg');
  await page.locator('.z-nav-back').click();
  // The Artic 405: its own photo, the one in its model's category with its number (not Potsdam's), and who took it.
  await page.locator('.tile[data-system="veh:40/405"]').click();
  await current(page).locator('[data-pick="fleet/vehicle"]').first().dispatchEvent('click');
  const front = current(page).locator('.layer-front');
  await expect(front.locator('.face-name')).toHaveText('Vehicle');
  await expect(front.locator('.face-big')).toHaveText('Artic 405');
  await expect(front.locator('.face-label')).toHaveText('© Bahnfrend, CC BY-SA 4.0');
  await expect(front.locator('.face-image')).toHaveAttribute('src', 'https://upload.wikimedia.org/test/own.jpg');
  // The detail: the photo big, and the way to its page on Commons.
  await front.locator('.disc').click();
  await expect(current(page).locator('.detail-image img')).toHaveAttribute('src', 'https://upload.wikimedia.org/test/own.jpg');
  await expect(current(page).locator('.detail [data-link]')).toContainText('See the photo on Commons');
  // One question per tram, and the model's photo once.
  expect(asked.sort()).toEqual(['File:Helsinki light rail line 15 train arriving at Itäkeskus.jpg', 'incategory:"Škoda Artic X54" intitle:"609"', 'incategory:"Škoda Artic in Helsinki" intitle:"405"']);
});
