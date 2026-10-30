import Zumly, { type ViewContext } from 'zumly';
import type { Call, HassState, PulseSource, Status } from './source.ts';
import { nameOf, systems, type Alert, type Channel, type Reading } from './model.ts';
import { tune } from './tune.ts';
import {
  DOT_LANES, LANE, LOCK_MS, MINI_LANES, PHONE, SIZE, STROKE, backLayer, calmStrip, dialControls, dots, esc, face,
  icon, labelAt, levelColor, num, parallax, ring as drawRing, startInside, systemShell, time, zumlyOptions,
} from '@zumer/pulse';
import { t } from './strings.ts';

// The radial object over a PulseSource, mounted on an element: the board, one
// view per system and the channel detail, as Zumly views inside `canvas`.
// Readings, alerts and their resolution come from the source; what is shown
// is what it confirmed; until it does, the segment or the dial stays
// "sending". The standalone app (`main.ts`) mounts it on the page with the
// WebSocket or a demo home; the card (`card/`) in its shadow root with the
// `hass` object.

export type BoardMode = 'grid' | 'orbit' | 'layers';
export const BOARD_MODES: BoardMode[] = ['grid', 'orbit', 'layers'];

// What a screen shows: the viewer's choices (the gear on the board), kept in
// the browser. The host's `PulseOptions` are the frame they are made within.
export type PulseSettings = {
  systems?: string[];
  mode?: BoardMode;
  start?: string;
};

export type PulseOptions = {
  source: PulseSource;
  // Which systems the object may show (default: all of model.ts); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Where the viewer's choices are kept: a localStorage key (default
  // 'pulse-ha-settings'); `false` hides the gear and keeps nothing.
  settings?: string | false;
  // The connection line of the board (HTML); the shell decides what it says.
  status?: (source: PulseSource) => string;
  // A button with `data-action` in that line was pressed.
  onAction?: (action: string) => void;
  onStatus?: (status: Status) => void;
};

export type PulseHandle = {
  app: Zumly;
  readonly source: PulseSource;
  setSource(src: PulseSource): void;
  settings(): PulseSettings;
  setSettings(patch: PulseSettings): void;
  repaint(): void;
  ready: Promise<unknown>;
  destroy(): void;
  ui: unknown;
  readings(): unknown;
};

export function mountPulse(canvas: HTMLElement, options: PulseOptions): PulseHandle {
// Focus lives in the document or in the card's shadow root.
const activeElement = () => (canvas.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;

// In a small box (a card in a section of a dashboard, a narrow window) the
// board tightens: smaller headline, fewer lines of ticker, the object bigger.
const compact = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect;
  canvas.classList.toggle('compact', width < 640 || height < 540);
});
compact.observe(canvas);

let ha: PulseSource = options.source;
const SYS = Object.fromEntries(systems.map((s) => [s.id, s]));
const ALL = systems.map((s) => s.id);
const valid = (ids?: string[]) => (ids ?? []).filter((id) => ALL.includes(id));

