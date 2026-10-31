import Zumly, { type ViewContext } from 'zumly';
import type { Call, Change, HassState, PulseSource, Status } from './source.ts';
import { nameOf, placeOf, spansOf, systems, type Alert, type Channel, type Dial, type Reading } from './model.ts';
import { tune } from './tune.ts';
import {
  DOT_LANES, LANE, LOCK_MS, MAX_TRACKS, MINI_LANES, PHONE, SIZE, STROKE, alertSatellites, backLayer, calmStrip, clockRim, colorArcs, detailFace, detailFit, detailShell,
  dialControls, dots, esc, face, fitFor, hsCss, icon, labelAt, levelColor, listCenter, listControls, monthRing, musicVisual, num, parallax, radialList, ring as drawRing,
  listOf, ringCenter, satColor, SCROLL_VISIBLE, scrollControls, scrollList, setViewToggle, startInside, systemShell, time, timeRing, timeline, turnList, viewToggle, zumlyOptions,
  type ListItem, type RingOptions, type RingReading, type ScrollState,
} from '@zumer/pulse';
import { t } from './strings.ts';

// The radial object over a PulseSource, mounted on an element: the board, one
// view per system and the channel detail, as Zumly views inside `canvas`.
// Readings, alerts and their resolution come from the source; what is shown
// is what it confirmed; until it does, the segment or the dial stays
// "sending". The standalone app (`main.ts`) mounts it on the page with the
// WebSocket or a demo home; the card (`card/`) in its shadow root with the
// `hass` object.

export type BoardMode = 'grid' | 'orbit' | 'layers' | 'list';
export const BOARD_MODES: BoardMode[] = ['grid', 'orbit', 'layers', 'list'];

// What a screen shows: the viewer's choices (the gear on the board), kept in
// the browser. The host's `PulseOptions` are the frame they are made within.
export type PulseSettings = {
  systems?: string[];
  mode?: BoardMode;
  start?: string;
  // Only the entities in these areas (registry ids); nothing set: everywhere.
  areas?: string[];
  // Channels each system does not show: { lights: ['plugs'] }.
  channels?: Record<string, string[]>;
  // The entity a channel follows instead of the first of its kind: { 'lights/brightness': 'light.kitchen' }.
  entities?: Record<string, string>;
  // How the object draws: the dial as a full ring or open at the bottom with its ends; the day ring bare or with hour marks; the style.
  look?: Look;
  // How many systems the Layers view stacks (the rest are named under the object); nothing set: three.
  layers?: number;
};
// The style: the cookbook's four (tokens only), or `ha`, which takes the colors of the Home Assistant theme in force.
export type Theme = 'graphite' | 'ivory' | 'paper' | 'contrast' | 'ha';
export type Look = { dial?: 'full' | 'open'; day?: 'plain' | 'marks'; theme?: Theme };
export const DIALS = ['full', 'open'] as const, DAYS = ['plain', 'marks'] as const, THEMES: Theme[] = ['graphite', 'ivory', 'paper', 'contrast', 'ha'];

