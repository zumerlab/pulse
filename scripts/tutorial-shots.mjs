// Development: the screens of the tutorial (docs/tutorial.html), taken with
// Playwright from the greenhouse in demo/greenhouse/, into docs/images/ as
// tutorial-*.jpg, 2400×1600 like the rest of the site's, as JPEG: the ground is a gradient, which a PNG makes heavy. Starts the dev server
// on PULSE_PORT (5173) unless one answers already. Each screen sets the
// viewer's choices in localStorage before the page loads (what the gear would
// keep: which systems, which channels, which view) and nudges the greenhouse
// through `window.greenhouse`, so the code the tutorial shows stays as it is.
// node scripts/tutorial-shots.mjs [out-dir]
/* global window, localStorage */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/images';
const PORT = process.env.PULSE_PORT ?? '5173';
const PAGE = `http://127.0.0.1:${PORT}/greenhouse/`;
const VIEW = { width: 1200, height: 800 };
const STORE = 'pulse-greenhouse-settings';
mkdirSync(out, { recursive: true });

const answers = async () => { try { return (await fetch(PAGE)).ok; } catch { return false; } };
let server;
if (!(await answers())) {
  server = spawn('npx', ['vite', '--port', PORT], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await answers()); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();

// One screen: the board's choices, then what to do on the page, then the shot.
const shot = async (name, settings, act = async () => {}) => {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await context.addInitScript(([key, value]) => { localStorage.setItem(key, JSON.stringify(value)); }, [STORE, settings]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.locator('.board [data-system]').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const t = {
    page,
    wait: (ms) => page.waitForTimeout(ms),
    current: () => page.locator('.z-view.is-current-view'),
    // Into a system from its tile; Zumly's zoom takes 0.8 s.
    enter: async (id) => { await page.locator(`.tile[data-system="${id}"]`).click(); await page.locator('.z-view.is-current-view .layer-front .disc').waitFor(); await page.waitForTimeout(1100); },
    // A nudge to the greenhouse: the board sees it as a change.
    set: (id, state) => page.evaluate(([id, state]) => window.greenhouse.set(id, state), [id, state]),
    // The layers in 3D, as a viewer who pressed the toggle.
    threeD: async () => { await page.locator('.z-view.is-current-view [data-act="view"]').click(); await page.waitForTimeout(900); },
  };
  await act(t);
  await page.screenshot({ path: `${out}/tutorial-${name}.jpg`, type: 'jpeg', quality: 90 });
  if (errors.length) console.log(`${name}: page errors: ${errors.join(' · ')}`);
  console.log(`tutorial-${name}.jpg`);
  await context.close();
};

// 1. The first system, one channel: the board with one object, then the object.
const one = { systems: ['climate'], channels: { climate: ['humidity', 'vents'] }, mode: 'grid' };
await shot('one-board', one);
await shot('one-object', one, async (t) => { await t.enter('climate'); });
// 2. Three channels: layers, front to back.
await shot('layers', { systems: ['climate'], mode: 'grid' }, async (t) => { await t.enter('climate'); await t.threeD(); });
// 3. An alert: the tank low, its action under the object.
await shot('alert', { systems: ['climate', 'water'], mode: 'grid' }, async (t) => { await t.set('tank.level', 9); await t.wait(400); await t.enter('water'); await t.wait(600); });
// 4. A choice: the watering time, names along the ring.
await shot('choice', { systems: ['climate', 'water'], mode: 'grid' }, async (t) => {
  await t.enter('water');
  await t.current().locator('.layer-index [data-pick="when"]').click();
  await t.wait(1200);
});
// 5. The detail: a day of the air as a ring.
await shot('detail', { systems: ['climate'], mode: 'grid' }, async (t) => {
  await t.enter('climate');
  await t.current().locator('.layer-front .disc').click();
  await t.page.locator('.z-view.is-current-view .detail .history').waitFor();
  await t.wait(1500);
});
// 6. The board: the three systems, calm, in the grid; then in the orbit with the tank calling.
await shot('board-grid', { mode: 'grid' });
await shot('board-orbit', { mode: 'orbit' }, async (t) => { await t.set('tank.level', 9); await t.wait(1500); });
// 7. The gear: the look is the viewer's.
await shot('gear', { mode: 'orbit' }, async (t) => {
  await t.page.locator('.gear').click();
  await t.wait(400);
  await t.page.locator('.settings [data-tab="look"]').click();
  await t.wait(500);
});

await browser.close();
server?.kill();