// The frame: what the host (a card's config, the page's URL) allows. The
// viewer chooses within it with the gear; that choice is kept per browser.
const frame = { systems: valid(options.systems).length ? valid(options.systems) : ALL, mode: options.mode, start: options.start };
const STORE = options.settings === false ? null : options.settings ?? 'pulse-ha-settings';
const loadSettings = (): PulseSettings => {
  if (!STORE) return {};
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as PulseSettings;
    // Before the gear, only the board's view was remembered.
    const legacy = localStorage.getItem('pulse-ha-board');
    if (legacy && BOARD_MODES.includes(legacy as BoardMode)) return { mode: legacy as BoardMode };
  } catch { /* no storage: the frame as it comes */ }
  return {};
};
let local: PulseSettings = loadSettings();
let IDS: string[] = [];
let boardMode: BoardMode = 'grid';
const applySettings = () => {
  const chosen = valid(local.systems).filter((id) => frame.systems.includes(id));
  IDS = chosen.length ? chosen : frame.systems;
  boardMode = local.mode && BOARD_MODES.includes(local.mode) ? local.mode : frame.mode ?? 'grid';
};
applySettings();
const startId = () => { const id = local.start ?? frame.start; return id && IDS.includes(id) ? id : null; };
const settings = (): PulseSettings => ({ systems: IDS, mode: boardMode, start: startId() ?? undefined });
const setSettings = (patch: PulseSettings) => {
  local = { ...local, ...patch };
  for (const k of Object.keys(local) as (keyof PulseSettings)[]) {
    const v = local[k];
    if (v === undefined || (Array.isArray(v) && !v.length)) delete local[k];
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
// Entities with an unconfirmed command, and dial values the user is moving.
const pending = new Map<string, number>();
const hold = new Map<string, { value: number; until: number }>();
const log: { at: Date; text: string; level: number; entity?: string }[] = [];
const rerender = new Set<() => void>();
let toast = '';

const PENDING_MS = 8000;
// Layered view of the board: seven systems, each layer a bit bigger
// (tune.layerGrow, 16% by default), and the labels of the layers behind spread
// out so they do not overlap.
const LABEL_AT = [300, 30, 330, 60, 280, 80];

const sig = (a: Alert) => `${a.level}|${a.big}|${a.why}`;

// ─── Reading ────────────────────────────────────────────────────────

function compute() {
  const now = Date.now(), fresh: { id: string; key: string; a: Alert }[] = [];
  readings = {};
  for (const sys of IDS.map((id) => SYS[id])) {
    const map = new Map<string, { ch: Channel; r: Reading }>(), u = ui[sys.id];
    for (const ch of sys.channels) {
      const r = ch.read(ha.states, { temp: ha.unit, reg: ha.registry });
      if (!r) continue;
      if (r.dial) {
        const h = hold.get(r.dial.entity);
        if (h && h.until > now) { r.dial.value = h.value; r.v = (h.value - r.dial.min) / (r.dial.max - r.dial.min); }
      }
      // A channel that follows an entity takes its name (the model's `name`).
      map.set(ch.key, { ch: r.name && r.name !== ch.name ? { ...ch, name: r.name } : ch, r });
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
const isPending = (r: Reading) => r.entities.some((e) => pending.has(e));

// ─── Commands to Home Assistant ─────────────────────────────────────

async function send(calls: Call[]) {
  for (const c of calls) {
    const ids = ([] as string[]).concat((c.data.entity_id as string | string[]) ?? []);
    ids.forEach((e) => pending.set(e, Date.now()));
    try {
      await ha.call(c);
    } catch (error) {
      ids.forEach((e) => { pending.delete(e); hold.delete(e); });
      toast = t.haError(error instanceof Error ? error.message : String(error));
      setTimeout(() => { toast = ''; repaint(); }, 5000);
    }
  }
  repaint();
  // If Home Assistant changes nothing (say, a service with no effect), stop waiting.
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

// `call`: this ring's alert calls (in front and not muted): its failing segments ripple.
// What was sent and not confirmed is marked pending (it beats).
function ring(key: string, r: Reading, lanes: number, controls = false, muted = false, call = false, name?: string) {
  return drawRing(key, r, lanes, {
    name, controls, muted, call,
    pending: (entity) => entity === undefined ? isPending(r) : pending.has(entity),
  });
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
  if (ha.status !== 'live') return t.connecting;
  const calling = IDS.flatMap((id) => live(id).map((k) => ({ id, k, a: readings[id].get(k)!.r.alert! })))
    .sort((a, b) => b.a.level - a.a.level);
  if (!calling.length) return t.allCalm;
  if (calling.length === 1) return `${calling[0].a.why}.`;
  return `${t.thingsCalling(calling.length, calling[0].a.why.toLowerCase())}.`;
}

// The connection line is the shell's (sign out, leave the demo); a card has none.
const status = () => options.status?.(ha) ?? '';

// Three ways to look at the whole home, over the same data:
// - grid: a mini ring per system (the usual one);
// - orbit: the home's pulse in the center and the systems around it;
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
// at the end the home's pulse. It advances on its own every 6 s, or with the dots.
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
  // The three shown entities that changed last, with their current value.
  const rows = [...watched()].map((e) => ha.states.get(e)!).filter(Boolean)
    .sort((a, b) => b.last_changed.localeCompare(a.last_changed)).slice(0, 3)
    .map((s) => `<li><span>${esc(nameOf(ha.states, s.entity_id))}</span><strong>${esc(stateText(s))}</strong></li>`);
  list.push({ key: 'pulse', level: 0, html: `<div class="slide">
    <p class="eyebrow">${t.pulse}</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? t.nAlerts(alerts.length) : t.allCalm.replace(/\.$/, '')}</p>
    <ul class="hub-rows">${rows.join('') || `<li><span>${t.waitingChanges}</span></li>`}</ul></div>` });
  return list;
}
let slideKey: string | null = null;
const SLIDE_MS = 6000;

// Replaces the content only if it changed: new o-arc take a moment to draw (and
// to receive taps), and the home sends changes every few seconds.
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
    // Layers: 7 systems grow up to 1.96× the 240 px disc, with 1.1× zoom.
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
        <div class="gravity-spot depth outer-perspective" style="--o-depth-grow:${tune.layerGrow}"></div></div></div></div>`;
    } else body.innerHTML = '';
  };

  const paintLayers = (ids: string[]) => {
    const depth = body.querySelector<HTMLElement>('.depth')!;
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
  };

  const paint = () => {
    if (built !== boardMode) build();
    el.querySelector('h1')!.textContent = headline();
    // Only when it changed: the house repaints every few seconds and a button
    // recreated each time would lose taps.
    setHTML(el.querySelector<HTMLElement>('.conn-slot')!, status());
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === boardMode));
    if (form) syncSettings(form);
    const err = el.querySelector<HTMLElement>('.error')!;
    err.hidden = ha.status !== 'error';
    err.textContent = ha.error;
    const ready = ha.status === 'live' || ha.states.size > 0;
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
        aria-label="${x.key === 'pulse' ? t.homePulse : t.alertNof(i + 1, list.length - 1)}"></button>`).join(''));
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
      const field = (e.target as HTMLInputElement).name, data = new FormData(form);
      if (field === 'systems') {
        const chosen = data.getAll('systems').map(String);
        // At least one system: unchecking the last one does not stick.
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ systems: chosen.length === frame.systems.length ? undefined : chosen });
      } else if (field === 'mode') {
        const mode = String(data.get('mode')) as BoardMode;
        if (BOARD_MODES.includes(mode)) setSettings({ mode });
      } else if (field === 'start') {
        setSettings({ start: String(data.get('start') ?? '') || undefined });
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
      <fieldset><legend>${t.boardView}</legend>
        <div class="settings-row">${MODES.map(([m, label]) => `<label><input type="radio" name="mode" value="${m}"> ${label}</label>`).join('')}</div></fieldset>
      <fieldset><legend>${t.openInside}</legend>
        <select name="start" aria-describedby="pulse-settings-start"></select>
        <p class="hint" id="pulse-settings-start">${t.startHint}</p></fieldset>
      <footer><button type="button" class="plain" data-settings-reset>${t.resetSettings}</button>
        <button type="button" class="primary" data-settings-close>${t.done}</button></footer>
    </form>
  </div>`;
}
function syncSettings(form: HTMLFormElement) {
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="systems"]')) box.checked = IDS.includes(box.value);
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

  el.innerHTML = systemShell(sys.title, `<button class="plain" data-act="view">${t.view3d}</button>`);
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  // The object shrinks if it does not fit: the front disc, with the alert zoom
  // (1.7 × 240 px), has to fit in the stage.
  const fit = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    stage.style.setProperty('--fit', String(Math.min(1, Math.min(width, height) / (240 * 1.7))));
  });
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
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(map.get(k)!.r)]), [...u.seen], flat, toast,
      PHONE ? IDS.map((o) => [order(o)[0], worst(o)]) : 0]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement() as HTMLElement | null;
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    const alert = live(id).length > 0;
    if (alert) flat = false;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    el.querySelector<HTMLElement>('[data-act="view"]')!.textContent = flat ? t.view3d : t.viewFlat;

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
          props: { system: id, channel: key }, aria: t.details(ch.name),
          extra: isPending(r) ? `<span class="face-wait">${t.sending}</span>` : '' })
        : backLayer({ text: `${ch.name} · ${shown.big}`, at: labelAt(i), grow, stroke: STROKE[d], hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    const frontItem = map.get(ord[0]);
    if (!frontItem) { strip.textContent = t.noEntities; return; }
    const extra = ord.length - SIZE.length;
    const fa = frontItem.r.alert && !u.seen.has(ord[0]) ? frontItem.r.alert : null;
    const how = frontItem.r.dial ? t.howDial : frontItem.r.segs?.some((s) => s.act) ? t.howSegments : '';
    if (dotsEl) {
      dotsEl.innerHTML = dots(IDS.filter((other) => order(other).length).map((other) => {
        const k = order(other)[0];
        return { id: other, title: SYS[other].title, level: worst(other), ring: ring(k, readings[other].get(k)!.r, DOT_LANES) };
      }), id);
    }
    strip.innerHTML = toast ? `<span class="error">${esc(toast)}</span>`
      : fa ? `<strong>${frontItem.ch.name}:</strong> ${esc(fa.why)}.
          ${fa.busy ? `<span class="face-wait">${t.inProgress}</span>` : `<button class="primary" data-resolve="${ord[0]}">${esc(fa.verb)}</button>
          ${fa.calls.length ? `<button class="plain" data-seen="${ord[0]}">${t.mute}</button>` : ''}`}
          ${waiting.length ? `<span class="how">${t.moreWaiting(waiting.length)}</span>` : ''}`
      : calmStrip(sys.title, frontItem.ch.name, extra, how);

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };

  const focusKey = (target: HTMLElement) => {
    const layer = target.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-act']) {
      const v = target.getAttribute(a);
      if (v !== null) return `${a === 'data-seg' && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]`;
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
  // The dial moves in place; the command goes out on release (or after a keyboard pause).
  const setDial = (key: string, value: number, until = Infinity) => {
    const dial = dialOf(key);
    value = Math.min(dial.max, Math.max(dial.min, value));
    hold.set(dial.entity, { value, until });
    const v = (value - dial.min) / (dial.max - dial.min);
    const layer = layers.get(key)!;
    const ringEl = layer.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(value));
    ringEl?.setAttribute('aria-valuetext', `${num(value)}${dial.unit}`);
    const label = layer.querySelector('.face-label');
    if (label) label.textContent = `${dial.label} ${num(value)}${dial.unit}`;
    return value;
  };
  const commit = (key: string) => {
    const dial = dialOf(key), h = hold.get(dial.entity);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    void send([dial.set(h.value)]);
  };
  let keyTimer = 0;
  const commitSoon = (key: string) => {
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => commit(key), 500);
  };

  const fraction = (key: string) => { const d = dialOf(key); return ((hold.get(d.entity)?.value ?? d.value) - d.min) / (d.max - d.min); };
  ctx.onCleanup(dialControls(el, {
    locked: () => locked,
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12') ?? null,
    current: fraction,
    stepOf: (key) => { const d = dialOf(key); return d.step / (d.max - d.min); },
    set: (key, v) => setDial(key, snap(key, v)),
    onStart: () => { dragging = true; },
    onEnd: (key) => { dragging = false; commit(key); },
    onInput: commitSoon,
    activate: 'o-arc[data-pick], o-arc[data-seg], .sat[data-pick]',
  }));

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
    if (go) { goSystem(go); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const s = readings[id].get(key)!.r.segs![Number(seg.dataset.seg)];
      if (s.act && !pending.has(s.entity)) void send([s.act]);
      return;
    }
    if (pick && !locked) { ui[id].pick = pick; lock(); }
    else if (resolve) {
      const a = readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.calls.length) void send(a.calls);
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

// Home Assistant states as words; anything else is shown as it comes.
const stateWords: Record<string, string> = {
  on: 'on', off: 'off', open: 'open', closed: 'closed', opening: 'opening', closing: 'closing',
  locked: 'locked', unlocked: 'unlocked', jammed: 'jammed', playing: 'playing', paused: 'paused',
  cleaning: 'cleaning', docked: 'docked', returning: 'returning', disarmed: 'disarmed', armed_home: 'armed (home)',
  armed_away: 'armed (away)', arming: 'arming', triggered: 'triggered', unavailable: 'unavailable',
};
function stateText(e: HassState) {
  const u = e.attributes.unit_of_measurement;
  return `${stateWords[e.state] ?? e.state}${u ? ` ${String(u)}` : ''}`;
}

function detail(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const el = ctx.target;
  el.dataset.title = readings[id]?.get(key)?.ch.name ?? key;
  let last = '';
  const paint = () => {
    const item = readings[id]?.get(key);
    if (!item) return;
    const { ch, r } = item;
    const now = JSON.stringify([r, [...pending.keys()], toast]);
    if (now === last) return;
    last = now;
    if (el.contains(activeElement()) && (activeElement() as HTMLElement).matches('input[type="range"]')) return;
    const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
    let control = '';
    if (r.dial) {
      control = `<label class="slider">${r.dial.label[0].toUpperCase()}${r.dial.label.slice(1)} · <output>${num(r.dial.value)}${r.dial.unit}</output>
        <input type="range" min="${r.dial.min}" max="${r.dial.max}" step="${r.dial.step}" value="${r.dial.value}"></label>`;
    } else if (r.segs) {
      control = `<ul class="switches">${r.segs.map((s, i) => `<li><label class="${pending.has(s.entity) ? 'is-pending' : ''}${
        r.alert?.fail?.includes(i) ? ` fail level-${r.alert.level}` : ''}">
        <input type="checkbox" data-seg="${i}"${s.on ? ' checked' : ''}${s.act ? '' : ' disabled'}> ${esc(s.label)}
        <span class="state">${esc(stateText(ha.states.get(s.entity)!))}</span></label></li>`).join('')}</ul>`;
    }
    const picture = r.camera ? ha.states.get(r.camera)?.attributes.entity_picture : undefined;
    const cam = picture ? ha.url(picture) : '';
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${SYS[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      <p class="detail-big${a ? ` level-${a.level}` : ''}">${esc(a ? a.big : r.big)}</p>
      <p class="detail-label">${esc(a ? a.label : r.label)}</p>
      ${a ? `<p class="detail-why level-${a.level}">${esc(a.why)}. ${a.busy ? `<span class="face-wait">${t.inProgress}</span>`
        : `<button class="primary" data-resolve>${esc(a.verb)}</button>`}</p>` : ''}
      ${toast ? `<p class="error">${esc(toast)}</p>` : ''}
      ${cam ? `<img class="camera" alt="${t.backyardCamera}" src="${esc(cam)}&t=${Date.now() >> 13}">` : ''}
      ${control}
      <details class="entities"><summary>${t.entitiesInHA}</summary><ul>${r.entities.map((e) => {
        const s = ha.states.get(e);
        return s ? `<li><code>${e}</code> <span>${esc(nameOf(ha.states, e))}</span> <strong>${esc(stateText(s))}</strong></li>` : '';
      }).join('')}</ul></details>
    </div>`;
  };
  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type === 'range' && r.dial) {
      hold.set(r.dial.entity, { value: Number(input.value), until: Infinity });
      el.querySelector('output')!.textContent = `${num(Number(input.value))}${r.dial.unit}`;
    }
  });
  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type === 'range' && r.dial) {
      hold.set(r.dial.entity, { value: Number(input.value), until: Date.now() + PENDING_MS });
      void send([r.dial.set(Number(input.value))]);
      input.blur();
    } else if (input.dataset.seg !== undefined) {
      const s = r.segs![Number(input.dataset.seg)];
      if (s.act) void send([s.act]);
    }
  });
  el.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-resolve]')) return;
    const a = readings[id].get(key)?.r.alert;
    if (!a) return;
    if (a.calls.length) void send(a.calls);
    else { ui[id].seen.add(key); repaint(); }
  });
}