export type PulseOptions = {
  source: PulseSource;
  // Which systems the object may show (default: all of model.ts); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Only what is in these areas (registry ids); the gear chooses among them.
  areas?: string[];
  // How the object draws (the gear's defaults): see Look.
  look?: Look;
  // How many systems the Layers view stacks by default; nothing set: all of them.
  layers?: number;
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
const frame = {
  systems: valid(options.systems).length ? valid(options.systems) : ALL, mode: options.mode, start: options.start,
  areas: options.areas?.length ? options.areas : undefined,
  look: options.look,
  layers: options.layers && options.layers >= 1 ? Math.floor(options.layers) : undefined,
};
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
// The areas the gear offers: the registry's, within the frame; and the ones in force.
const frameAreas = () => [...ha.registry.areas.keys()].filter((a) => !frame.areas || frame.areas.includes(a));
const activeAreas = (): string[] | undefined => {
  const offered = frameAreas();
  const chosen = (local.areas ?? []).filter((a) => offered.includes(a));
  return chosen.length ? chosen : frame.areas;
};
const hiddenChannels = (id: string) => {
  const hidden = local.channels?.[id] ?? [];
  // At least one channel: a system with all of them hidden shows all of them.
  return SYS[id].channels.every((ch) => hidden.includes(ch.key)) ? [] : hidden;
};
// The look in force: the viewer's choice over the host's.
const LOOK_DEFAULT: Required<Look> = { dial: 'full', day: 'plain', theme: 'graphite' };
const look = (): Required<Look> => ({ ...LOOK_DEFAULT, ...frame.look, ...local.look });
// The style goes on the root of the tree the object lives in: the page, or the card's host.
const applyTheme = () => {
  const root = canvas.getRootNode();
  const target = root instanceof ShadowRoot ? root.host as HTMLElement : document.documentElement;
  const theme = look().theme;
  if (theme === 'graphite') target.removeAttribute('data-theme'); else target.dataset.theme = theme;
};
// How many layers the Layers view stacks: the viewer's choice, the host's, or
// three (the cookbook's cap: the rest are counted, not drawn).
const LAYERS_DEFAULT = 3;
const layersShown = () => { const n = local.layers ?? frame.layers; return Math.min(IDS.length, n && n >= 1 ? n : LAYERS_DEFAULT); };
const settings = (): PulseSettings => ({ systems: IDS, mode: boardMode, start: startId() ?? undefined,
  areas: activeAreas(), channels: local.channels, entities: local.entities, look: look(), layers: layersShown() });
const setSettings = (patch: PulseSettings) => {
  local = { ...local, ...patch };
  for (const k of Object.keys(local) as (keyof PulseSettings)[]) {
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
  sig: Map<string, string>;            // what each alert says: if it changes, it is no longer seen nor muted
  seen: Set<string>;                   // alerts put off for later (no wave, they go behind, the next one comes through)
  muted: Set<string>;                  // alerts muted (no wave; they stay where they are, in their color)
  inside: string | null;               // with three alerts or more (rule 4), the one opened from the summary
};
const ui: Record<string, Ui> = Object.fromEntries(ALL.map((id) => [id, { pick: null, since: new Map(), sig: new Map(), seen: new Set(), muted: new Set(), inside: null }]));
// The key of the summary layer: with three alerts or more, "N alerts" goes in front.
const SUMMARY = 'summary';
let readings: Record<string, Map<string, { ch: Channel; r: Reading }>> = {};
// Every channel with something to show, hidden ones included: what the gear lists.
let channels: Record<string, { ch: Channel; r: Reading; hidden: boolean }[]> = {};
// Entities with an unconfirmed command, and dial values the user is moving.
const pending = new Map<string, number>();
// Commands Home Assistant refused, by entity: what failed keeps a red outline
// and a Retry until a retry goes through or the entity changes anyway.
const failed = new Map<string, { calls: Call[]; message: string }>();
const hold = new Map<string, { value: number; until: number }>();
const log: { at: Date; text: string; level: number; entity?: string }[] = [];
const rerender = new Set<() => void>();
// A view behind the current one (Zumly keeps it, scaled and blurred) does not
// repaint: Chrome would blur it again on each change. It repaints when it
// comes back to the front.
function whenCurrent(ctx: ViewContext, paint: () => void) {
  let dirty = false;
  const el = ctx.target;
  const run = () => {
    if (el.isConnected && !el.closest('.is-current-view, .is-new-current-view')) { dirty = true; return; }
    dirty = false;
    paint();
  };
  ctx.onActivate(() => { if (dirty) run(); });
  rerender.add(run);
  ctx.onCleanup(() => { rerender.delete(run); });
  return run;
}
let toast = '';

const PENDING_MS = 8000;
// Layered view of the board: seven systems, each layer a bit bigger
// (tune.layerGrow, 16% by default), and the labels of the layers behind spread
// out so they do not overlap.
const LABEL_AT = [300, 30, 330, 60, 280, 80];
// The detail's ring: about 11 px of stroke on its 260 px universe.
const DETAIL_LANES = 1;
// Where each scrolling list of the detail is (first item shown, focus), kept across repaints and visits.
const scrolls = new Map<string, ScrollState>();
const scrollState = (key: string) => { let st = scrolls.get(key); if (!st) { st = { offset: 0, focus: 0 }; scrolls.set(key, st); } return st; };
const scrollOpened = new Set<string>();

const sig = (a: Alert) => `${a.level}|${a.big}|${a.why}`;

// ─── Reading ────────────────────────────────────────────────────────

function compute() {
  const now = Date.now(), fresh: { id: string; key: string; a: Alert }[] = [];
  readings = {};
  channels = {};
  const ctx = { temp: ha.unit, reg: ha.registry, areas: activeAreas() ?? null, picks: local.entities ?? {} };
  for (const sys of IDS.map((id) => SYS[id])) {
    const map = new Map<string, { ch: Channel; r: Reading }>(), u = ui[sys.id], hidden = hiddenChannels(sys.id);
    channels[sys.id] = [];
    for (const ch of sys.channels) {
      const r = ch.read(ha.states, ctx);
      if (!r) continue;
      // A channel that follows an entity takes its name (the model's `name`);
      // the gear lists every channel that has something, hidden or not.
      const named = r.name && r.name !== ch.name ? { ...ch, name: r.name } : ch;
      channels[sys.id].push({ ch: named, r, hidden: hidden.includes(ch.key) });
      if (hidden.includes(ch.key)) continue;
      if (r.dial && r.range) {
        // Each end of a range is held on its own (entity#lo, entity#hi).
        const lo = hold.get(`${r.dial.entity}#lo`), hi = hold.get(`${r.dial.entity}#hi`);
        if (lo && lo.until > now) r.range.lo = lo.value;
        if (hi && hi.until > now) r.range.hi = hi.value;
        r.dial.value = r.range.lo;
      } else if (r.dial) {
        const h = hold.get(r.dial.entity);
        if (h && h.until > now) { r.dial.value = h.value; r.v = (h.value - r.dial.min) / (r.dial.max - r.dial.min); }
      }
      if (r.color) {
        const h = hold.get(`${r.color.entity}#hs`);
        if (h && h.until > now) r.color.hs = [Math.floor(h.value / 1000), h.value % 1000];
      }
      map.set(ch.key, { ch: named, r });
      if (r.alert) {
        if (u.sig.get(ch.key) !== sig(r.alert)) {
          u.seen.delete(ch.key);
          u.muted.delete(ch.key);
          u.sig.set(ch.key, sig(r.alert));
          if (!u.since.has(ch.key)) { u.since.set(ch.key, now); fresh.push({ id: sys.id, key: ch.key, a: r.alert }); }
        }
      } else { u.since.delete(ch.key); u.sig.delete(ch.key); u.seen.delete(ch.key); u.muted.delete(ch.key); if (u.inside === ch.key) u.inside = null; }
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
const failuresOf = (r: Reading) => r.entities.filter((e) => failed.has(e)).map((e) => ({ entity: e, ...failed.get(e)! }));
// The card under the object when something did not go through: what, and a Retry.
const retryCard = (r: Reading) => {
  const f = failuresOf(r);
  if (!f.length) return '';
  const names = f.map((x) => nameOf(ha.states, x.entity));
  return `<span class="errc"><span>${esc(t.didNotRespond(names))}</span>
    <button class="plain" data-retry="${esc(f.map((x) => x.entity).join(' '))}">${t.retry}</button></span>`;
};
const retry = (entities: string) => {
  const calls = entities.split(' ').flatMap((e) => failed.get(e)?.calls ?? []);
  if (calls.length) void send(calls);
};

// ─── Commands to Home Assistant ─────────────────────────────────────

async function send(calls: Call[]) {
  for (const c of calls) {
    const ids = ([] as string[]).concat((c.data.entity_id as string | string[]) ?? []);
    ids.forEach((e) => pending.set(e, Date.now()));
    try {
      await ha.call(c);
      ids.forEach((e) => failed.delete(e));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ids.forEach((e) => { pending.delete(e); hold.delete(e); failed.set(e, { calls: [c], message }); });
      toast = t.haError(message);
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
  applyTheme();
  rerender.forEach((fn) => fn());
}

// ─── Rings ──────────────────────────────────────────────────────────

// `call`: this ring's alert calls (in front and not muted): its failing segments ripple.
// What was sent and not confirmed is marked pending (it beats).
function ring(key: string, r: Reading, lanes: number, controls = false, muted = false, call = false, name?: string, extra: Partial<RingOptions> = {}) {
  return drawRing(key, ringReading(r), lanes, {
    name, controls, muted, call, open: look().dial === 'open',
    pending: (entity) => entity === undefined ? isPending(r) : pending.has(entity),
    failed: (entity) => entity === undefined ? r.entities.some((e) => failed.has(e)) : failed.has(entity),
    ...extra,
  });
}
// The model's reading is the core's, except that a range and the measurement are given in the dial's units.
const frac = (d: Dial, v: number) => Math.min(1, Math.max(0, (v - d.min) / (d.max - d.min)));
function ringReading(r: Reading): RingReading {
  return { ...r, range: r.range && r.dial ? { lo: frac(r.dial, r.range.lo), hi: frac(r.dial, r.range.hi) } : undefined,
    now: r.now != null && r.dial ? frac(r.dial, r.now) : undefined };
}
// A reading's picture, resolved against the source. A camera's snapshot is
// asked again every few seconds (the bucket in the URL): the browser does not cache it.
function imageOf(r: Reading) {
  if (!r.image) return undefined;
  const camera = r.image.entity.startsWith('camera.');
  const src = ha.url(r.image.src);
  return { src: camera ? `${src}${src.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 8192)}` : src, alt: r.image.alt, key: camera ? r.image.entity : undefined };
}

// ─── Board ──────────────────────────────────────────────────────────

// The system as an icon: its front channel's ring on the edge and, inside it,
// the next two as thinner gray rings (the object at a glance, the way the
// cookbook's Mini view draws it). A channel behind that calls keeps its color.
function miniRings(id: string) {
  const u = ui[id];
  return order(id).slice(0, 3).map((k, i) => {
    const { r } = readings[id].get(k)!;
    const calling = !!r.alert && !u.seen.has(k);
    return ring(k, r, MINI_LANES * (i ? 0.55 : 1), false, !calling, false, undefined, { orbit: 12 - 2 * i });
  }).join('');
}

function mini(id: string) {
  const sys = SYS[id], key = order(id)[0];
  if (!key) return '';
  const { ch, r } = readings[id].get(key)!;
  const level = worst(id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${miniRings(id)}</span></span>${visualFor(id, key)}
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !ui[id].seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

// Sound in Media's face: a canvas the visual draws on, when the playing channel is in front.
const visualFor = (id: string, key: string) => id === 'media' && key === 'playing' ? '<canvas class="face-visual" aria-hidden="true"></canvas>' : '';
// Starts the visual on every canvas of a view not drawing yet; returns the stop of them all.
function startVisuals(root: HTMLElement, stops: Map<HTMLCanvasElement, () => void>) {
  for (const [c, stop] of stops) if (!c.isConnected) { stop(); stops.delete(c); }
  for (const c of root.querySelectorAll<HTMLCanvasElement>('canvas.face-visual')) {
    if (stops.has(c)) continue;
    const map = readings.media;
    stops.set(c, musicVisual(c, { level: () => map?.get('volume')?.r.v ?? 0.6, playing: () => !!map?.get('playing')?.r.segs?.some((x) => x.on) }));
  }
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

// Four ways to look at the whole home, over the same data:
// - grid: a mini ring per system (the usual one);
// - orbit: the home's pulse in the center (with the clock's rim: the hours, the latest changes at their minute) and the systems around it;
// - layers: a single object, one system per layer; the one calling the most in front;
// - list: the systems on a ring that turns, like the lists of a watch.
const MODES: [BoardMode, string][] = BOARD_MODES.map((m) => [m, t.modes[m]]);
let boardPick: string | null = null;
// The list: which item is at the top (fractional while it turns). Kept across views.
let listOffset = 0;

// This month of an energy meter, by day (the detail's calendar), asked once
// per meter and kept a while.
const months = new Map<string, { values: (number | null)[]; at: number; error?: boolean }>();
const MONTH_MS = 15 * 60_000;
const monthLoading = new Set<string>();
async function loadMonth(entity: string) {
  if (monthLoading.has(entity) || !ha.statistics) return;
  monthLoading.add(entity);
  try { months.set(entity, { values: await ha.statistics(entity), at: Date.now() }); }
  catch { months.set(entity, { values: [], at: Date.now(), error: true }); }
  monthLoading.delete(entity);
  repaint();
}

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
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${miniRings(id)}</span></span>
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
  // faces its own without rotating the ring. Inside, the clock's rim: the
  // hours, now, and the latest changes as dots at their minute.
  const since = Date.now() - 12 * 3600_000;
  return `<span class="bigbang hub-ring"><span class="gravity-spot">
    <div class="orbit-12" style="--o-size-ratio:.5; --o-gap:30">${segs}</div>
    ${clockRim(log.filter((l) => l.at.getTime() > since).slice(0, 24).map((l) => ({ at: l.at, level: l.level, text: l.text })))}</span></span>`;
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
    <p class="eyebrow">${t.pulse} · ${time(new Date()).slice(0, 5)}</p>
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
  let unbuild: (() => void) | null = null;     // what the built view set up (the list's controls)
  ctx.onCleanup(() => unbuild?.());
  const visuals = new Map<HTMLCanvasElement, () => void>();
  ctx.onCleanup(() => { for (const stop of visuals.values()) stop(); });

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
    if (!['orbit', 'layers'].includes(boardMode) || PHONE || e.pointerType === 'touch') return;
    const b = body.getBoundingClientRect();
    tilt(-((e.clientY - b.top) / b.height - 0.5) * 2 * tune.tilt, ((e.clientX - b.left) / b.width - 0.5) * 2 * tune.tilt);
  });
  body.addEventListener('pointerleave', () => tilt(0, 0));

  const build = () => {
    built = boardMode;
    layers = new Map();
    boardEl.className = `board mode-${boardMode}`;
    drawn.delete(body);
    unbuild?.();
    unbuild = null;
    if (boardMode === 'list') {
      body.innerHTML = `<div class="stage list-stage"><div class="one"></div></div>`;
      const obj = body.querySelector<HTMLElement>('.one')!;
      const turn = (o: number, settled: boolean) => {
        listOffset = o;
        const root = obj.querySelector<HTMLElement>('.radial-list');
        if (!root) return;
        root.classList.toggle('is-turning', !settled);
        const i = turnList(root, o);
        const id = listIds[i];
        if (id) setHTML(root.querySelector<HTMLElement>('.list-center-orbit')!, listCenter(listItem(id)));
      };
      unbuild = listControls(obj, { count: () => listIds.length, offset: () => listOffset, set: (o) => turn(o, false), settle: (o) => turn(o, true) });
    } else if (boardMode === 'orbit') {
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
        <div class="gravity-spot depth outer-perspective"></div></div></div>
        <div class="strip board-strip"></div></div>`;
    } else body.innerHTML = '';
  };

  // One layer per system, all of them by default (the gear or the host can
  // cap it; the rest are named under the object, each a button). The growth
  // per layer shrinks so the outermost always fits, and the spacing is even
  // or bunched behind or in front (tune.layerEase): each layer gets a
  // fractional depth, which Orbit turns into its distance and its size.
  const paintLayers = (all: string[]) => {
    const depth = body.querySelector<HTMLElement>('.depth')!;
    const n = Math.max(1, Math.min(all.length, layersShown()));
    const ids = all.slice(0, n), rest = all.slice(n);
    const grow = n > 1 ? Math.min(tune.layerGrow, 0.96 / (n - 1)) : tune.layerGrow;
    const ease = Math.pow(2, tune.layerEase * 1.5);
    depth.style.setProperty('--o-depth-grow', grow.toFixed(3));
    for (const [id, layer] of layers) if (!ids.includes(id)) { layer.remove(); layers.delete(id); }
    ids.forEach((id, i) => {
      let layer = layers.get(id);
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'gravity-spot layer';
        depth.append(layer);
        layers.set(id, layer);
      }
      const d = n > 1 ? (n - 1) * Math.pow(i / (n - 1), ease) : 0;
      const f = front(id), scale = 1 + grow * d, level = worst(id);
      // Orbit redraws the arcs on any attribute change, even to the same value:
      // only what changed is written.
      if (layer.dataset.depth !== String(i)) layer.dataset.depth = String(i);
      const dz = d.toFixed(3);
      if (layer.style.getPropertyValue('--o-depth') !== dz) layer.style.setProperty('--o-depth', dz);
      // The halo is drawn before Orbit scales the layer: divided by that scale, it reads the same on every layer.
      const halo = (d * tune.layerBlur / (scale * (1 - d * tune.layerStep / 900))).toFixed(2);
      if (layer.style.getPropertyValue('--halo') !== halo) layer.style.setProperty('--halo', halo);
      if (layer.dataset.level !== String(level)) layer.dataset.level = String(level);
      if (layer.classList.contains('layer-front') !== (i === 0)) layer.classList.toggle('layer-front', i === 0);
      if (layer.classList.contains('is-alert') !== level > 0) layer.classList.toggle('is-alert', level > 0);
      const stroke = i === 0 ? 6 : tune.layerStroke;
      setHTML(layer, ring(f.key, f.r, stroke / scale / LANE, false, !level) + (i === 0
        ? face({ glyph: f.ch.glyph, name: SYS[id].title, big: f.big, label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`,
          to: `sys-${id}`, props: { system: id }, aria: t.open(SYS[id].title), extra: visualFor(id, f.key) })
        : backLayer({ text: `${SYS[id].title} · ${f.big}`, at: LABEL_AT[(i - 1) % LABEL_AT.length], grow: scale, stroke, hit: 8,
          pick: { attr: 'data-bpick', value: id, aria: t.bringToFront(SYS[id].title) } })));
    });
    const stage = body.querySelector<HTMLElement>('.board-stage')!;
    const zoom = ids.some((id) => worst(id)) ? 'alert' : 'calm';
    if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
    // Under the object: the systems past the cap, then the latest changes (the headline is the front face).
    setHTML(stage.querySelector<HTMLElement>('.board-strip')!, (rest.length ? `<span class="behind">${t.behind(rest.length)}: ${rest.map((id) =>
      `<button class="more" data-bpick="${id}" aria-label="${esc(t.bringToFront(SYS[id].title))}">${SYS[id].title}</button>`).join(', ')}</span>` : '')
      + log.slice(0, PHONE ? 2 : 3).map((l) => `<span class="tick${l.level ? ` level-${l.level}` : ''}"><time>${time(l.at)}</time> ${esc(l.text)}</span>`).join(''));
  };

  // The list: a system as an item of it, its mini ring and its front reading.
  let listIds: string[] = [];
  const listItem = (id: string): ListItem => {
    const f = front(id);
    return { id, title: SYS[id].title, ring: miniRings(id), glyph: f.ch.glyph, big: f.big,
      label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`, level: worst(id) };
  };
  const paintList = (ids: string[]) => {
    const obj = body.querySelector<HTMLElement>('.list-stage .one')!;
    listIds = ids;
    const items = ids.map(listItem);
    // Only a change of the items redraws; the ring itself turns in place.
    const key = JSON.stringify(items);
    if (drawn.get(obj) === key && obj.firstElementChild) return;
    drawn.set(obj, key);
    obj.innerHTML = radialList(items, listOffset);
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
    } else if (boardMode === 'list') { if (ready) paintList(IDS.filter((id) => ids.includes(id))); }
    else if (ready) paintLayers(ids);
    beat = log[0];
    startVisuals(body, visuals);
    // The latest changes under the grid and the list; the orbit's center and the layers' strip already show them.
    el.querySelector('.ticker')!.innerHTML = !['grid', 'list'].includes(boardMode) ? '' : log.slice(0, PHONE ? 3 : 4).map((l) =>
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
      const target = e.target as HTMLInputElement | HTMLSelectElement, field = target.name, data = new FormData(form);
      if (field === 'systems') {
        const chosen = data.getAll('systems').map(String);
        // At least one system: unchecking the last one does not stick.
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ systems: chosen.length === frame.systems.length ? undefined : chosen });
      } else if (field === 'areas') {
        const chosen = data.getAll('areas').map(String);
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ areas: chosen.length === frameAreas().length ? undefined : chosen });
      } else if (field === 'channel') {
        // The system of the box that changed: its hidden channels are the unticked ones.
        const sysId = String(target.value).split('/')[0];
        const ticked = data.getAll('channel').map(String).filter((v) => v.startsWith(`${sysId}/`)).map((v) => v.split('/')[1]);
        if (!ticked.length) { syncSettings(form); return; }
        const hidden = SYS[sysId].channels.map((ch) => ch.key).filter((k) => !ticked.includes(k));
        const next = { ...local.channels };
        if (hidden.length) next[sysId] = hidden; else delete next[sysId];
        setSettings({ channels: Object.keys(next).length ? next : undefined });
      } else if (field === 'entity') {
        const key = (target as HTMLSelectElement).dataset.key!, value = target.value;
        const next = { ...local.entities };
        if (value && value !== (target as HTMLSelectElement).dataset.default) next[key] = value; else delete next[key];
        setSettings({ entities: Object.keys(next).length ? next : undefined });
      } else if (field === 'mode') {
        const mode = String(data.get('mode')) as BoardMode;
        if (BOARD_MODES.includes(mode)) setSettings({ mode });
      } else if (field === 'start') {
        setSettings({ start: String(data.get('start') ?? '') || undefined });
      } else if (field === 'layers') {
        const n = Number(data.get('layers')) || undefined;
        setSettings({ layers: n === frame.layers ? undefined : n });
      } else if (field === 'dial' || field === 'day' || field === 'theme') {
        const next: Look = { ...local.look, [field]: String(data.get(field)) };
        for (const k of ['dial', 'day', 'theme'] as const) if (next[k] === (frame.look?.[k] ?? LOOK_DEFAULT[k])) delete next[k];
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
  whenCurrent(ctx, paint);
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
      <fieldset class="settings-areas" hidden><legend>${t.areasField}</legend>
        <div class="settings-areas-list"></div>
        <p class="hint">${t.areasHint}</p></fieldset>
      <fieldset class="settings-channels-field"><legend>${t.channelsField}</legend>
        <div class="settings-channels"></div>
        <p class="hint">${t.channelsHint}</p></fieldset>
      <fieldset><legend>${t.boardView}</legend>
        <div class="settings-row">${MODES.map(([m, label]) => `<label><input type="radio" name="mode" value="${m}"> ${label}</label>`).join('')}</div></fieldset>
      <fieldset><legend>${t.openInside}</legend>
        <select name="start" aria-describedby="pulse-settings-start"></select>
        <p class="hint" id="pulse-settings-start">${t.startHint}</p></fieldset>
      <fieldset><legend>${t.layersField}</legend>
        <select name="layers" aria-describedby="pulse-settings-layers"></select>
        <p class="hint" id="pulse-settings-layers">${t.layersHint}</p></fieldset>
      <fieldset><legend>${t.lookField}</legend>
        <div class="settings-row" role="group" aria-label="${t.themeField}"><span class="settings-group-title">${t.themeField}</span>${THEMES.filter((x) => x !== 'ha' || canvas.getRootNode() instanceof ShadowRoot).map((x) =>
          `<label><input type="radio" name="theme" value="${x}"> ${t.themes[x]}</label>`).join('')}</div>
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
function syncSettings(form: HTMLFormElement) {
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="systems"]')) box.checked = IDS.includes(box.value);
  const lk = look();
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="dial"], input[name="day"]')) box.checked = lk[box.name as 'dial' | 'day'] === box.value;
  // Areas, grouped by floor, and the channels of the systems shown: built from
  // the registry and the readings, so only redrawn when they change (the panel
  // repaints with the house; a list rebuilt under the pointer would lose taps).
  const areasField = form.querySelector<HTMLElement>('.settings-areas')!, areasList = areasField.querySelector<HTMLElement>('.settings-areas-list')!;
  const offered = frameAreas();
  areasField.hidden = offered.length < 2;
  const floors = [...ha.registry.floors.values()].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const groups = [...floors.map((f) => ({ title: f.name, areas: offered.filter((a) => ha.registry.areas.get(a)?.floor_id === f.floor_id) })),
    { title: floors.length ? t.noFloor : '', areas: offered.filter((a) => !floors.some((f) => ha.registry.areas.get(a)?.floor_id === f.floor_id)) }]
    .filter((g) => g.areas.length);
  const areasHtml = groups.map((g) => `<div class="settings-group">${g.title ? `<span class="settings-group-title">${esc(g.title)}</span>` : ''}${g.areas.map((a) =>
    `<label><input type="checkbox" name="areas" value="${esc(a)}"> ${esc(ha.registry.areas.get(a)!.name)}</label>`).join('')}</div>`).join('');
  rebuild(areasList, areasHtml);
  const active = activeAreas();
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="areas"]')) box.checked = !active || active.includes(box.value);
  const chList = form.querySelector<HTMLElement>('.settings-channels')!;
  const chHtml = IDS.filter((id) => channels[id]?.length).map((id) => `<div class="settings-group"><span class="settings-group-title">${SYS[id].title}</span>${
    channels[id].map(({ ch, r }) => `<div class="settings-channel"><label><input type="checkbox" name="channel" value="${id}/${ch.key}"> ${esc(ch.name)}</label>${
      r.choices ? `<select name="entity" data-key="${id}/${ch.key}" data-default="${esc(r.choices[0])}" aria-label="${esc(t.entityFor(ch.name))}">${
        r.choices.map((e) => `<option value="${esc(e)}">${esc(nameOf(ha.states, e))}${placeOf(e) && !nameOf(ha.states, e).toLowerCase().includes(placeOf(e)!.toLowerCase()) ? ` · ${esc(placeOf(e)!)}` : ''}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>`).join('');
  rebuild(chList, chHtml);
  form.querySelector<HTMLElement>('.settings-channels-field')!.hidden = !chHtml;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="channel"]')) {
    const [sysId, key] = box.value.split('/');
    box.checked = !channels[sysId]?.find((c) => c.ch.key === key)?.hidden;
  }
  for (const select of form.querySelectorAll<HTMLSelectElement>('select[name="entity"]')) {
    const [sysId, key] = select.dataset.key!.split('/');
    const r = channels[sysId]?.find((c) => c.ch.key === key)?.r;
    if (r?.choice) select.value = r.choice;
  }
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.checked = radio.value === boardMode;
  const select = form.querySelector<HTMLSelectElement>('select[name="start"]')!;
  setHTML(select, `<option value="">${t.theBoard}</option>${IDS.map((id) => `<option value="${id}">${SYS[id].title}</option>`).join('')}`);
  select.value = startId() ?? '';
  const layersSel = form.querySelector<HTMLSelectElement>('select[name="layers"]')!;
  setHTML(layersSel, `<option value="">${t.layersDefault(Math.min(LAYERS_DEFAULT, IDS.length))}</option>${Array.from({ length: Math.max(0, IDS.length - 1) }, (_, i) =>
    `<option value="${i + 2}">${i + 2 === IDS.length ? t.allSystems : i + 2}</option>`).join('')}`);
  const cap = local.layers ?? frame.layers;
  layersSel.value = cap && cap <= IDS.length ? String(cap) : '';
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="theme"]')) radio.checked = radio.value === lk.theme;
}

// ─── Dials: the value moves in place, the command goes out on release ──

type ValueText = { big: string; label: string; sentence: string };
// A dial's state, shared by the system view and the detail: `root` finds the
// markup that holds a channel's dial, `onValue` writes what it says now. The
// command goes out on release (or after a keyboard pause); until the source
// confirms it, the value shown is the one asked for.
function dialBinding(id: string, root: (key: string) => HTMLElement | null, onValue: (key: string, text: ValueText) => void) {
  const dialOf = (key: string) => readings[id].get(key)!.r.dial!;
  // Undefined for a key that is not a channel's (the color sliders "key:hue"
  // and "key:sat" share the dial's gestures): nearest() is asked on every
  // pointerdown, and a throw there would lose the drag.
  const rangeOf = (key: string) => readings[id].get(key)?.r.range;
  const snap = (key: string, v: number) => {
    const dial = dialOf(key);
    const raw = dial.min + Math.min(1, Math.max(0, v)) * (dial.max - dial.min);
    return Math.round(raw / dial.step) * dial.step;
  };
  // Where each end of a range is now (held or read), in the dial's units.
  const endOf = (key: string, handle: string) => {
    const dial = dialOf(key), range = rangeOf(key)!;
    return hold.get(`${dial.entity}#${handle}`)?.value ?? (handle === 'lo' ? range.lo : range.hi);
  };
  const setDial = (key: string, value: number, until = Infinity, handle?: string) => {
    const dial = dialOf(key);
    value = Math.min(dial.max, Math.max(dial.min, value));
    const el = root(key);
    if (handle) {
      // One end never crosses the other.
      const other = endOf(key, handle === 'lo' ? 'hi' : 'lo');
      value = handle === 'lo' ? Math.min(value, other) : Math.max(value, other);
      hold.set(`${dial.entity}#${handle}`, { value, until });
      const lo = endOf(key, 'lo'), hi = endOf(key, 'hi'), fl = frac(dial, lo), fh = frac(dial, hi);
      const band = el?.querySelector<HTMLElement>('.range-band o-arc');
      band?.setAttribute('start', (fl * 100).toFixed(1));
      band?.setAttribute('value', ((fh - fl) * 100).toFixed(1));
      for (const [h, v, f] of [['lo', lo, fl], ['hi', hi, fh]] as const) {
        const knob = el?.querySelector<HTMLElement>(`.knob[data-handle="${h}"]`);
        knob?.parentElement?.style.setProperty('--o-from', `${(f * 360).toFixed(2)}deg`);
        knob?.setAttribute('aria-valuenow', String(v));
        knob?.setAttribute('aria-valuetext', `${num(v)}${dial.unit}`);
      }
      onValue(key, { big: `${num(lo)}–${num(hi)}${dial.unit}`, label: dial.label, sentence: `between ${num(lo)}${dial.unit} and ${num(hi)}${dial.unit}` });
      return value;
    }
    hold.set(dial.entity, { value, until });
    const v = (value - dial.min) / (dial.max - dial.min);
    const ringEl = el?.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(value));
    ringEl?.setAttribute('aria-valuetext', `${num(value)}${dial.unit}`);
    onValue(key, { big: `${num(value)}${dial.unit}`, label: dial.label, sentence: `${dial.label} ${num(value)}${dial.unit}` });
    return value;
  };
  const commit = (key: string) => {
    const dial = dialOf(key), range = rangeOf(key);
    if (range) {
      const lo = hold.get(`${dial.entity}#lo`), hi = hold.get(`${dial.entity}#hi`);
      if (!lo && !hi) return;
      for (const h of [lo, hi]) if (h) h.until = Date.now() + PENDING_MS;
      void send([range.set(lo?.value ?? range.lo, hi?.value ?? range.hi)]);
      return;
    }
    const h = hold.get(dial.entity);
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
    return ((hold.get(d.entity)?.value ?? d.value) - d.min) / (d.max - d.min);
  };
  const stepOf = (key: string) => { const d = dialOf(key); return d.step / (d.max - d.min); };
  // On a range's track, the end nearer to the pointer follows it.
  const nearest = (key: string, v: number) => {
    if (!rangeOf(key)) return undefined;
    const dist = (f: number) => Math.min(Math.abs(f - v), 1 - Math.abs(f - v));
    return dist(fraction(key, 'lo')) <= dist(fraction(key, 'hi')) ? 'lo' : 'hi';
  };
  return { snap, setDial, commit, commitSoon, fraction, stepOf, nearest };
}

// ─── System: the radial object in layers ────────────────────────────

function system(ctx: ViewContext, id: string) {
  ctx.target.dataset.title = SYS[id].title;
  const sys = SYS[id];
  const el = ctx.target;
  let flat = true, locked = false, dragging = false, alertWas = false;
  const visuals = new Map<HTMLCanvasElement, () => void>();
  ctx.onCleanup(() => { for (const stop of visuals.values()) stop(); });

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
  // With three alerts or more (rule 4), "N alerts" goes in front, one segment
  // per alert; from it you open one (it comes in front, the summary waits
  // behind), resolve it and come back.
  const summaryOf = () => {
    const u = ui[id], calling = live(id);
    const summary = calling.length >= 3;
    const inside = summary && u.inside && calling.includes(u.inside) ? u.inside : null;
    if (u.inside && !inside) u.inside = null;
    return { summary, inside, calling };
  };
  const paint = () => {
    if (dragging) return;              // repainting would cut the dial drag
    const ord = order(id), u = ui[id], map = readings[id];
    const { summary, inside, calling } = summaryOf();
    // Repaint only if something of this system changed.
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(map.get(k)!.r)]), [...u.seen], [...u.muted], inside, [...failed.keys()], flat, toast,
      PHONE ? IDS.map((o) => [order(o)[0], worst(o)]) : 0]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement() as HTMLElement | null;
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    // A new alert opens the 3D view; after that the toggle decides.
    const alert = calling.length > 0;
    if (alert && !alertWas) flat = false;
    alertWas = alert;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    refit(alert);
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    setViewToggle(el.querySelector<HTMLElement>('[data-act="view"]')!, flat);

    // The layers front to back: the summary (or the alert opened from it, with the summary right behind), then the channels.
    const keys = summary ? (inside ? [inside, SUMMARY, ...ord.filter((k) => k !== inside)] : [SUMMARY, ...ord]) : ord;
    for (const [key, layer] of layers) if (!keys.includes(key)) { layer.remove(); layers.delete(key); }
    // The alerts that wait (rule 3): satellites on the front ring, their own layers behind in gray.
    const waiting = calling.filter((k) => k !== keys[0]);
    const worstLevel = Math.max(0, ...calling.map((k) => map.get(k)!.r.alert!.level)) as 0 | 1 | 2;
    keys.forEach((key, i) => {
      const layer = layerOf(key);
      const d = Math.min(i, SIZE.length - 1), grow = SIZE[d];
      layer.hidden = i >= SIZE.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.style.setProperty('--halo', (d * 0.8 / (grow * (1 + d * 110 / 900))).toFixed(2));
      if (key === SUMMARY) {
        layer.classList.add('is-alert');
        layer.classList.remove('is-seen', 'is-muted');
        layer.dataset.level = String(worstLevel);
        const names = calling.map((k) => map.get(k)!.ch.name);
        layer.innerHTML = summaryRing(calling.map((k) => ({ key: k, name: map.get(k)!.ch.name, level: map.get(k)!.r.alert!.level })), STROKE[d] / grow / LANE, i === 0) + (i === 0
          ? face({ glyph: 'M4 6h16 M4 12h16 M4 18h10', name: t.alerts, big: t.nAlerts(calling.length), label: listOf(names), act: 'open-worst', aria: t.openWorst })
          : backLayer({ text: t.nAlerts(calling.length), at: labelAt(i), grow, stroke: STROKE[d], hit: 12, pick: { attr: 'data-pick', value: SUMMARY, aria: t.backToAlerts } }));
        return;
      }
      const { ch, r } = map.get(key)!;
      const seen = u.seen.has(key), muted = u.muted.has(key), waits = waiting.includes(key) && i > 0;
      layer.classList.toggle('is-alert', !!r.alert && !waits);
      layer.classList.toggle('is-seen', seen);
      layer.classList.toggle('is-muted', muted);
      layer.dataset.level = String(r.alert?.level ?? 0);
      const shown = r.alert && !seen ? r.alert : r;
      const sats = i === 0 ? alertSatellites(waiting.map((k) => ({ key: k, glyph: map.get(k)!.ch.glyph, level: map.get(k)!.r.alert!.level, aria: t.bringToFront(map.get(k)!.ch.name) }))) : '';
      layer.innerHTML = ring(key, r, STROKE[d] / grow / LANE, i === 0, waits, i === 0 && !!r.alert && !seen && !muted, ch.name) + (i === 0
        ? face({ glyph: ch.glyph, name: ch.name, big: shown.big, label: shown.label, to: 'detail',
          props: { system: id, channel: key }, aria: t.details(ch.name), image: imageOf(r),
          extra: (isPending(r) ? `<span class="face-wait">${t.sending}</span>` : '') + visualFor(id, key) }) + sats
        : backLayer({ text: `${ch.name} · ${shown.big}`, at: labelAt(i), grow, stroke: STROKE[d], hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    startVisuals(el, visuals);

    const frontItem = map.get(ord[0]);
    if (!frontItem) { strip.textContent = t.noEntities; return; }
    const hidden = keys.slice(SIZE.length).filter((k) => k !== SUMMARY).map((k) => ({ key: k, name: map.get(k)!.ch.name }));
    if (dotsEl) {
      dotsEl.innerHTML = dots(IDS.filter((other) => order(other).length).map((other) => {
        const k = order(other)[0];
        return { id: other, title: SYS[other].title, level: worst(other), ring: ring(k, readings[other].get(k)!.r, DOT_LANES) };
      }), id);
    }
    // The strip: what did not go through, an error, the front alert with its
    // actions (the verb; Later sends it behind and lets the next through;
    // Mute stops the wave), or the calm line.
    const frontKey = keys[0] === SUMMARY ? null : keys[0];
    const fi = frontKey ? map.get(frontKey)! : null;
    const fa = fi?.r.alert && !u.seen.has(frontKey!) ? fi.r.alert : null;
    strip.innerHTML = fi && failuresOf(fi.r).length ? retryCard(fi.r)
      : toast ? `<span class="error">${esc(toast)}</span>`
      : keys[0] === SUMMARY ? `<strong>${t.nAlerts(calling.length)}:</strong> ${esc(listOf(calling.map((k) => map.get(k)!.ch.name)))}.`
      : fa && fi ? `<strong>${esc(fi.ch.name)}:</strong> ${esc(fa.why)}.
          ${fa.busy ? `<span class="face-wait">${t.inProgress}</span>` : `<button class="primary level-${fa.level}" data-resolve="${frontKey}">${esc(fa.verb)}</button>
          ${fa.calls.length ? `<button class="plain" data-seen="${frontKey}">${t.later}</button>` : ''}
          ${u.muted.has(frontKey!) ? '' : `<button class="plain" data-mute="${frontKey}">${t.mute}</button>`}`}
          ${waiting.length ? `<span class="how">${t.moreWaiting(waiting.length)}</span>` : ''}`
      : calmStrip(sys.title, fi!.ch.name, hidden);

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };
  // The summary's ring: one segment per alert, in its level's color; in front, each one opens that alert.
  const summaryRing = (list: { key: string; name: string; level: 1 | 2 }[], lanes: number, front: boolean) =>
    `<div class="orbit-12" style="--o-size-ratio:${lanes.toFixed(3)}; --o-gap:24">${list.map((x) => front
      ? `<o-arc class="toggle" style="--o-fill:${levelColor(x.level)}" interactive hit-width="10" role="button" tabindex="0" data-pick="${esc(x.key)}" aria-label="${esc(t.bringToFront(x.name))}"></o-arc>`
      : `<o-arc style="--o-fill:${levelColor(x.level)}"></o-arc>`).join('')}</div>`;

  const focusKey = (target: HTMLElement) => {
    const layer = target.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-seen', 'data-mute', 'data-act']) {
      const v = target.getAttribute(a);
      if (v === null) continue;
      const handle = target.getAttribute('data-handle');
      return `${a === 'data-seg' && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]${handle ? `[data-handle="${handle}"]` : ''}`;
    }
    return null;
  };

  // ─── Direct controls ───
  const d = dialBinding(id, (key) => layers.get(key) ?? null, (key, v) => {
    const label = layers.get(key)?.querySelector('.face-label');
    if (label) label.textContent = v.sentence;
  });
  ctx.onCleanup(dialControls(el, {
    locked: () => locked,
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12:has([data-dial])') ?? null,
    current: d.fraction,
    stepOf: d.stepOf,
    set: (key, v, handle) => d.setDial(key, d.snap(key, v), Infinity, handle),
    nearest: d.nearest,
    onStart: () => { dragging = true; },
    onEnd: (key) => { dragging = false; d.commit(key); },
    onInput: d.commitSoon,
    activate: 'o-arc[data-pick], o-arc[data-seg]',
  }));

  // A camera in the face: its snapshot is asked again every 8 s.
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
    const muteKey = target.closest<HTMLElement>('[data-mute]')?.dataset.mute;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = target.closest<HTMLElement>('[data-go]')?.dataset.go;
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(again); return; }
    if (go) { goSystem(go); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const s = readings[id].get(key)!.r.segs![Number(seg.dataset.seg)];
      if (s.act && !pending.has(s.entity)) void send([s.act]);
      return;
    }
    const u = ui[id], { summary, calling } = summaryOf();
    if (pick === SUMMARY && !locked) { u.inside = null; lock(); }
    else if (pick && !locked) {
      // With the summary in front, a segment or a satellite opens that alert; otherwise the tap brings the channel.
      if (summary && calling.includes(pick)) u.inside = pick; else u.pick = pick;
      lock();
    } else if (resolve) {
      const a = readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.calls.length) void send(a.calls);
      else u.seen.add(resolve);
      lock();
    } else if (seenKey) { u.seen.add(seenKey); u.inside = null; lock(); }
    else if (muteKey) { u.muted.add(muteKey); }
    else if (act === 'open-worst' && !locked) { u.inside = calling[0] ?? null; lock(); }
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
  whenCurrent(ctx, paint);
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

// A day of an entity, once per visit (and again after five minutes).
const histories = new Map<string, { at: number; values: (number | null)[] | null; error?: boolean }>();
const HISTORY_MS = 5 * 60_000;
// A day of changes of a set of entities (the rings of a detail), likewise; keyed by the set.
const changesOf = new Map<string, { at: number; changes: Record<string, Change[]> | null; error?: boolean }>();

function detail(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const el = ctx.target;
  el.dataset.title = readings[id]?.get(key)?.ch.name ?? key;
  // The channel as one radial object: where you are and its entities at the
  // top, the object in the room left, what goes under it, the chips.
  el.innerHTML = detailShell([SYS[id].title, el.dataset.title], t.entities(readings[id]?.get(key)?.r.entities.length ?? 0));
  const stage = el.querySelector<HTMLElement>('.detail-stage')!, objEl = el.querySelector<HTMLElement>('.detail-obj')!;
  const below = el.querySelector<HTMLElement>('.detail-below')!, more = el.querySelector<HTMLElement>('.detail-more')!;
  const entPanel = el.querySelector<HTMLElement>('.entities-panel')!, entSummary = el.querySelector<HTMLElement>('.entities summary')!;
  ctx.onCleanup(detailFit(stage));
  let last = '';
  let live = false, dragging = false;
  // A detail with two objects (the day and the month of an energy meter) shows one at a time.
  let tab: 'day' | 'month' = 'day';
  // The stage's side, for what fits in the center (the alert's cause and actions).
  const side = () => Math.max(200, Math.min(stage.clientWidth, stage.clientHeight) - 44);
  const paint = () => {
    if (dragging) return;              // repainting would cut the drag
    const item = readings[id]?.get(key);
    if (!item) return;
    const { ch, r } = item;
    const history = r.history ? histories.get(r.history) : undefined;
    const trackIds = r.tracks?.length && ha.changes ? r.tracks.map((x) => x.entity).join(' ') : '';
    const changes = trackIds ? changesOf.get(trackIds) : undefined;
    const monthOf = r.month ? months.get(r.month) : undefined;
    const now = JSON.stringify([r, [...pending.keys()], [...failed.keys()], toast, live, tab, history?.values?.length ?? history?.error,
      changes?.at ?? changes?.error, monthOf?.at, ha.states.get(r.events?.[0]?.entity ?? '')?.last_changed, look(), ui[id].seen.has(key), side()]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement();
    const focusSel = focus && el.contains(focus) && focus.matches('[data-dial], [data-seg], [data-tab]')
      ? focus.matches('[data-dial]') ? `[data-dial="${focus.dataset.dial}"]${focus.dataset.handle ? `[data-handle="${focus.dataset.handle}"]` : ''}`
      : focus.matches('[data-seg]') ? `[data-seg="${focus.dataset.seg}"]` : `[data-tab="${focus.dataset.tab}"]` : null;
    const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
    el.dataset.title = ch.name;
    el.querySelector<HTMLElement>('.crumb span:last-child')!.textContent = ch.name;
    entSummary.textContent = t.entities(r.entities.length);

    // The alert's actions: the verb, and Later (the alert goes behind) when the verb does something.
    const acts = a ? (a.busy ? `<span class="face-wait">${t.inProgress}</span>`
      : `<button class="primary pill level-${a.level}" data-resolve>${esc(a.verb)}</button>${a.calls.length ? `<button class="plain pill" data-seen>${t.later}</button>` : ''}`) : '';
    // The rings of the day, when there are: fewer around a dial, so the dial keeps its room.
    const tracks = trackIds ? Math.min(r.tracks!.length, r.dial ? 4 : MAX_TRACKS) : 0;
    const rings = !!trackIds && !!changes?.changes;
    // How big the center is, as a share of the object; the cause and the
    // actions go inside only when it has the room, else under the object.
    const centerShare = rings ? (2 * (11.5 - tracks) - 0.8) / 24 * (r.dial ? (r.color ? 13 : 18) / 24 : 1)
      : r.history && ha.history ? 9 / 24 : r.list ? 9 / 24 : r.dial ? (r.color ? 13 : 18) / 24 : 19 / 24;
    const inFace = !!a && !PHONE && a.level !== 2 && centerShare * side() >= 250;
    const faceExtra = (inFace ? `<span class="face-why">${esc(a!.why)}</span><span class="face-acts">${acts}</span>` : '') + visualFor(id, key);
    const image = r.image ? (() => {
      const stream = r.image!.entity.startsWith('camera.') ? ha.stream?.(r.image!.entity) : undefined;
      const img = imageOf(r)!;
      return { src: live && stream ? stream : img.src, alt: img.alt, key: img.key && !live ? img.key : undefined };
    })() : undefined;
    const faceOf = (big: string, label: string) => detailFace({ name: ch.name, big, label, level: a?.level, image, extra: faceExtra });
    const face = faceOf(a ? a.big : r.big, a ? a.label : r.label);

    // The dial, big, operated like the system's front ring (its knob says the
    // value, the measurement is marked, a scale inside), what is now in its
    // center; a light's hue and saturation as curved sliders inside it, the
    // center washed with the color. A universe of its own: alone, or in the
    // center of the day's rings.
    let object: string;
    const dialUniverse = () => {
      const color = r.color?.hs ? hsCss(r.color.hs[0], r.color.hs[1]) : undefined;
      const value = r.range ? `${num(r.range.lo)}–${num(r.range.hi)}${r.dial!.unit}` : `${num(r.dial!.value)}${r.dial!.unit}`;
      return `<div class="bigbang detail-ring"><div class="gravity-spot">${ring(key, r, DETAIL_LANES, true, false, false, ch.name, { knobText: true, nowText: true, ticks: !r.color })}${
        r.color ? colorArcs(key, r.color.hs, { open: look().dial === 'open', name: ch.name }) : ''}${
        ringCenter(value, a ? a.label : r.dial!.label, r.color ? 13 : 18, color, { name: ch.name, level: a?.level, extra: faceExtra })}</div></div>`;
    };
    const center = r.dial ? `<div class="capsule dial-center">${dialUniverse()}</div>` : face;
    if (r.list) {
      // A long choice: its options scrolled in a circle, what is chosen in the center; the list opens at the one that is on.
      const sk = `${id}/${key}`, st = scrollState(sk), on = r.list.findIndex((x) => x.on);
      if (!scrollOpened.has(sk) && on >= 0) { st.focus = on; st.offset = Math.max(0, Math.min(r.list.length - SCROLL_VISIBLE, on - 3)); scrollOpened.add(sk); }
      object = scrollList(r.list.map((x) => ({ label: x.label, on: x.on, act: !!x.act })), st, { key: sk, name: r.name ?? ch.name, center: face });
      if (r.entities.some((e) => pending.has(e))) object = object.replace('class="bigbang detail-ring scroll-list"', 'class="bigbang detail-ring scroll-list is-pending"');
    } else if (trackIds) {
      // The last 24 hours: a ring per entity (what was on, when), named in a
      // wedge after now, with what is now (or the dial) in the center. Until
      // the day arrives, the channel's own ring.
      if (!changes || (Date.now() - changes.at > HISTORY_MS && changes.changes)) void loadChanges(trackIds, r.tracks!.map((x) => x.entity));
      const list = changes?.changes;
      object = list ? timeline({
        hours: 24, maxTracks: tracks,
        tracks: r.tracks!.map((x) => ({ key: x.entity, name: nameOf(ha.states, x.entity), spans: spansOf(list[x.entity] ?? [], x.on),
          on: x.on(ha.states.get(x.entity)?.state ?? ''), tone: x.tone, act: !!x.act, pending: pending.has(x.entity), failed: failed.has(x.entity) })),
        events: (r.events ?? []).map((ev) => ({ ago: (Date.now() - Date.parse(ha.states.get(ev.entity)?.last_changed ?? '')) / 3_600_000, text: ev.text, tone: ev.tone }))
          .filter((ev) => Number.isFinite(ev.ago)),
        big: a ? a.big : r.big, label: a ? a.label : r.label, marks: true, names: true, aria: t.dayOf(ch.name), center,
      }) : r.dial ? dialUniverse() : ownRing(key, r, ch.name, !!a, face);
    } else if (r.history && ha.history && (tab === 'day' || !r.month)) {
      // A numeric entity's day as one ring of bars, the face in the center.
      if (!history || (Date.now() - history.at > HISTORY_MS && history.values)) void loadHistory(r.history);
      const u = String(ha.states.get(r.history)?.attributes.unit_of_measurement ?? '');
      object = history?.values ? timeRing({ values: history.values, label: t.last24h, unit: u === '%' || !u ? u : ` ${u}`, marks: look().day === 'marks',
        center: (range) => faceOf(a ? a.big : r.big, a ? a.label : `${range} · ${t.last24h}`) })
        : ownRing(key, r, ch.name, !!a, face);
    } else if (r.month && ha.statistics && tab === 'month') {
      // This month, a day per sector around: an energy meter's calendar.
      if (!monthOf || (Date.now() - monthOf.at > MONTH_MS)) void loadMonth(r.month);
      const nowD = new Date(), days = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate(), today = nowD.getDate();
      const values = monthOf?.values.length === days ? monthOf.values : Array.from({ length: days }, () => null);
      const title = nowD.toLocaleDateString('en', { month: 'long', year: 'numeric' }), v = values[today - 1], name = nameOf(ha.states, r.month);
      object = monthOf?.error ? ownRing(key, r, ch.name, !!a, face) : monthRing({ days, today, values, unit: ' kWh', title, aria: t.monthAria(name, title),
        big: v != null ? `${num(v)} kWh` : monthOf ? '—' : t.loadingMonth, label: `${t.today} · ${name}` });
    } else if (r.dial) {
      object = dialUniverse();
    } else {
      object = ownRing(key, r, ch.name, !!a, face);
    }
    setHTML(objEl, object);

    // Under the object: a critical alert, or one that did not fit in the
    // face; a refused command with its Retry; an error.
    const alertBelow = a && !inFace ? `<p class="alert-t level-${a.level}">${esc(a.big)}</p><p class="why2">${esc(a.why)}.</p><div class="row">${acts}</div>` : '';
    setHTML(below, alertBelow + (failuresOf(r).length ? `<p class="detail-fail">${retryCard(r)}</p>` : toast ? `<p class="error">${esc(toast)}</p>` : ''));

    // Further down: the day and the month as tabs when there are both; the
    // segments as chips (switches, or the options of a choice as radios);
    // a camera's live stream.
    const tabs = r.history && r.month && ha.statistics ? `<div class="detail-tabs" role="group" aria-label="${t.period}">${(['day', 'month'] as const).map((x) =>
      `<button type="button" data-tab="${x}" aria-pressed="${tab === x}">${t.periods[x]}</button>`).join('')}</div>` : '';
    const stream = r.image?.entity.startsWith('camera.') ? ha.stream?.(r.image.entity) : undefined;
    const liveBtn = stream ? `<button class="plain pill" data-live aria-pressed="${live}">${live ? t.snapshot : t.live}</button>` : '';
    const chips = r.segs && !r.list ? `<ul class="chips${r.kind === 'c' ? ' choice' : ''}" role="${r.kind === 'c' ? 'radiogroup' : 'group'}" aria-label="${esc(ch.name)}">${r.segs.map((s, i) => {
      const isPend = pending.has(s.entity), isFail = failed.has(s.entity);
      const state = isPend ? t.sending : isFail ? t.noAnswer : r.kind === 'c' ? '' : stateText(ha.states.get(s.entity)!);
      const cls = ['chip', s.on ? 'on' : 'off', isPend && 'is-pending', isFail && 'is-failed', !s.act && 'is-still', r.alert?.fail?.includes(i) && `fail level-${r.alert.level}`].filter(Boolean).join(' ');
      return `<li><button type="button" class="${cls}" role="${r.kind === 'c' ? 'radio' : 'switch'}" aria-checked="${s.on}" data-seg="${i}"${s.act ? '' : ' aria-disabled="true"'}>
        <span class="cn">${esc(s.label)}</span>${state ? `<span class="cs">${esc(state)}</span>` : ''}</button></li>`;
    }).join('')}</ul>` : '';
    setHTML(more, tabs + liveBtn + chips);
    setHTML(entPanel, `<ul>${r.entities.map((e) => {
      const s = ha.states.get(e);
      return s ? `<li><code>${e}</code> <span>${esc(nameOf(ha.states, e))}</span> <strong>${esc(stateText(s))}</strong></li>` : '';
    }).join('')}</ul>`);
    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };
  // The channel's own ring, big, operated like the front layer's: the same disc, closer.
  const ownRing = (k: string, r: Reading, name: string, call: boolean, face: string) =>
    `<div class="bigbang detail-ring"><div class="gravity-spot">${ring(k, r, DETAIL_LANES, true, false, call, name)}
      <div class="orbit-0" style="--o-size-ratio:19"><div class="satellite at-center">${face}</div></div></div></div>`;
  const loadChanges = (k: string, entities: string[]) => {
    const was = changesOf.get(k);
    changesOf.set(k, { at: Date.now(), changes: was?.changes ?? null });
    return ha.changes!(entities, 24).then(
      (changes) => { changesOf.set(k, { at: Date.now(), changes }); paint(); },
      () => { changesOf.set(k, { at: Date.now(), changes: null, error: true }); paint(); });
  };
  const loadHistory = (entity: string) => {
    const was = histories.get(entity);
    histories.set(entity, { at: Date.now(), values: was?.values ?? null });
    return ha.history!(entity, 24).then(
      (values) => { histories.set(entity, { at: Date.now(), values: values.some((v) => v != null) ? values : null, error: !values.some((v) => v != null) }); paint(); },
      () => { histories.set(entity, { at: Date.now(), values: null, error: true }); paint(); });
  };
  // A camera's snapshot, refreshed like the face's.
  const refresh = window.setInterval(() => {
    const img = el.querySelector<HTMLImageElement>('.detail-face img[data-image]');
    const r = readings[id]?.get(key)?.r, next = r && imageOf(r);
    if (img && next && img.src !== next.src) img.src = next.src;
  }, 8000);
  ctx.onCleanup(() => clearInterval(refresh));
  // The stage was measured after the first paint: what fits in the center may change.
  const refit = new ResizeObserver(() => paint());
  refit.observe(stage);
  ctx.onCleanup(() => refit.disconnect());
  const visuals = new Map<HTMLCanvasElement, () => void>();
  ctx.onCleanup(() => { for (const stop of visuals.values()) stop(); });
  paint();
  startVisuals(el, visuals);
  whenCurrent(ctx, () => { paint(); startVisuals(el, visuals); });

  // ─── The dial and the color arcs: they move in place; the command goes out on release ───
  const d = dialBinding(id, () => el.querySelector<HTMLElement>('.detail-ring'), (_key, v) => {
    const big = el.querySelector('.detail-ring .ring-big');
    if (big) big.textContent = v.big;
    const knob = el.querySelector('.detail-ring .knob.has-text:not([data-handle]) .knob-text');
    if (knob) knob.textContent = v.big;
    for (const h of el.querySelectorAll<HTMLElement>('.detail-ring .knob[data-handle] .knob-text')) h.textContent = h.closest('.knob')!.getAttribute('aria-valuetext') ?? '';
  });
  const isHue = (k: string) => k.endsWith(':hue'), isSat = (k: string) => k.endsWith(':sat'), isColor = (k: string) => isHue(k) || isSat(k);
  const hsOf = (): [number, number] => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.entity}#hs`);
    // A white light has no hue yet: the sliders start from a full red, not from white.
    return h ? [Math.floor(h.value / 1000), h.value % 1000] : r.color!.hs ?? [0, 100];
  };
  let colorTimer = 0;
  const sendColor = () => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.entity}#hs`);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    const [hue, sat] = [Math.floor(h.value / 1000), h.value % 1000];
    void send([r.color!.set(hue, sat)]);
  };
  // The knob follows; the saturation arcs take the hue; the center takes the color.
  const setColor = (what: 'hue' | 'sat', v: number) => {
    const r = readings[id].get(key)!.r, [h0, s0] = hsOf();
    const h = what === 'hue' ? Math.round(v * 360) % 360 : h0, sat = what === 'sat' ? Math.round(v * 100) : s0;
    // One number holds both: hue × 1000 + saturation.
    hold.set(`${r.color!.entity}#hs`, { value: h * 1000 + sat, until: Infinity });
    const root = el.querySelector<HTMLElement>('.detail-ring');
    if (!root) return;
    const place = (w: 'hue' | 'sat', fraction: number, value: number, color: string) => {
      const grab = root.querySelector<HTMLElement>(`[data-dial="${key}:${w}"]`), knob = root.querySelector<HTMLElement>(`.${w}-knob`);
      if (!grab || !knob) return;
      const cs = getComputedStyle(grab), from = parseFloat(cs.getPropertyValue('--o-from')) || 0, range = parseFloat(cs.getPropertyValue('--o-range')) || 360;
      knob.parentElement!.style.setProperty('--o-from', `${(from + fraction * range).toFixed(2)}deg`);
      knob.style.background = color;
      grab.setAttribute('aria-valuenow', String(value));
    };
    place('hue', h / 360, h, `hsl(${h} 100% 50%)`);
    place('sat', sat / 100, sat, hsCss(h, sat));
    if (what === 'hue') root.querySelectorAll<HTMLElement>('.sat-ring o-arc').forEach((arc, i) => arc.style.setProperty('--o-fill', satColor(h, i)));
    for (const x of root.querySelectorAll('.hue-ring, .sat-ring')) x.classList.remove('is-unset');
    const center = root.querySelector<HTMLElement>('.ring-center');
    if (center) { center.classList.add('has-color'); center.style.setProperty('--c', hsCss(h, sat)); }
  };
  ctx.onCleanup(dialControls(el, {
    locked: () => false,
    ringOf: (k) => { const x = el.querySelector<HTMLElement>(`[data-dial="${k}"]`); return x ? (x.classList.contains('ring-grab') ? x : x.parentElement) : null; },
    current: (k, handle) => isHue(k) ? hsOf()[0] / 360 : isSat(k) ? hsOf()[1] / 100 : d.fraction(k, handle),
    stepOf: (k) => isHue(k) ? 5 / 360 : isSat(k) ? 0.05 : d.stepOf(k),
    set: (k, v, handle) => { if (isHue(k)) setColor('hue', v); else if (isSat(k)) setColor('sat', v); else d.setDial(k, d.snap(k, v), Infinity, handle); },
    nearest: (k, v) => (isColor(k) ? undefined : d.nearest(k, v)),
    onStart: () => { dragging = true; },
    onEnd: (k) => { dragging = false; if (isColor(k)) sendColor(); else d.commit(k); },
    onInput: (k) => { if (isColor(k)) { clearTimeout(colorTimer); colorTimer = window.setTimeout(sendColor, 500); } else d.commitSoon(k); },
    activate: 'o-arc[data-seg]',
  }));

  ctx.onCleanup(scrollControls(el, {
    state: scrollState,
    count: () => readings[id].get(key)?.r.list?.length ?? 0,
    pick: (_, i) => { const x = readings[id].get(key)?.r.list?.[i]; if (x?.act && !pending.has(x.entity)) void send([x.act]); },
  }));

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const r = readings[id]?.get(key)?.r;
    if (!r) return;
    const tabBtn = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as 'day' | 'month' | undefined;
    if (tabBtn) { tab = tabBtn; paint(); return; }
    if (target.closest('[data-live]')) { live = !live; paint(); return; }
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(again); return; }
    // A segment: a chip under the object, or the arc on the channel's own ring.
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg) {
      const s = r.segs?.[Number(seg.dataset.seg)];
      if (s?.act && !pending.has(s.entity)) void send([s.act]);
      return;
    }
    const track = target.closest<HTMLElement>('[data-track]')?.dataset.track;
    if (track) {
      const x = r.tracks?.find((y) => y.entity === track);
      if (x?.act && !pending.has(track)) void send([x.act]);
      return;
    }
    if (target.closest('[data-seen]')) { ui[id].seen.add(key); repaint(); return; }
    if (!target.closest('[data-resolve]')) return;
    const a = r.alert;
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
  for (const s of changed) { pending.delete(s.entity_id); failed.delete(s.entity_id); const h = hold.get(s.entity_id); if (h && h.until !== Infinity) hold.delete(s.entity_id); }
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
