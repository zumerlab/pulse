// Development: the screens of the site and of the README that are not the
// tutorial's (those are scripts/tutorial-shots.mjs), taken with Playwright into
// docs/images/ as WebP through scripts/webp.mjs:
//   board-*, system-*, detail-*, gear   the Home Assistant demo homes of ../pulse-home
//   openhab-*                           the openHAB demo house of ../pulse-home, as recorded
//   el-*                                each sample of the component gallery (demo/elements.html),
//                                       cropped to its box
// 2400×1600 (1200×800 at 2×) like the rest of the site's; the elements at the
// size of their box, at 2×. Starts the two dev servers unless they answer
// already (this repo's on 5173, pulse-home's on 5174). The sizes of the el-*
// pictures follow what they hold: the script prints each one, and
// docs/elements.html carries them in its width and height.
// node scripts/site-shots.mjs [only…]     e.g. node scripts/site-shots.mjs board system-alert el-
/* global localStorage */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeWebp } from './webp.mjs';

const out = 'docs/images';
const only = process.argv.slice(2);
const wanted = (name) => !only.length || only.some((o) => name.startsWith(o));
const CORE = 'http://127.0.0.1:5173', HOME = 'http://127.0.0.1:5174';
const VIEW = { width: 1200, height: 800 };
const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const answers = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
const servers = [];
const serve = async (url, cwd, port) => {
  if (await answers(url)) return;
  if (!existsSync(cwd)) throw new Error(`${cwd} is not there: its screens need that checkout beside this one`);
  servers.push(spawn('npx', ['vite', '--port', String(port)], { cwd, stdio: 'ignore' }));
  for (let i = 0; i < 80 && !(await answers(url)); i++) await new Promise((r) => setTimeout(r, 500));
};

const browser = await chromium.launch();
const encoder = await browser.newPage();  // where webp.mjs encodes the shots

// One screen of a product: the viewer's saved choices, the address, what to do on the page, the shot.
const screen = async (name, url, store, settings = {}, act = async () => {}) => {
  if (!wanted(name)) return;
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await context.addInitScript(([key, value]) => { localStorage.setItem(key, JSON.stringify(value)); }, [store, settings]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.locator('.board [data-system]').first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(900);
  const current = () => page.locator('.z-view.is-current-view');
  const t = {
    page, current,
    wait: (ms) => page.waitForTimeout(ms),
    // Into a system from the board; Zumly's zoom takes 0.8 s.
    enter: async (id) => { await current().locator(`[data-system="${id}"]`).first().click(); await current().locator('.layer-front .disc').waitFor(); await page.waitForTimeout(1300); },
    // A channel to the front, from the index beside the object or from the strip under it.
    front: async (key) => { await current().locator(`.layer-index [data-pick="${key}"], .strip [data-pick="${key}"]`).first().click(); await page.waitForTimeout(1300); },
    detail: async () => { await current().locator('.layer-front .disc').click(); await page.locator('.z-view.is-current-view .detail').waitFor(); await page.waitForTimeout(1800); },
  };
  await act(t);
  // The pointer out of the way: nothing hovered, nothing tilted by it.
  await page.mouse.move(VIEW.width - 2, 2);
  await page.waitForTimeout(500);
  console.log(await writeWebp(encoder, await page.screenshot({ type: 'png' }), `${out}/${name}`));
  if (errors.length) console.log(`${name}: page errors: ${errors.join(' · ')}`);
  await context.close();
};

// ─── Home Assistant: the demo homes ───
const HA = 'pulse-ha-settings', shown = { look: { modes: 'shown' } };
if (['board', 'system', 'detail', 'gear', 'openhab'].some((p) => wanted(p) || only.some((o) => o.startsWith(p)))) await serve(`${HOME}/`, here('../../pulse-home'), 5174);
await screen('board-grid', `${HOME}/?demo=home&mode=grid`, HA, shown);
await screen('board-orbit', `${HOME}/?demo=home&mode=orbit`, HA);
await screen('board-layers', `${HOME}/?demo=home&mode=layers`, HA, shown);
await screen('board-list', `${HOME}/?demo=home&mode=list`, HA, shown);
await screen('board-rooms', `${HOME}/?demo=home&mode=orbit&axis=rooms`, HA);
await screen('system-lights', `${HOME}/?demo=home&mode=orbit`, HA, {}, async (t) => { await t.enter('lights'); await t.front('brightness'); });
await screen('system-climate', `${HOME}/?demo=home&mode=orbit`, HA, {}, async (t) => { await t.enter('climate'); });
await screen('system-alert', `${HOME}/?demo=home&mode=orbit`, HA, {}, async (t) => { await t.enter('maintenance'); });
await screen('system-scenes', `${HOME}/?demo=teachingbirds&mode=orbit`, HA, {}, async (t) => { await t.enter('scenes'); });
await screen('detail-humidity', `${HOME}/?demo=home&mode=orbit`, HA, {}, async (t) => { await t.enter('climate'); await t.front('humidity'); await t.detail(); });
await screen('gear', `${HOME}/?demo=home&mode=orbit`, HA, {}, async (t) => {
  await t.page.locator('.gear').click(); await t.wait(400);
  await t.page.locator('.settings [data-tab="look"]').click(); await t.wait(500);
});

// ─── openHAB: the demo house as recorded ───
const OH = 'pulse-openhab-settings';
await screen('openhab-orbit', `${HOME}/openhab/?demo&mode=orbit`, OH);
await screen('openhab-alert', `${HOME}/openhab/?demo&mode=orbit`, OH, {}, async (t) => { await t.enter('climate'); });
await screen('openhab-rooms', `${HOME}/openhab/?demo&mode=orbit&axis=groups`, OH);

// ─── The elements: each sample of the gallery, cropped to its box ───
if (wanted('el-') || only.some((o) => o.startsWith('el-'))) {
  await serve(`${CORE}/elements.html`, here('..'), 5173);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${CORE}/elements.html`);
  await page.locator('[data-shot="themes"] .disc').first().waitFor();
  await page.waitForTimeout(2500);   // the map's tiles, the globe
  for (const name of await page.locator('[data-shot]').evaluateAll((els) => els.map((el) => el.dataset.shot))) {
    if (!wanted(`el-${name}`)) continue;
    const box = page.locator(`[data-shot="${name}"] .sample-box`);
    await box.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    console.log(await writeWebp(encoder, await box.screenshot({ type: 'png' }), `${out}/el-${name}`));
  }
  await context.close();
}

await browser.close();
for (const s of servers) s.kill();
