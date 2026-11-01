import Zumly, { type ViewContext } from 'zumly';
import type { Action, Alert, Changed, Channel, Dial, PulseHost, Reading, StateChange, Status, System } from './model.ts';
import { spansOf } from './history.ts';
import { tune } from './tune.ts';
import {
  DOT_LANES, LANE, LOCK_MS, MAX_TRACKS, MINI_LANES, PHONE, SIZE, STROKE, backLayer, calmStrip, colorWheel, dialControls, dots, esc, face,
  fitFor, icon, labelAt, levelColor, parallax, ring as drawRing, setViewToggle, startInside, systemShell, timeRing, timeline, viewToggle, wheelControls, zumlyOptions,
  type RingReading,
} from './radial.ts';
import { num, t as T, time } from './i18n.ts';

// The radial object over a PulseHost, mounted on an element: the board, one
// view per system and the channel detail, as Zumly views inside `canvas`.
// Readings, alerts and their resolution come from the host; what is shown is
// what it confirmed; until it does, the segment or the dial stays "sending".
// The board knows nothing about where the data comes from: a host hands it
// systems whose channels read into Readings, and runs the actions handed back.

export type BoardMode = 'grid' | 'orbit' | 'layers';
export const BOARD_MODES: BoardMode[] = ['grid', 'orbit', 'layers'];

// What a screen shows: the viewer's choices (the gear on the board), kept in
// the browser. The host's `BoardOptions` are the frame they are made within.
export type BoardSettings = {
  systems?: string[];
  mode?: BoardMode;
  start?: string;
  // Only the things in these groups (the host's ids); nothing set: everywhere.
  groups?: string[];
  // Channels each system does not show: { lights: ['plugs'] }.
  channels?: Record<string, string[]>;
  // The thing a channel follows instead of the first of its kind: { 'lights/brightness': 'light.kitchen' }.
  picks?: Record<string, string>;
  // How the object draws: the dial as a full ring or open at the bottom with its ends; the day ring bare or with hour marks.
  look?: Look;
};
export type Look = { dial?: 'full' | 'open'; day?: 'plain' | 'marks' };
export const DIALS = ['full', 'open'] as const, DAYS = ['plain', 'marks'] as const;

export type Strings = typeof T;

export type BoardOptions = {
  host: PulseHost;
  // Which systems the object may show (default: all of the host's); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Only what is in these groups; the gear chooses among them.
  groups?: string[];
  // How the object draws (the gear's defaults): see Look.
  look?: Look;
  // Where the viewer's choices are kept: a localStorage key (default
  // 'pulse-settings'); `false` hides the gear and keeps nothing.
  settings?: string | false;
  // The connection line of the board (HTML); the shell decides what it says.
  status?: () => string;
  // A button with `data-action` in that line was pressed.
  onAction?: (action: string) => void;
  onStatus?: (status: Status) => void;
  // The shell's words over the object's (what the host calls its things, its errors).
  strings?: Partial<Strings>;
};

export type BoardHandle = {
  app: Zumly;
  readonly host: PulseHost;
  // Another host with the same systems (a demo instead of the live one).
  setHost(host: PulseHost): void;
  settings(): BoardSettings;
  setSettings(patch: BoardSettings): void;
  repaint(): void;
  ready: Promise<unknown>;
  destroy(): void;
  ui: unknown;
  readings(): unknown;
};

export function mountBoard(canvas: HTMLElement, options: BoardOptions): BoardHandle {
const t: Strings = { ...T, ...options.strings };
// Focus lives in the document or in a shadow root (a card).
const activeElement = () => (canvas.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;

// In a small box (a card in a section of a dashboard, a narrow window) the
// board tightens: smaller headline, fewer lines of ticker, the object bigger.
const compact = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  canvas.classList.toggle('compact', width < 640 || height < 540);
});
compact.observe(canvas);

let host: PulseHost = options.host;
const systems: System[] = host.systems;
// The systems by id. Another host (setHost) brings its own channels, bound to
// its data, under the same ids.
let SYS = Object.fromEntries(systems.map((s) => [s.id, s]));
const ALL = systems.map((s) => s.id);
const valid = (ids?: string[]) => (ids ?? []).filter((id) => ALL.includes(id));

// The frame: what the shell (a card's config, the page's URL) allows. The
// viewer chooses within it with the gear; that choice is kept per browser.
const frame = {
  systems: valid(options.systems).length ? valid(options.systems) : ALL, mode: options.mode, start: options.start,
  groups: options.groups?.length ? options.groups : undefined,
  look: options.look,
};
const STORE = options.settings === false ? null : options.settings ?? 'pulse-settings';
const loadSettings = (): BoardSettings => {
  if (!STORE) return {};
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as BoardSettings;
  } catch { /* no storage: the frame as it comes */ }
  return {};
};
let local: BoardSettings = loadSettings();
let IDS: string[] = [];
let boardMode: BoardMode = 'grid';
const applySettings = () => {
  const chosen = valid(local.systems).filter((id) => frame.systems.includes(id));
  IDS = chosen.length ? chosen : frame.systems;
  boardMode = local.mode && BOARD_MODES.includes(local.mode) ? local.mode : frame.mode ?? 'grid';
};
applySettings();
const startId = () => { const id = local.start ?? frame.start; return id && IDS.includes(id) ? id : null; };
// The groups the gear offers: the host's, within the frame; and the ones in force.
const hostGroups = () => host.groups?.() ?? [];
const frameGroups = () => hostGroups().flatMap((g) => g.items.map((i) => i.id)).filter((a) => !frame.groups || frame.groups.includes(a));
const activeGroups = (): string[] | undefined => {
  const offered = frameGroups();
  const chosen = (local.groups ?? []).filter((a) => offered.includes(a));
  return chosen.length ? chosen : frame.groups;
};
const hiddenChannels = (id: string) => {
  const hidden = local.channels?.[id] ?? [];
  // At least one channel: a system with all of them hidden shows all of them.
  return SYS[id].channels.every((ch) => hidden.includes(ch.key)) ? [] : hidden;
};
// The look in force: the viewer's choice over the shell's.
const look = (): Required<Look> => ({ dial: 'full', day: 'plain', ...frame.look, ...local.look });
const settings = (): BoardSettings => ({ systems: IDS, mode: boardMode, start: startId() ?? undefined,
  groups: activeGroups(), channels: local.channels, picks: local.picks, look: look() });