// ─── Start ──────────────────────────────────────────────────────────

const app = new Zumly(zumlyOptions({
  board, detail,
  ...Object.fromEntries(ALL.map((id) => [`sys-${id}`, (ctx: ViewContext) => system(ctx, id)])),
}, 'board', canvas));
app.on('afterZoomOut', () => repaint());

// Entities some channel shows: only those enter the change log.
const watched = () => new Set(IDS.flatMap((id) => [...readings[id].values()].flatMap((x) => x.r.entities)));
let loaded = false;

const onStatus = () => {
  if (ha.status === 'signed-out') { loaded = false; log.length = 0; }
  options.onStatus?.(ha.status);
  repaint();
};
const onChange = (changed: HassState[]) => {
  for (const s of changed) { pending.delete(s.entity_id); const h = hold.get(s.entity_id); if (h && h.until !== Infinity) hold.delete(s.entity_id); }
  const fresh = compute();
  if (fresh.length) boardPick = null;
  if (loaded) {
    const w = watched();
    for (const s of changed) {
      if (!w.has(s.entity_id) || s.last_changed !== s.last_updated) continue;
      log.unshift({ at: new Date(), text: `${nameOf(ha.states, s.entity_id)} → ${stateText(s)}`, level: 0, entity: s.entity_id });
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
  if (!loaded && ha.status === 'live') { loaded = true; void start(); }
};

// The source can change (the WebSocket, a demo home): only the current one
// reaches the UI, and everything that was pending is forgotten.
let unsubscribe: (() => void)[] = [];
const subscribe = (src: PulseSource) => {
  unsubscribe.forEach((fn) => fn());
  unsubscribe = [src.onStatus(onStatus), src.onChange(onChange), src.onRegistry(() => repaint())];
};
subscribe(ha);
// The source may already hold states (a card's `hass` arrives before the mount).
compute();
const setSource = (src: PulseSource) => {
  if (src === ha) return;
  ha = src;
  loaded = false;
  log.length = 0;
  pending.clear();
  hold.clear();
  subscribe(src);
  onStatus();
  if (src.states.size) onChange([...src.states.values()]);
};

// Inside the system asked for; on the phone, inside the one that calls the most.
async function start() {
  const first = startId() ?? (PHONE ? [...IDS].sort((a, b) => worst(b) - worst(a))[0] : null);
  if (first) await startInside(app, first, canvas);
}

  return {
    app,
    get source() { return ha; },
    setSource,
    settings,
    setSettings,
    repaint,
    // A source already live at mount time (a card's `hass`) starts as soon as
    // the board is in the DOM; otherwise the first live change starts it.
    ready: app.init().then(() => { if (!loaded && ha.status === 'live') { loaded = true; return start(); } }),
    destroy: () => { unsubscribe.forEach((fn) => fn()); compact.disconnect(); app.destroy(); },
    ui,
    readings: () => readings,
  };
}