const setSettings = (patch: BoardSettings) => {
  local = { ...local, ...patch };
  for (const k of Object.keys(local) as (keyof BoardSettings)[]) {
    const v = local[k];
    if (v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete local[k];
  }
  if (STORE) {
    try { if (Object.keys(local).length) localStorage.setItem(STORE, JSON.stringify(local)); else localStorage.removeItem(STORE); }
    catch { /* only to remember */ }
  }
  applySettings();
  repaint();
};

type Ui = {
  pick: string | null;                 // channel chosen by hand
  since: Map<string, number>;          // when each alert appeared (rule 1: stable)
  sig: Map<string, string>;            // what each alert says: if it changes, it is no longer seen
  seen: Set<string>;                   // alerts marked as seen (no wave, they go behind)
};
const ui: Record<string, Ui> = Object.fromEntries(ALL.map((id) => [id, { pick: null, since: new Map(), sig: new Map(), seen: new Set() }]));
let readings: Record<string, Map<string, { ch: Channel; r: Reading }>> = {};
// Every channel with something to show, hidden ones included: what the gear lists.
let channels: Record<string, { ch: Channel; r: Reading; hidden: boolean }[]> = {};
// Things with an unconfirmed action, and dial values the user is moving.
const pending = new Map<string, number>();
// Actions the host refused, by thing: what failed keeps a red outline and a
// Retry until a retry goes through or the thing changes anyway.
const failed = new Map<string, { acts: Action[]; message: string }>();
const hold = new Map<string, { value: number; until: number }>();
const log: { at: Date; text: string; level: number; id?: string }[] = [];
const rerender = new Set<() => void>();
let toast = '';

const PENDING_MS = 8000;
// Layered view of the board: the systems as layers, each a bit bigger
// (tune.layerGrow), and the labels of the layers behind spread out so they do
// not overlap.
const LABEL_AT = [300, 30, 330, 60, 280, 80];

const sig = (a: Alert) => `${a.level}|${a.big}|${a.why}`;

// ─── Reading ────────────────────────────────────────────────────────

function compute() {
  const now = Date.now(), fresh: { id: string; key: string; a: Alert }[] = [];
  readings = {};
  channels = {};
  const ctx = { groups: activeGroups() ?? null, picks: local.picks ?? {} };
  for (const sys of IDS.map((id) => SYS[id])) {
    const map = new Map<string, { ch: Channel; r: Reading }>(), u = ui[sys.id], hidden = hiddenChannels(sys.id);
    channels[sys.id] = [];
    for (const ch of sys.channels) {
      const r = ch.read(ctx);
      if (!r) continue;
      // A channel that follows a thing takes its name (the reading's `name`);
      // the gear lists every channel that has something, hidden or not.
      const named = r.name && r.name !== ch.name ? { ...ch, name: r.name } : ch;
      channels[sys.id].push({ ch: named, r, hidden: hidden.includes(ch.key) });
      if (hidden.includes(ch.key)) continue;
      if (r.dial && r.range) {
        // Each end of a range is held on its own (id#lo, id#hi).
        const lo = hold.get(`${r.dial.id}#lo`), hi = hold.get(`${r.dial.id}#hi`);
        if (lo && lo.until > now) r.range.lo = lo.value;
        if (hi && hi.until > now) r.range.hi = hi.value;
        r.dial.value = r.range.lo;
      } else if (r.dial) {
        const h = hold.get(r.dial.id);
        if (h && h.until > now) { r.dial.value = h.value; r.v = (h.value - r.dial.min) / (r.dial.max - r.dial.min); }
      }
      if (r.color) {
        const h = hold.get(`${r.color.id}#hs`);
        if (h && h.until > now) r.color.hs = [Math.floor(h.value / 1000), h.value % 1000];
      }
      map.set(ch.key, { ch: named, r });
      if (r.alert) {
        if (u.sig.get(ch.key) !== sig(r.alert)) {
          u.seen.delete(ch.key);
          u.sig.set(ch.key, sig(r.alert));
          if (!u.since.has(ch.key)) { u.since.set(ch.key, now); fresh.push({ id: sys.id, key: ch.key, a: r.alert }); }
        }
      } else { u.since.delete(ch.key); u.sig.delete(ch.key); u.seen.delete(ch.key); }
    }
    readings[sys.id] = map;
    // A new alert cancels the choice made by hand.
    if (fresh.some((f) => f.id === sys.id)) u.pick = null;
  }
  return fresh;
}

function order(id: string): string[] {
  const map = readings[id], u = ui[id];
  const keys = [...map.keys()];
  const alerts = keys.filter((k) => map.get(k)!.r.alert);
  // Rule 1: the one in front stays; only a more serious one displaces it. Seen ones go behind.
  alerts.sort((a, b) => Number(u.seen.has(a)) - Number(u.seen.has(b))
    || map.get(b)!.r.alert!.level - map.get(a)!.r.alert!.level
    || u.since.get(a)! - u.since.get(b)!);
  const rest = keys.filter((k) => !alerts.includes(k));
  const all = [...alerts.filter((k) => !u.seen.has(k)), ...rest, ...alerts.filter((k) => u.seen.has(k))];
  if (u.pick && all.includes(u.pick)) all.sort((a, b) => Number(b === u.pick) - Number(a === u.pick));
  return all;
}

const live = (id: string) => order(id).filter((k) => readings[id].get(k)!.r.alert && !ui[id].seen.has(k));
const worst = (id: string) => Math.max(0, ...live(id).map((k) => readings[id].get(k)!.r.alert!.level));
const isPending = (r: Reading) => r.ids.some((e) => pending.has(e));
const failuresOf = (r: Reading) => r.ids.filter((e) => failed.has(e)).map((e) => ({ id: e, ...failed.get(e)! }));
// The card under the object when something did not go through: what, and a Retry.
const retryCard = (r: Reading) => {
  const f = failuresOf(r);
  if (!f.length) return '';
  const names = f.map((x) => host.nameOf(x.id));
  return `<span class="errc"><span>${esc(t.didNotRespond(names))}</span>
    <button class="plain" data-retry="${esc(f.map((x) => x.id).join(' '))}">${t.retry}</button></span>`;
};
const retry = (ids: string) => {
  const acts = ids.split(' ').flatMap((e) => failed.get(e)?.acts ?? []);
  if (acts.length) void send(acts);
};

// ─── Actions to the host ────────────────────────────────────────────

async function send(acts: Action[]) {
  for (const a of acts) {
    a.ids.forEach((e) => pending.set(e, Date.now()));
    try {
      await host.act(a);
      a.ids.forEach((e) => failed.delete(e));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      a.ids.forEach((e) => { pending.delete(e); hold.delete(e); failed.set(e, { acts: [a], message }); });
      toast = t.hostError(message);
      setTimeout(() => { toast = ''; repaint(); }, 5000);
    }
  }
  repaint();
  // If the host changes nothing (say, an action with no effect), stop waiting.
  setTimeout(() => {
    let changed = false;
    for (const [e, at] of pending) if (Date.now() - at >= PENDING_MS) { pending.delete(e); changed = true; }
    if (changed) repaint();
  }, PENDING_MS + 50);
}

function repaint() {
  compute();
  rerender.forEach((fn) => fn());
}

// ─── Rings ──────────────────────────────────────────────────────────

// `call`: this ring's alert acts (in front and not muted): its failing segments ripple.
// What was sent and not confirmed is marked pending (it beats).
function ring(key: string, r: Reading, lanes: number, controls = false, muted = false, call = false, name?: string) {
  return drawRing(key, ringReading(r), lanes, {
    name, controls, muted, call, open: look().dial === 'open',
    pending: (id) => id === undefined ? isPending(r) : pending.has(id),
    failed: (id) => id === undefined ? r.ids.some((e) => failed.has(e)) : failed.has(id),
  });
}
// The host's reading is the ring's, except that a range and the measurement are given in the dial's units.
const frac = (d: Dial, v: number) => Math.min(1, Math.max(0, (v - d.min) / (d.max - d.min)));
function ringReading(r: Reading): RingReading {
  return { ...r, segs: r.segs?.map((s) => ({ label: s.label, on: s.on, act: s.act, id: s.id })),
    range: r.range && r.dial ? { lo: frac(r.dial, r.range.lo), hi: frac(r.dial, r.range.hi) } : undefined,
    now: r.now != null && r.dial ? frac(r.dial, r.now) : undefined };
}
// A reading's picture, resolved against the host. A live one is asked again
// every few seconds (the bucket in the URL): the browser does not cache it.
function imageOf(r: Reading) {
  if (!r.image) return undefined;
  const src = host.url(r.image.src);
  return { src: r.image.live ? `${src}${src.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 8192)}` : src, alt: r.image.alt, key: r.image.live ? r.image.id : undefined };
}

// ─── Board ──────────────────────────────────────────────────────────

function mini(id: string) {
  const sys = SYS[id], key = order(id)[0];
  if (!key) return '';
  const { ch, r } = readings[id].get(key)!;
  const level = worst(id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(key, r, MINI_LANES, false, !r.alert)}</span></span>
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !ui[id].seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

function headline() {
  if (host.status !== 'live') return t.connecting;
  const calling = IDS.flatMap((id) => live(id).map((k) => ({ id, k, a: readings[id].get(k)!.r.alert! })))
    .sort((a, b) => b.a.level - a.a.level);
  if (!calling.length) return t.allCalm;
  if (calling.length === 1) return `${calling[0].a.why}.`;
  return `${t.thingsCalling(calling.length, calling[0].a.why.toLowerCase())}.`;
}

// The connection line is the shell's (sign out, leave the demo); a card has none.
const status = () => options.status?.() ?? '';

// Three ways to look at the whole, over the same data:
// - grid: a mini ring per system (the usual one);
// - orbit: the pulse in the center and the systems around it;
// - layers: a single object, one system per layer; the one calling the most in front.
const MODES: [BoardMode, string][] = [['grid', t.modes.grid], ['orbit', t.modes.orbit], ['layers', t.modes.layers]];
let boardPick: string | null = null;

// Systems front to back: the choice made by hand, the ones calling (most serious
// first) and then the usual order. A new alert cancels the choice.
function boardOrder() {
  const base = IDS.filter((id) => order(id).length);
  const calling = base.filter((id) => worst(id)).sort((a, b) => worst(b) - worst(a));
  const all = [...calling, ...base.filter((id) => !calling.includes(id))];
  if (boardPick && all.includes(boardPick)) all.sort((a, b) => Number(b === boardPick) - Number(a === boardPick));
  return all;
}

// The reading that represents a system: its front channel.
function front(id: string) {
  const key = order(id)[0], { ch, r } = readings[id].get(key)!;
  const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
  return { key, ch, r, a, big: a ? a.big : r.big, label: a ? a.label : r.label };
}

// A system of the orbit: an Orbit satellite. Orbit places it; the ring fills the
// satellite and the text hangs outward with Orbit's `.outward-y` (above in the
// top half, below in the rest).
function orbitTile(id: string) {
  const f = front(id), level = worst(id);
  return `<div class="satellite"><div class="capsule">
    <button class="otile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${t.open(SYS[id].title)}">
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${ring(f.key, f.r, MINI_LANES, false, !f.r.alert)}</span></span>
        <span class="otile-glyph">${icon(f.ch.glyph, 24)}</span></span>
      <span class="otile-label outward-y"><span class="tile-title">${SYS[id].title}</span>
      <span class="tile-big">${esc(f.big)}</span></span>
    </button></div></div>`;
}

// Center of the orbit: one segment per system, facing its tile and painted if
// that system calls.
function hubRing(ids: string[]) {
  const segs = ids.map((id) => {
    const level = worst(id);
    return `<o-arc style="--o-fill:${level ? levelColor(level as 1 | 2) : 'var(--dim)'}"></o-arc>`;
  }).join('');
  // The systems are shifted half a step (none right at the top): each segment
  // faces its own without rotating the ring.
  return `<span class="bigbang hub-ring"><span class="gravity-spot">
    <div class="orbit-12" style="--o-size-ratio:.5; --o-gap:30">${segs}</div></span></span>`;
}

// Inside the center, one thing at a time: each alert (most serious first) and
// at the end the pulse. It advances on its own every 6 s, or with the dots.
type Slide = { key: string; level: number; html: string };
function hubSlides(): Slide[] {
  const alerts = IDS.flatMap((id) => live(id).map((k) => ({ id, ...readings[id].get(k)!, k })))
    .sort((a, b) => b.r.alert!.level - a.r.alert!.level);
  const list: Slide[] = alerts.map(({ id, k, ch, r }) => {
    const a = r.alert!;
    return { key: `${id}:${k}`, level: a.level, html: `<div class="slide level-${a.level}">
      <p class="eyebrow">${esc(`${SYS[id].title} · ${ch.name}`)}</p>
      <p class="slide-big">${esc(a.big)}</p>
      <p class="slide-why">${esc(a.why)}</p>
      <button class="plain slide-go" data-open="${id}">${t.openShort}</button></div>` };
  });
  // The three shown things that changed last, with their current value.
  const rows = [...watched()].map((e) => ({ id: e, at: host.changedAt?.(e) ?? 0 })).filter((x) => x.at > 0)
    .sort((a, b) => b.at - a.at).slice(0, 3)
    .map((x) => `<li><span>${esc(host.nameOf(x.id))}</span><strong>${esc(host.stateOf(x.id))}</strong></li>`);
  list.push({ key: 'pulse', level: 0, html: `<div class="slide">
    <p class="eyebrow">${t.pulse}</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? t.nAlerts(alerts.length) : t.allCalm.replace(/\.$/, '')}</p>
    <ul class="hub-rows">${rows.join('') || `<li><span>${t.waitingChanges}</span></li>`}</ul></div>` });
  return list;
}
let slideKey: string | null = null;
const SLIDE_MS = 6000;

// Replaces the content only if it changed: new o-arc take a moment to draw (and
// to receive taps), and a host sends changes every few seconds.
const drawn = new WeakMap<HTMLElement, string>();
function setHTML(el: HTMLElement, html: string) {
  if (drawn.get(el) === html) return;
  drawn.set(el, html);
  el.innerHTML = html;
}

function board(ctx: ViewContext) {
  const el = ctx.target;
  el.dataset.title = t.board;   // shown by Zumly's back button
  el.innerHTML = `<div class="board">
    <header class="board-head"><h1></h1><span class="conn-slot"></span>
      <nav class="modes" aria-label="${t.viewSelector}">${MODES.map(([m, label]) =>
        `<button class="mode" data-mode="${m}">${label}</button>`).join('')}</nav></header>
    <p class="error" hidden></p>
    <div class="board-body"></div>
    <ol class="ticker" aria-label="${t.latestChanges}"></ol>
  </div>` + (STORE ? settingsPanel() : '');
  const boardEl = el.querySelector<HTMLElement>('.board')!;
  const body = el.querySelector<HTMLElement>('.board-body')!;
  if (STORE) { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; }
  const gear = el.querySelector<HTMLElement>('.gear');
  const backdrop = el.querySelector<HTMLElement>('.settings-backdrop');
  const form = el.querySelector<HTMLFormElement>('.settings');
  let built: BoardMode | null = null;
  let layers = new Map<string, HTMLElement>();
  let beat = log[0];

  // Orbit and layers are sized by the space left (--S, in px). In the orbit,
  // Orbit places everything from its universe; --S only scales text and icons.
  const fit = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    const S = Math.max(240, Math.min(width, height));
    body.style.setProperty('--S', `${S}px`);
    // Layers: the systems grow up to 1.96× the 240 px disc, with 1.1× zoom.
    body.style.setProperty('--fit', String(Math.min(1, Math.min(width, height) / (240 * 1.96 * 1.1))));
  });
  fit.observe(body);
  ctx.onCleanup(() => fit.disconnect());

  // Parallax in the orbit and in layers (±7° by default, tune.tilt), as in each
  // system's object (not on the phone).
  const tilt = (rx: number, ry: number) => {
    const obj = body.querySelector<HTMLElement>('.stage .obj');
    if (!obj) return;
    obj.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    obj.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  };
  body.addEventListener('pointermove', (e) => {
    if (boardMode === 'grid' || PHONE || e.pointerType === 'touch') return;
    const b = body.getBoundingClientRect();
    tilt(-((e.clientY - b.top) / b.height - 0.5) * 2 * tune.tilt, ((e.clientX - b.left) / b.width - 0.5) * 2 * tune.tilt);
  });
  body.addEventListener('pointerleave', () => tilt(0, 0));

  const build = () => {
    built = boardMode;
    layers = new Map();
    boardEl.className = `board mode-${boardMode}`;
    drawn.delete(body);
    if (boardMode === 'orbit') {
      // The whole orbit is one Orbit system: the universe is the space left, the
      // pulse is the center satellite and the systems, satellites of orbit-10
      // (tune.orbit).
      // In 3D, like each system's object: the pulse in front and the systems one
      // step behind (Orbit layers); the pointer tilts the whole.
      body.innerHTML = `<div class="stage orbit-stage"><div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective">
        <div class="orbit-0 hub-orbit layer-front"><div class="satellite at-center"><div class="capsule">
          <div class="hub"><div class="hub-ring-slot"></div>
            <div class="hub-face" aria-live="polite"><div class="hub-slide"></div></div><nav class="hub-dots" aria-label="${t.alerts}"></nav></div>
        </div></div></div>
        <div class="orbit-${tune.orbit} orbit-tiles" data-depth="1"></div></div></div></div></div>`;
    } else if (boardMode === 'layers') {
      // In 3D, like the orbit: each layer one step further back and the pointer tilts the object.
      body.innerHTML = `<div class="stage board-stage" data-zoom="calm"><div class="obj"><div class="bigbang">
        <div class="gravity-spot depth outer-perspective" style="--o-depth-grow:${tune.layerGrow}"></div></div></div>
        <div class="strip board-strip"></div></div>`;
    } else body.innerHTML = '';
  };

  // Three layers at most (two on the phone), like a system's object; the
  // systems past them are named under it, each a button that brings it to the front.
  const paintLayers = (all: string[]) => {
    const depth = body.querySelector<HTMLElement>('.depth')!;
    const ids = all.slice(0, SIZE.length), rest = all.slice(SIZE.length);
    for (const [id, layer] of layers) if (!ids.includes(id)) { layer.remove(); layers.delete(id); }
    ids.forEach((id, i) => {
      let layer = layers.get(id);
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'gravity-spot layer';
        depth.append(layer);
        layers.set(id, layer);
      }
      const f = front(id), grow = 1 + tune.layerGrow * i, level = worst(id);
      // Orbit redraws the arcs on any attribute change, even to the same value:
      // only what changed is written.
      if (layer.dataset.depth !== String(i)) layer.dataset.depth = String(i);
      if (layer.dataset.level !== String(level)) layer.dataset.level = String(level);
      if (layer.classList.contains('layer-front') !== (i === 0)) layer.classList.toggle('layer-front', i === 0);
      if (layer.classList.contains('is-alert') !== level > 0) layer.classList.toggle('is-alert', level > 0);
      const stroke = i === 0 ? 6 : 2.5;
      setHTML(layer, ring(f.key, f.r, stroke / grow / LANE, false, !level) + (i === 0
        ? face({ glyph: f.ch.glyph, name: SYS[id].title, big: f.big, label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`,
          to: `sys-${id}`, props: { system: id }, aria: t.open(SYS[id].title) })
        : backLayer({ text: `${SYS[id].title} · ${f.big}`, at: LABEL_AT[(i - 1) % LABEL_AT.length], grow, stroke, hit: 8,
          pick: { attr: 'data-bpick', value: id, aria: t.bringToFront(SYS[id].title) } })));
    });
    const stage = body.querySelector<HTMLElement>('.board-stage')!;
    const zoom = ids.some((id) => worst(id)) ? 'alert' : 'calm';
    if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
    setHTML(stage.querySelector<HTMLElement>('.board-strip')!, rest.length ? `<span class="behind">${t.behind(rest.length)}: ${rest.map((id) =>
      `<button class="more" data-bpick="${id}" aria-label="${esc(t.bringToFront(SYS[id].title))}">${SYS[id].title}</button>`).join(', ')}</span>` : '');
  };

  const paint = () => {
    if (built !== boardMode) build();
    el.querySelector('h1')!.textContent = headline();
    // Only when it changed: the host repaints every few seconds and a button
    // recreated each time would lose taps.
    setHTML(el.querySelector<HTMLElement>('.conn-slot')!, status());
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === boardMode));
    if (form) syncSettings(form);
    const err = el.querySelector<HTMLElement>('.error')!;
    err.hidden = host.status !== 'error';
    err.textContent = host.error;
    const ready = host.status === 'live' || host.hasData;
    const ids = ready ? boardOrder() : [];
    if (boardMode === 'grid') setHTML(body, `<div class="tiles">${IDS.filter((id) => ids.includes(id)).map(mini).join('')}</div>`);
    else if (boardMode === 'orbit') {
      // The systems stay in their usual place: in the orbit what moves is the color, not the order.
      // Each part is replaced on its own: the carousel does not redraw the rings.
      const fixed = IDS.filter((id) => ids.includes(id));
      const hubEl = body.querySelector<HTMLElement>('.hub')!;
      if (hubEl.hidden !== !ready) hubEl.hidden = !ready;
      setHTML(body.querySelector<HTMLElement>('.hub-ring-slot')!, ready ? hubRing(fixed) : '');
      const tilesEl = body.querySelector<HTMLElement>('.orbit-tiles')!;
      // Half a step of offset: no system right at the top, and each one faces its
      // segment of the center ring.
      tilesEl.style.setProperty('--o-from', `${180 / Math.max(1, fixed.length)}deg`);
      setHTML(tilesEl, fixed.map(orbitTile).join(''));
      if (ready) paintSlide();
      if (log[0] !== beat) { hubEl.classList.remove('beat'); void hubEl.offsetWidth; hubEl.classList.add('beat'); }
    } else if (ready) paintLayers(ids);
    beat = log[0];
    // In the orbit the latest changes are already in the center.
    el.querySelector('.ticker')!.innerHTML = boardMode === 'orbit' ? '' : log.slice(0, PHONE ? 3 : 4).map((l) =>
      `<li class="${l.level ? `level-${l.level}` : ''}"><time>${time(l.at)}</time> ${esc(l.text)}</li>`).join('');
  };

  const paintSlide = () => {
    const list = hubSlides();
    const at = Math.max(0, list.findIndex((x) => x.key === slideKey));
    slideKey = list[at].key;
    setHTML(body.querySelector<HTMLElement>('.hub-slide')!, list[at].html);
    setHTML(body.querySelector<HTMLElement>('.hub-dots')!, list.length < 2 ? '' : list.map((x, i) =>
      `<button class="hub-dot${x.level ? ` level-${x.level}` : ' pulse'}" data-slide="${x.key}" aria-current="${i === at}"
        aria-label="${x.key === 'pulse' ? t.thePulse : t.alertNof(i + 1, list.length - 1)}"></button>`).join(''));
  };
  // Advances on its own, except with the pointer or the focus inside the center.
  let held = false;
  const advance = () => {
    if (boardMode !== 'orbit' || held || app.getCurrentViewName() !== 'board') return;
    const list = hubSlides();
    if (list.length < 2) return;
    slideKey = list[(list.findIndex((x) => x.key === slideKey) + 1) % list.length].key;
    paintSlide();
  };
  let timer = window.setInterval(advance, SLIDE_MS);
  ctx.onCleanup(() => clearInterval(timer));

  // The tuning panel (development only) changes the orbit or the layers: rebuild.
  const retune = () => { built = null; paint(); };
  window.addEventListener('pulse-tune', retune);
  ctx.onCleanup(() => window.removeEventListener('pulse-tune', retune));
  const holdOn = (on: boolean) => (e: Event) => { if ((e.target as HTMLElement).closest?.('.hub')) held = on; };
  el.addEventListener('pointerover', holdOn(true));
  el.addEventListener('pointerout', holdOn(false));
  el.addEventListener('focusin', holdOn(true));
  el.addEventListener('focusout', holdOn(false));

  let locked = false;
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const slide = target.closest<HTMLElement>('[data-slide]')?.dataset.slide;
    const open = target.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (slide) {
      slideKey = slide;
      clearInterval(timer);
      timer = window.setInterval(advance, SLIDE_MS);
      paintSlide();
      return;
    }
    if (open) {
      const tile = body.querySelector<HTMLElement>(`.otile[data-system="${open}"]`);
      if (tile) void app.zoomIn(tile);
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) { options.onAction?.(action); return; }
    const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode as BoardMode | undefined;
    const pick = target.closest<HTMLElement>('[data-bpick]')?.dataset.bpick;
    if (mode && mode !== boardMode) {
      setSettings({ mode });
    } else if (pick && !locked) {
      boardPick = pick;
      locked = true;
      setTimeout(() => { locked = false; }, LOCK_MS);
      paint();
    }
  });
  el.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && target.matches('o-arc[data-bpick]')) { e.preventDefault(); target.click(); }
  });

  // ─── The gear: what this screen shows ───
  if (gear && backdrop && form) {
    const focusables = () => [...form.querySelectorAll<HTMLElement>('input, select, button')].filter((f) => !f.hasAttribute('disabled') && f.offsetParent !== null);
    const open = () => {
      backdrop.hidden = false;
      gear.setAttribute('aria-expanded', 'true');
      form.querySelector<HTMLElement>('input')?.focus();
    };
    const close = () => {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      gear.setAttribute('aria-expanded', 'false');
      gear.focus();
    };
    gear.addEventListener('click', () => (backdrop.hidden ? open() : close()));
    backdrop.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === backdrop || target.closest('[data-settings-close]')) { close(); return; }
      if (target.closest('[data-settings-reset]')) { local = {}; setSettings({}); }
    });
    // Only the field that changed is kept: the others stay as the frame says.
    form.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement, field = target.name, data = new FormData(form);
      if (field === 'systems') {
        const chosen = data.getAll('systems').map(String);
        // At least one system: unchecking the last one does not stick.
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ systems: chosen.length === frame.systems.length ? undefined : chosen });
      } else if (field === 'groups') {
        const chosen = data.getAll('groups').map(String);
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ groups: chosen.length === frameGroups().length ? undefined : chosen });
      } else if (field === 'channel') {
        // The system of the box that changed: its hidden channels are the unticked ones.
        const sysId = String(target.value).split('/')[0];
        const ticked = data.getAll('channel').map(String).filter((v) => v.startsWith(`${sysId}/`)).map((v) => v.split('/')[1]);
        if (!ticked.length) { syncSettings(form); return; }
        const hidden = SYS[sysId].channels.map((ch) => ch.key).filter((k) => !ticked.includes(k));
        const next = { ...local.channels };
        if (hidden.length) next[sysId] = hidden; else delete next[sysId];
        setSettings({ channels: Object.keys(next).length ? next : undefined });
      } else if (field === 'pick') {
        const key = (target as HTMLSelectElement).dataset.key!, value = target.value;
        const next = { ...local.picks };
        if (value && value !== (target as HTMLSelectElement).dataset.default) next[key] = value; else delete next[key];
        setSettings({ picks: Object.keys(next).length ? next : undefined });
      } else if (field === 'mode') {
        const mode = String(data.get('mode')) as BoardMode;
        if (BOARD_MODES.includes(mode)) setSettings({ mode });
      } else if (field === 'start') {
        setSettings({ start: String(data.get('start') ?? '') || undefined });
      } else if (field === 'dial' || field === 'day') {
        const next: Look = { ...local.look, [field]: String(data.get(field)) };
        for (const k of ['dial', 'day'] as const) if (next[k] === (frame.look?.[k] ?? (k === 'dial' ? 'full' : 'plain'))) delete next[k];
        setSettings({ look: Object.keys(next).length ? next : undefined });
      }
    });
    // The dialog keeps the keyboard: Escape closes, Tab cycles inside.
    form.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables(), first = list[0], last = list[list.length - 1];
      if (e.shiftKey && activeElement() === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && activeElement() === last) { e.preventDefault(); first.focus(); }
    });
  }

  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
}

// The panel behind the gear: the systems of the frame to tick, the board's
// view, and where it opens next time. Changes apply as they are made and are
// kept in this browser; "Back to defaults" returns to the frame.
const GEAR = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
function settingsPanel() {
  return `<button type="button" class="gear" aria-label="${t.settings}" aria-haspopup="dialog" aria-expanded="false">${GEAR}</button>
  <div class="settings-backdrop" hidden>
    <form class="settings" role="dialog" aria-modal="true" aria-labelledby="pulse-settings-title">
      <header><h2 id="pulse-settings-title">${t.settings}</h2>
        <button type="button" class="plain settings-close" data-settings-close aria-label="${t.close}">×</button></header>
      <p class="settings-lead">${t.settingsLead}</p>
      <fieldset><legend>${t.systemsField}</legend>
        <div class="settings-systems">${frame.systems.map((id) =>
          `<label><input type="checkbox" name="systems" value="${id}"> ${SYS[id].title}</label>`).join('')}</div></fieldset>
      <fieldset class="settings-groups" hidden><legend>${t.groupsField}</legend>
        <div class="settings-groups-list"></div>
        <p class="hint">${t.groupsHint}</p></fieldset>
      <fieldset class="settings-channels-field"><legend>${t.channelsField}</legend>
        <div class="settings-channels"></div>
        <p class="hint">${t.channelsHint}</p></fieldset>
      <fieldset><legend>${t.boardView}</legend>
        <div class="settings-row">${MODES.map(([m, label]) => `<label><input type="radio" name="mode" value="${m}"> ${label}</label>`).join('')}</div></fieldset>
      <fieldset><legend>${t.openInside}</legend>
        <select name="start" aria-describedby="pulse-settings-start"></select>
        <p class="hint" id="pulse-settings-start">${t.startHint}</p></fieldset>
      <fieldset><legend>${t.lookField}</legend>
        <div class="settings-row" role="group" aria-label="${t.dialField}"><span class="settings-group-title">${t.dialField}</span>${DIALS.map((d) =>
          `<label><input type="radio" name="dial" value="${d}"> ${t.dialLook[d]}</label>`).join('')}</div>
        <div class="settings-row" role="group" aria-label="${t.dayField}"><span class="settings-group-title">${t.dayField}</span>${DAYS.map((d) =>
          `<label><input type="radio" name="day" value="${d}"> ${t.dayLook[d]}</label>`).join('')}</div></fieldset>
      <footer><button type="button" class="plain" data-settings-reset>${t.resetSettings}</button>
        <button type="button" class="primary" data-settings-close>${t.done}</button></footer>
    </form>
  </div>`;
}
// A list of the panel redrawn only when its markup changes, and the control
// that had the focus (a select just changed) gets it back.
function rebuild(list: HTMLElement, html: string) {
  if (list.dataset.html === html) return;
  const focused = activeElement(), inside = focused && list.contains(focused) ? focused as HTMLInputElement | HTMLSelectElement : null;
  const where = inside ? { name: inside.name, value: inside.dataset.key ?? inside.value } : null;
  setHTML(list, html);
  list.dataset.html = html;
  if (where) {
    const again = [...list.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[name="${where.name}"]`)]
      .find((el) => (el.dataset.key ?? el.value) === where.value);
    again?.focus();
  }
}
// A thing's name for the gear's lists, with where it is when that adds something.
const labelOf = (id: string) => {
  const n = host.nameOf(id), p = host.whereIs?.(id);
  return p && !n.toLowerCase().includes(p.toLowerCase()) ? `${n} · ${p}` : n;
};
function syncSettings(form: HTMLFormElement) {
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="systems"]')) box.checked = IDS.includes(box.value);
  const lk = look();
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="dial"], input[name="day"]')) box.checked = lk[box.name as 'dial' | 'day'] === box.value;
  // Groups, as the host groups them, and the channels of the systems shown:
  // built from the host and the readings, so only redrawn when they change (the
  // panel repaints with the host; a list rebuilt under the pointer would lose taps).
  const groupsField = form.querySelector<HTMLElement>('.settings-groups')!, groupsList = groupsField.querySelector<HTMLElement>('.settings-groups-list')!;
  const offered = frameGroups();
  groupsField.hidden = offered.length < 2;
  const groups = hostGroups().map((g) => ({ title: g.title, items: g.items.filter((i) => offered.includes(i.id)) })).filter((g) => g.items.length);
  const groupsHtml = groups.map((g) => `<div class="settings-group">${g.title ? `<span class="settings-group-title">${esc(g.title)}</span>` : ''}${g.items.map((i) =>
    `<label><input type="checkbox" name="groups" value="${esc(i.id)}"> ${esc(i.name)}</label>`).join('')}</div>`).join('');
  rebuild(groupsList, groupsHtml);
  const active = activeGroups();
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="groups"]')) box.checked = !active || active.includes(box.value);
  const chList = form.querySelector<HTMLElement>('.settings-channels')!;
  const chHtml = IDS.filter((id) => channels[id]?.length).map((id) => `<div class="settings-group"><span class="settings-group-title">${SYS[id].title}</span>${
    channels[id].map(({ ch, r }) => `<div class="settings-channel"><label><input type="checkbox" name="channel" value="${id}/${ch.key}"> ${esc(ch.name)}</label>${
      r.choices ? `<select name="pick" data-key="${id}/${ch.key}" data-default="${esc(r.choices[0])}" aria-label="${esc(t.pickFor(ch.name))}">${
        r.choices.map((e) => `<option value="${esc(e)}">${esc(labelOf(e))}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>`).join('');
  rebuild(chList, chHtml);
  form.querySelector<HTMLElement>('.settings-channels-field')!.hidden = !chHtml;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="channel"]')) {
    const [sysId, key] = box.value.split('/');
    box.checked = !channels[sysId]?.find((c) => c.ch.key === key)?.hidden;
  }
  for (const select of form.querySelectorAll<HTMLSelectElement>('select[name="pick"]')) {
    const [sysId, key] = select.dataset.key!.split('/');
    const r = channels[sysId]?.find((c) => c.ch.key === key)?.r;
    if (r?.choice) select.value = r.choice;
  }
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.checked = radio.value === boardMode;
  const select = form.querySelector<HTMLSelectElement>('select[name="start"]')!;
  setHTML(select, `<option value="">${t.theBoard}</option>${IDS.map((id) => `<option value="${id}">${SYS[id].title}</option>`).join('')}`);
  select.value = startId() ?? '';
}

// ─── System: the radial object in layers ────────────────────────────

function system(ctx: ViewContext, id: string) {
  ctx.target.dataset.title = SYS[id].title;
  const sys = SYS[id];
  const el = ctx.target;
  let flat = true, locked = false, dragging = false;

  el.innerHTML = systemShell(sys.title, viewToggle());
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  // The object fills the stage: what fits depends on the state (calm shows the
  // layers behind, an alert zooms the front), so it is set again on each paint.
  let box = { width: 0, height: 0 };
  const refit = (alert: boolean) => { if (box.width) stage.style.setProperty('--fit', fitFor(box.width, box.height, alert).toFixed(3)); };
  const fit = new ResizeObserver(([entry]) => { box = entry.contentRect; refit(stage.dataset.zoom === 'alert'); });
  fit.observe(stage);
  ctx.onCleanup(() => fit.disconnect());
  const dotsEl = el.querySelector<HTMLElement>('.dots');

  const layers = new Map<string, HTMLElement>();
  const layerOf = (key: string) => {
    let layer = layers.get(key);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'gravity-spot layer';
      layer.dataset.ch = key;
      depth.append(layer);
      layers.set(key, layer);
    }
    return layer;
  };

  let last = '';
  const paint = () => {
    if (dragging) return;              // repainting would cut the dial drag
    const ord = order(id), u = ui[id], map = readings[id];
    // Repaint only if something of this system changed.
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(map.get(k)!.r)]), [...u.seen], [...failed.keys()], flat, toast,
      PHONE ? IDS.map((o) => [order(o)[0], worst(o)]) : 0]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement() as HTMLElement | null;
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    const alert = live(id).length > 0;
    if (alert) flat = false;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    refit(alert);
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    setViewToggle(el.querySelector<HTMLElement>('[data-act="view"]')!, flat);

    for (const [key, layer] of layers) if (!map.has(key)) { layer.remove(); layers.delete(key); }
    const waiting = live(id).filter((k) => k !== ord[0]);
    ord.forEach((key, i) => {
      const layer = layerOf(key), { ch, r } = map.get(key)!;
      const seen = u.seen.has(key);
      const d = Math.min(i, SIZE.length - 1);
      layer.hidden = i >= SIZE.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', !!r.alert);
      layer.classList.toggle('is-seen', seen);
      layer.dataset.level = String(r.alert?.level ?? 0);
      const grow = SIZE[d];
      const shown = r.alert && !seen ? r.alert : r;
      // Rule 3: the alerts that wait orbit the front ring with their icon.
      const sats = i === 0 ? waiting.map((k, j) => {
        const w = map.get(k)!;
        return `<div class="orbit-12 sat-orbit" style="--o-range:0deg; --o-from:${(45 + j * 32)}deg">
          <div class="satellite sat level-${w.r.alert!.level}" data-pick="${k}" role="button" tabindex="0"
            aria-label="${esc(t.alertIn(w.ch.name, w.r.alert!.why))}" style="--o-size-ratio:3">${icon(w.ch.glyph, 14)}</div></div>`;
      }).join('') : '';
      layer.innerHTML = ring(key, r, STROKE[d] / grow / LANE, i === 0, false, i === 0 && !!r.alert && !seen, ch.name) + sats + (i === 0
        ? face({ glyph: ch.glyph, name: ch.name, big: shown.big, label: shown.label, to: 'detail',
          props: { system: id, channel: key }, aria: t.details(ch.name), image: imageOf(r),
          extra: isPending(r) ? `<span class="face-wait">${t.sending}</span>` : '' })
        : backLayer({ text: `${ch.name} · ${shown.big}`, at: labelAt(i), grow, stroke: STROKE[d], hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    const frontItem = map.get(ord[0]);
    if (!frontItem) { strip.textContent = t.noEntities; return; }
    const hidden = ord.slice(SIZE.length).map((k) => ({ key: k, name: map.get(k)!.ch.name }));
    const fa = frontItem.r.alert && !u.seen.has(ord[0]) ? frontItem.r.alert : null;
    if (dotsEl) {
      dotsEl.innerHTML = dots(IDS.filter((other) => order(other).length).map((other) => {
        const k = order(other)[0];
        return { id: other, title: SYS[other].title, level: worst(other), ring: ring(k, readings[other].get(k)!.r, DOT_LANES) };
      }), id);
    }
    strip.innerHTML = failuresOf(frontItem.r).length ? retryCard(frontItem.r)
      : toast ? `<span class="error">${esc(toast)}</span>`
      : fa ? `<strong>${frontItem.ch.name}:</strong> ${esc(fa.why)}.
          ${fa.busy ? `<span class="face-wait">${t.inProgress}</span>` : `<button class="primary level-${fa.level}" data-resolve="${ord[0]}">${esc(fa.verb)}</button>
          ${fa.acts.length ? `<button class="plain" data-seen="${ord[0]}">${t.mute}</button>` : ''}`}
          ${waiting.length ? `<span class="how">${t.moreWaiting(waiting.length)}</span>` : ''}`
      : calmStrip(sys.title, frontItem.ch.name, hidden);

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };
  const focusKey = (target: HTMLElement) => {
    const layer = target.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-act']) {
      const v = target.getAttribute(a);
      if (v === null) continue;
      const handle = target.getAttribute('data-handle');
      return `${a === 'data-seg' && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]${handle ? `[data-handle="${handle}"]` : ''}`;
    }
    return null;
  };

  // ─── Direct controls ───
  const dialOf = (key: string) => readings[id].get(key)!.r.dial!;
  const snap = (key: string, v: number) => {
    const dial = dialOf(key);
    const raw = dial.min + Math.min(1, Math.max(0, v)) * (dial.max - dial.min);
    return Math.round(raw / dial.step) * dial.step;
  };
  const rangeOf = (key: string) => readings[id].get(key)!.r.range;
  // Where each end of a range is now (held or read), in the dial's units.
  const endOf = (key: string, handle: string) => {
    const dial = dialOf(key), range = rangeOf(key)!;
    return hold.get(`${dial.id}#${handle}`)?.value ?? (handle === 'lo' ? range.lo : range.hi);
  };
  // The dial moves in place; the action goes out on release (or after a keyboard pause).
  const setDial = (key: string, value: number, until = Infinity, handle?: string) => {
    const dial = dialOf(key);
    value = Math.min(dial.max, Math.max(dial.min, value));
    const layer = layers.get(key)!;
    if (handle) {
      // One end never crosses the other.
      const other = endOf(key, handle === 'lo' ? 'hi' : 'lo');
      value = handle === 'lo' ? Math.min(value, other) : Math.max(value, other);
      hold.set(`${dial.id}#${handle}`, { value, until });
      const lo = endOf(key, 'lo'), hi = endOf(key, 'hi'), fl = frac(dial, lo), fh = frac(dial, hi);
      const band = layer.querySelector<HTMLElement>('.range-band o-arc');
      band?.setAttribute('start', (fl * 100).toFixed(1));
      band?.setAttribute('value', ((fh - fl) * 100).toFixed(1));
      for (const [h, v, f] of [['lo', lo, fl], ['hi', hi, fh]] as const) {
        const knob = layer.querySelector<HTMLElement>(`.knob[data-handle="${h}"]`);
        knob?.parentElement?.style.setProperty('--o-from', `${(f * 360).toFixed(2)}deg`);
        knob?.setAttribute('aria-valuenow', String(v));
        knob?.setAttribute('aria-valuetext', `${num(v)}${dial.unit}`);
      }
      const label = layer.querySelector('.face-label');
      if (label) label.textContent = t.between(num(lo), num(hi), dial.unit);
      return value;
    }
    hold.set(dial.id, { value, until });
    const v = (value - dial.min) / (dial.max - dial.min);
    const ringEl = layer.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(value));
    ringEl?.setAttribute('aria-valuetext', `${num(value)}${dial.unit}`);
    const label = layer.querySelector('.face-label');
    if (label) label.textContent = `${dial.label} ${num(value)}${dial.unit}`;
    return value;
  };
  const commit = (key: string) => {
    const dial = dialOf(key), range = rangeOf(key);
    if (range) {
      const lo = hold.get(`${dial.id}#lo`), hi = hold.get(`${dial.id}#hi`);
      if (!lo && !hi) return;
      for (const h of [lo, hi]) if (h) h.until = Date.now() + PENDING_MS;
      void send([range.set(lo?.value ?? range.lo, hi?.value ?? range.hi)]);
      return;
    }
    const h = hold.get(dial.id);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    void send([dial.set(h.value)]);
  };
  let keyTimer = 0;
  const commitSoon = (key: string) => {
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => commit(key), 500);
  };

  const fraction = (key: string, handle?: string) => {
    const d = dialOf(key);
    if (handle) return frac(d, endOf(key, handle));
    return ((hold.get(d.id)?.value ?? d.value) - d.min) / (d.max - d.min);
  };
  ctx.onCleanup(dialControls(el, {
    locked: () => locked,
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12') ?? null,
    current: fraction,
    stepOf: (key) => { const d = dialOf(key); return d.step / (d.max - d.min); },
    set: (key, v, handle) => setDial(key, snap(key, v), Infinity, handle),
    // On a range's track, the end nearer to the pointer follows it.
    nearest: (key, v) => {
      if (!rangeOf(key)) return undefined;
      const dist = (f: number) => Math.min(Math.abs(f - v), 1 - Math.abs(f - v));
      return dist(fraction(key, 'lo')) <= dist(fraction(key, 'hi')) ? 'lo' : 'hi';
    },
    onStart: () => { dragging = true; },
    onEnd: (key) => { dragging = false; commit(key); },
    onInput: commitSoon,
    activate: 'o-arc[data-pick], o-arc[data-seg], .sat[data-pick]',
  }));

  // A live picture in the face: its snapshot is asked again every 8 s.
  const refresh = window.setInterval(() => {
    const img = el.querySelector<HTMLImageElement>('.layer-front .face-image[data-image]');
    const r = img && readings[id].get(ord0())?.r;
    const next = r && imageOf(r);
    if (img && next && img.src !== next.src) img.src = next.src;
  }, 8000);
  const ord0 = () => order(id)[0];
  ctx.onCleanup(() => clearInterval(refresh));

  const lock = () => {
    locked = true;
    stage.classList.add('is-locked');
    setTimeout(() => { locked = false; stage.classList.remove('is-locked'); }, LOCK_MS);
  };

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick;
    const resolve = target.closest<HTMLElement>('[data-resolve]')?.dataset.resolve;
    const seenKey = target.closest<HTMLElement>('[data-seen]')?.dataset.seen;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = target.closest<HTMLElement>('[data-go]')?.dataset.go;
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(again); return; }
    if (go) { goSystem(go); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const s = readings[id].get(key)!.r.segs![Number(seg.dataset.seg)];
      if (s.act && !pending.has(s.id)) void send([s.act]);
      return;
    }
    if (pick && !locked) { ui[id].pick = pick; lock(); }
    else if (resolve) {
      const a = readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.acts.length) void send(a.acts);
      else ui[id].seen.add(resolve);
      lock();
    } else if (seenKey) { ui[id].seen.add(seenKey); lock(); }
    else if (act === 'view') flat = !flat;
    else return;
    repaint();
  });

  // ─── Phone: from one system to the next ───
  const goSystem = (other: string) => {
    if (other !== id) void app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // The browser leaves the horizontal gesture to the page (otherwise it cancels
  // it as a scroll) so Zumly's lateral swipe sees it.
  if (PHONE) el.style.touchAction = 'pan-y';
  parallax(stage, obj, () => !flat);

  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
}

// ─── Channel detail ─────────────────────────────────────────────────

// A day of a thing, once per visit (and again after five minutes).
const histories = new Map<string, { at: number; values: (number | null)[] | null; error?: boolean }>();
const HISTORY_MS = 5 * 60_000;
// A day of changes of a set of things (the rings of a detail), likewise; keyed by the set.
const changesOf = new Map<string, { at: number; changes: Record<string, StateChange[]> | null; error?: boolean }>();

function detail(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const el = ctx.target;
  el.dataset.title = readings[id]?.get(key)?.ch.name ?? key;
  let last = '';
  let square = false, live = false;
  const paint = () => {
    const item = readings[id]?.get(key);
    if (!item) return;
    const { ch, r } = item;
    const history = r.history ? histories.get(r.history) : undefined;
    const trackIds = r.tracks?.length && host.changes ? r.tracks.map((x) => x.id).join(' ') : '';
    const changes = trackIds ? changesOf.get(trackIds) : undefined;
    const now = JSON.stringify([r, [...pending.keys()], [...failed.keys()], toast, square, live, history?.values?.length ?? history?.error,
      changes?.at ?? changes?.error, host.changedAt?.(r.events?.[0]?.id ?? '')]);
    if (now === last) return;
    last = now;
    const active = activeElement() as HTMLElement | null;
    if (el.contains(active) && active?.matches('input[type="range"], [data-wheel]')) return;
    const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
    let control = '';
    if (r.dial && r.range) {
      const d = r.dial;
      const one = (handle: 'lo' | 'hi', value: number, label: string) => `<label class="slider">${esc(label)} · <output>${num(value)}${d.unit}</output>
        <input type="range" data-handle="${handle}" min="${d.min}" max="${d.max}" step="${d.step}" value="${value}"></label>`;
      control = `<div class="ranges">${one('lo', r.range.lo, t.lowOf(d.label))}${one('hi', r.range.hi, t.highOf(d.label))}</div>`;
    } else if (r.dial) {
      control = `<label class="slider">${r.dial.label[0].toUpperCase()}${r.dial.label.slice(1)} · <output>${num(r.dial.value)}${r.dial.unit}</output>
        <input type="range" min="${r.dial.min}" max="${r.dial.max}" step="${r.dial.step}" value="${r.dial.value}"></label>`;
    } else if (r.segs) {
      // Switches, or the options of a choice (radios: the one that is on has no action).
      const type = r.kind === 'c' ? 'radio' : 'checkbox';
      control = `<ul class="switches${r.kind === 'c' ? ' choice' : ''}">${r.segs.map((s, i) => `<li><label class="${pending.has(s.id) ? 'is-pending' : ''}${
        r.alert?.fail?.includes(i) ? ` fail level-${r.alert.level}` : ''}">
        <input type="${type}" name="seg" data-seg="${i}"${s.on ? ' checked' : ''}${s.act ? '' : ' disabled'}> ${esc(s.label)}
        <span class="state">${esc(r.kind === 'c' ? '' : host.stateOf(s.id))}</span></label></li>`).join('')}</ul>`;
    }
    if (r.color) control += colorWheel(r.color.hs, key, t.colorOf(ch.name));
    // The picture, round like the face or square on request; a live one can stream.
    let figure = '';
    if (r.image) {
      const stream = r.image.live ? host.stream?.(r.image.id) : undefined;
      const img = imageOf(r)!;
      figure = `<figure class="detail-image${square ? ' is-square' : ''}">
        <img src="${esc(live && stream ? stream : img.src)}" alt="${esc(img.alt)}"${img.key && !live ? ` data-image="${esc(img.key)}"` : ''}>
        <figcaption><button class="plain" data-shape>${square ? t.showRound : t.showSquare}</button>
          ${stream ? `<button class="plain" data-live aria-pressed="${live}">${live ? t.snapshot : t.live}</button>` : ''}</figcaption></figure>`;
    }
    // The last 24 hours: a ring per thing (what was on, when), with what is
    // now in the center, or a numeric thing's values as one ring.
    let day = '';
    let rings = false;
    if (trackIds) {
      if (!changes || (Date.now() - changes.at > HISTORY_MS && changes.changes)) void loadChanges(trackIds, r.tracks!.map((x) => x.id));
      rings = !!changes?.changes;
      const list = changes?.changes;
      day = `<div class="history">${list ? timeline({
        hours: 24,
        tracks: r.tracks!.map((x) => ({ key: x.id, name: host.nameOf(x.id), spans: spansOf(list[x.id] ?? [], x.on),
          on: x.now, tone: x.tone, act: !!x.act, pending: pending.has(x.id), failed: failed.has(x.id) })),
        events: (r.events ?? []).map((ev) => ({ ago: (Date.now() - (host.changedAt?.(ev.id) ?? NaN)) / 3_600_000, text: ev.text, tone: ev.tone }))
          .filter((ev) => Number.isFinite(ev.ago)),
        big: a ? a.big : r.big, label: a ? a.label : r.label, marks: look().day === 'marks', aria: t.dayOf(ch.name),
      }) : `<p class="hint">${changes?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    } else if (r.history && host.history) {
      if (!history || (Date.now() - history.at > HISTORY_MS && history.values)) void loadHistory(r.history);
      const u = host.unitOf?.(r.history) ?? '';
      day = `<div class="history">${history?.values ? timeRing({ values: history.values, label: t.last24h, unit: u === '%' || !u ? u : ` ${u}`, marks: look().day === 'marks' })
        : `<p class="hint">${history?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    }
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${SYS[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      ${rings ? '' : `<p class="detail-big${a ? ` level-${a.level}` : ''}">${esc(a ? a.big : r.big)}</p>
      <p class="detail-label">${esc(a ? a.label : r.label)}</p>`}
      ${a ? `<p class="detail-why level-${a.level}">${esc(a.why)}. ${a.busy ? `<span class="face-wait">${t.inProgress}</span>`
        : `<button class="primary" data-resolve>${esc(a.verb)}</button>`}</p>` : ''}
      ${failuresOf(r).length ? `<p class="detail-fail">${retryCard(r)}</p>` : toast ? `<p class="error">${esc(toast)}</p>` : ''}
      ${figure}
      ${day}
      ${rings && r.segs ? `<p class="hint rings-order">${t.outsideIn(r.tracks!.length > MAX_TRACKS ? MAX_TRACKS : 0)}</p>` : ''}
      ${control}
      ${r.ids.length ? `<details class="things"><summary>${t.things}</summary><ul>${r.ids.map((e) =>
        `<li><code>${esc(e)}</code> <span>${esc(host.nameOf(e))}</span> <strong>${esc(host.stateOf(e))}</strong></li>`).join('')}</ul></details>` : ''}
    </div>`;
  };
  const loadChanges = (key: string, ids: string[]) => {
    const was = changesOf.get(key);
    changesOf.set(key, { at: Date.now(), changes: was?.changes ?? null });
    return host.changes!(ids, 24).then(
      (changes) => { changesOf.set(key, { at: Date.now(), changes }); paint(); },
      () => { changesOf.set(key, { at: Date.now(), changes: null, error: true }); paint(); });
  };
  const loadHistory = (thing: string) => {
    const was = histories.get(thing);
    histories.set(thing, { at: Date.now(), values: was?.values ?? null });
    return host.history!(thing, 24).then(
      (values) => { histories.set(thing, { at: Date.now(), values: values.some((v) => v != null) ? values : null, error: !values.some((v) => v != null) }); paint(); },
      () => { histories.set(thing, { at: Date.now(), values: null, error: true }); paint(); });
  };
  // A live picture's snapshot, refreshed like the face's.
  const refresh = window.setInterval(() => {
    const img = el.querySelector<HTMLImageElement>('.detail-image img[data-image]');
    const r = readings[id]?.get(key)?.r, next = r && imageOf(r);
    if (img && next && img.src !== next.src) img.src = next.src;
  }, 8000);
  ctx.onCleanup(() => clearInterval(refresh));
  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });

  // ─── The color wheel: the handle follows the pointer; the thing gets the color on release ───
  const hsOf = (): [number, number] => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
    // A white light has no hue yet: the keys start from a full red, not from white.
    return h ? [Math.floor(h.value / 1000), h.value % 1000] : r.color!.hs ?? [0, 100];
  };
  let wheelTimer = 0;
  const sendColor = () => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    const [hue, sat] = [Math.floor(h.value / 1000), h.value % 1000];
    void send([r.color!.set(hue, sat)]);
  };
  ctx.onCleanup(wheelControls(el, {
    current: hsOf,
    set: (_k, [h, sat]) => {
      const r = readings[id].get(key)!.r;
      // One number holds both: hue × 1000 + saturation.
      hold.set(`${r.color!.id}#hs`, { value: h * 1000 + sat, until: Infinity });
      const wheel = el.querySelector<HTMLElement>('[data-wheel]'), handle = wheel?.querySelector<HTMLElement>('.color-handle');
      if (!wheel || !handle) return;
      wheel.classList.remove('is-unset');
      wheel.setAttribute('aria-valuenow', String(h));
      wheel.setAttribute('aria-valuetext', t.hueSat(h, sat));
      handle.style.left = `${(50 + 50 * (sat / 100) * Math.sin(h * Math.PI / 180)).toFixed(1)}%`;
      handle.style.top = `${(50 - 50 * (sat / 100) * Math.cos(h * Math.PI / 180)).toFixed(1)}%`;
      handle.style.background = `hsl(${h} 100% ${Math.round(100 - sat / 2)}%)`;
    },
    onEnd: sendColor,
    onInput: () => { clearTimeout(wheelTimer); wheelTimer = window.setTimeout(sendColor, 500); },
  }));

  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type !== 'range' || !r.dial) return;
    const handle = input.dataset.handle;
    hold.set(handle ? `${r.dial.id}#${handle}` : r.dial.id, { value: Number(input.value), until: Infinity });
    input.closest('label')!.querySelector('output')!.textContent = `${num(Number(input.value))}${r.dial.unit}`;
  });
  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type === 'range' && r.dial && r.range) {
      const handle = input.dataset.handle!, value = Number(input.value);
      const lo = handle === 'lo' ? value : hold.get(`${r.dial.id}#lo`)?.value ?? r.range.lo;
      const hi = handle === 'hi' ? value : hold.get(`${r.dial.id}#hi`)?.value ?? r.range.hi;
      const [l, h] = lo <= hi ? [lo, hi] : handle === 'lo' ? [lo, lo] : [hi, hi];
      hold.set(`${r.dial.id}#lo`, { value: l, until: Date.now() + PENDING_MS });
      hold.set(`${r.dial.id}#hi`, { value: h, until: Date.now() + PENDING_MS });
      void send([r.range.set(l, h)]);
      input.blur();
    } else if (input.type === 'range' && r.dial) {
      hold.set(r.dial.id, { value: Number(input.value), until: Date.now() + PENDING_MS });
      void send([r.dial.set(Number(input.value))]);
      input.blur();
    } else if (input.dataset.seg !== undefined) {
      const s = r.segs![Number(input.dataset.seg)];
      if (s.act) void send([s.act]);
    }
  });
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-shape]')) { square = !square; paint(); return; }
    if (target.closest('[data-live]')) { live = !live; paint(); return; }
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(again); return; }
    const track = target.closest<HTMLElement>('[data-track]')?.dataset.track;
    if (track) {
      const x = readings[id].get(key)?.r.tracks?.find((y) => y.id === track);
      if (x?.act && !pending.has(track)) void send([x.act]);
      return;
    }
    if (!target.closest('[data-resolve]')) return;
    const a = readings[id].get(key)?.r.alert;
    if (!a) return;
    if (a.acts.length) void send(a.acts);
    else { ui[id].seen.add(key); repaint(); }
  });
}

// ─── Start ──────────────────────────────────────────────────────────

const app = new Zumly(zumlyOptions({
  board, detail,
  ...Object.fromEntries(ALL.map((id) => [`sys-${id}`, (ctx: ViewContext) => system(ctx, id)])),
}, 'board', canvas));
app.on('afterZoomOut', () => repaint());

// Things some channel shows: only those enter the change log.
const watched = () => new Set(IDS.flatMap((id) => [...readings[id].values()].flatMap((x) => x.r.ids)));
let loaded = false;

const onStatus = () => {
  if (host.status === 'signed-out') { loaded = false; log.length = 0; }
  options.onStatus?.(host.status);
  repaint();
};
const onChange = (changed: Changed[]) => {
  for (const c of changed) { pending.delete(c.id); failed.delete(c.id); const h = hold.get(c.id); if (h && h.until !== Infinity) hold.delete(c.id); }
  const fresh = compute();
  if (fresh.length) boardPick = null;
  if (loaded) {
    const w = watched();
    for (const c of changed) {
      if (!w.has(c.id) || !c.logged) continue;
      log.unshift({ at: new Date(), text: `${host.nameOf(c.id)} → ${host.stateOf(c.id)}`, level: 0, id: c.id });
    }
    for (const f of fresh) log.unshift({ at: new Date(), text: `${SYS[f.id].title}: ${f.a.why}`, level: f.a.level });
    log.splice(12);
  }
  rerender.forEach((fn) => fn());
  // A new critical alert opens its system on its own, from its tile (not from the center).
  const critical = loaded && fresh.find((f) => f.a.level === 2);
  if (critical && app.getCurrentViewName() === 'board') {
    const tile = canvas.querySelector<HTMLElement>(`.is-current-view .zoom-me[data-system="${critical.id}"]`);
    if (tile) void app.zoomIn(tile);
  }
  if (!loaded && host.status === 'live') { loaded = true; void start(); }
};

// The host can change (the live one, a demo): only the current one reaches
// the UI, and everything that was pending is forgotten.
let unsubscribe: (() => void)[] = [];
const subscribe = (h: PulseHost) => {
  unsubscribe.forEach((fn) => fn());
  unsubscribe = [h.onStatus(onStatus), h.onChange(onChange), h.onStructure?.(() => repaint()) ?? (() => {})];
};
subscribe(host);
// The host may already hold data (a card's `hass` arrives before the mount).
compute();
const setHost = (h: PulseHost) => {
  if (h === host) return;
  host = h;
  SYS = { ...SYS, ...Object.fromEntries(h.systems.filter((s) => ALL.includes(s.id)).map((s) => [s.id, s])) };
  loaded = false;
  log.length = 0;
  pending.clear();
  hold.clear();
  subscribe(h);
  onStatus();
  if (h.hasData) onChange([]);
};

// Inside the system asked for; on the phone, inside the one that calls the most.
async function start() {
  const first = startId() ?? (PHONE ? [...IDS].sort((a, b) => worst(b) - worst(a))[0] : null);
  if (first) await startInside(app, first, canvas);
}

  return {
    app,
    get host() { return host; },
    setHost,
    settings,
    setSettings,
    repaint,
    // A host already live at mount time (a card's `hass`) starts as soon as
    // the board is in the DOM; otherwise the first live change starts it.
    ready: app.init().then(() => { if (!loaded && host.status === 'live') { loaded = true; return start(); } }),
    destroy: () => { unsubscribe.forEach((fn) => fn()); compact.disconnect(); app.destroy(); },
    ui,
    readings: () => readings,
  };
}
