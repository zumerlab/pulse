import Zumly, { type ViewContext } from 'zumly';
import type { Action, Alert, Changed, Channel, CodeFormat, Dial, PulseHost, Reading, StateChange, Status, System } from './model.ts';
import { spansOf } from './history.ts';
import { CONTROLS, DEFAULTS, GROUPS, fmt, resetTune, setTune, tune, tuneText, tuned, type Tune, type TuneGroup } from './tune.ts';
import {
  DOT_LANES, LANE, LOCK_MS, MAX_TRACKS, MINI_LANES, PHONE, STACK_MAX, backLayer, calmStrip, colorArcs, dialControls, dots, esc, face,
  fitFor, hsCss, icon, keypad, labelAt, layerIndex, monthRing, musicVisual, parallax, ring as drawRing, ringCenter, satColor, sizes, strokeAt,
  SCROLL_VISIBLE, scrollControls, scrollList, setViewToggle, startInside, systemShell, timeRing, timeline, viewToggle, zumlyOptions,
  type ListItem, type RingReading, type ScrollState,
  orbitHub, queueRings, timeWindow, zoomOutGestures, type HubLook, type HubNews, type TimeMark,
} from './radial.ts';
import { DEFAULT_THEME, THEMES, THEME_NAMES, applyColors, applyTheme, type Theme, type ThemeName } from './themes.ts';
import { localeOf, num, setLocale, t as T, time } from './i18n.ts';

// The radial object over a PulseHost, mounted on an element: the board, one
// view per system, the channel detail and the changes of the last hours, as
// Zumly views inside `canvas`. Readings, alerts and their resolution come
// from the host; what is shown is what it confirmed; until it does, the
// segment or the dial stays "sending". The board knows nothing about where
// the data comes from: a host hands it systems whose channels read into
// Readings, and runs the actions handed back. A shell (an app's page, a
// card's shadow root) mounts it and passes its own words for the host's things.

export type BoardMode = 'grid' | 'orbit' | 'layers' | 'list';
export const BOARD_MODES: BoardMode[] = ['grid', 'orbit', 'layers', 'list'];
// The axis the board groups by: its systems, or the host's groups (the rooms
// of a home, each with the systems' channels read within it; see PulseHost.byGroup).
export type Axis = 'systems' | 'groups';
export const AXES: Axis[] = ['systems', 'groups'];

// What a screen shows: the viewer's choices (the gear on the board), kept in
// the browser. The shell's `BoardOptions` are the frame they are made within.
export type BoardSettings = {
  systems?: string[];
  mode?: BoardMode;
  // The board grouped by system or by group.
  axis?: Axis;
  start?: string;
  // Only the things in these groups (the host's ids); nothing set: everywhere.
  groups?: string[];
  // Channels each system does not show: { lights: ['plugs'] }.
  channels?: Record<string, string[]>;
  // The thing a channel follows instead of the first of its kind: { 'lights/brightness': 'light.kitchen' }.
  picks?: Record<string, string>;
  // How the object draws: the dial as a full ring or open at the bottom with its ends; the day ring bare or with hour marks.
  look?: Look;
  // How many systems the Layers view stacks (the rest are named under the object); nothing set: all of them.
  layers?: number;
  // How many channels a system stacks as layers (the rest are named under the object); nothing set: three (two on a phone).
  stack?: number;
  // The calm systems shown even while something calls (folded by default).
  calm?: 'open';
};
// time: what the orbit's center shows of time (nothing; the changes of the last 12 h on its ring; the clock and the
// day while all is calm; or both). month: the energy month as a calendar (the 1st at the top) or the last 30 days (today at the top).
// theme: one of the object's, or 'custom' with the viewer's own colors (`colors`, over the default theme's).
export type Look = { dial?: 'full' | 'open'; day?: 'plain' | 'marks'; ends?: 'flat' | 'rounded'; theme?: ThemeName | 'custom';
  colors?: Partial<Theme>; time?: 'off' | 'changes' | 'clock' | 'both'; month?: 'calendar' | 'rolling';
  // The switch between grid, orbit, layers and list on the board itself (the gear always has it).
  modes?: 'shown' | 'hidden';
  // The ground behind everything: the theme's flat color, a glow (a spherical gradient of `glow` into the ground),
  // or a photo (`photo`: an address, or 'upload' for the one chosen in this browser), dimmed toward the ground and blurred.
  ground?: 'flat' | 'glow' | 'photo'; glow?: string; photo?: string; dim?: number; blur?: number;
  // Over a glow or a photo, the faces of the systems: solid, or glass (see-through and blurred).
  faces?: 'solid' | 'glass' };

type LookFull = Required<Omit<Look, 'colors'>> & Pick<Look, 'colors'>;
// The gear's tabs.
export const SETTINGS_TABS = ['content', 'board', 'look', 'tune'] as const;
type Tab = typeof SETTINGS_TABS[number];
const COLOR_KEYS: (keyof Theme)[] = ['bg', 'ink', 'muted', 'dim', 'line', 'minor', 'critical'];
// A theme as a small disc: its ground, a ring at rest, its text and its two alerts.
const swatch = (c: Theme) => `<span class="theme-disc" aria-hidden="true" style="--sw-bg:${c.bg};--sw-ink:${c.ink};--sw-dim:${c.dim};--sw-minor:${c.minor};--sw-critical:${c.critical}"><i></i><i></i><i></i></span>`;
export const DIALS = ['full', 'open'] as const, DAYS = ['plain', 'marks'] as const, ENDS = ['flat', 'rounded'] as const;
export const GROUNDS = ['flat', 'glow', 'photo'] as const, FACES = ['solid', 'glass'] as const;
export const TIMES = ['off', 'changes', 'clock', 'both'] as const, MONTHS = ['calendar', 'rolling'] as const;
const LOOK_DEFAULT: LookFull = { dial: 'full', day: 'plain', ends: 'flat', theme: DEFAULT_THEME, time: 'off', month: 'calendar', modes: 'hidden',
  ground: 'flat', glow: '#4f7cac', photo: '', dim: 0.45, blur: 0, faces: 'glass' };

export type Strings = typeof T;

export type BoardOptions = {
  host: PulseHost;
  // Which systems the object may show (default: all of the host's); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // The board grouped by system (default) or by group, until the viewer picks the other.
  axis?: Axis;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Only what is in these groups (the host's ids); the gear chooses among them.
  groups?: string[];
  // How the object draws (the gear's defaults): see Look.
  look?: Look;
  // How many systems the Layers view stacks by default; nothing set: all of them.
  layers?: number;
  // How many channels a system stacks as layers by default; nothing set: three (two on a phone).
  stack?: number;
  // Where the viewer's choices are kept: a localStorage key (default
  // 'pulse-settings'); `false` hides the gear and keeps nothing.
  settings?: string | false;
  // The connection line of the board (HTML); the shell decides what it says.
  status?: () => string;
  // A button with `data-action` in that line was pressed.
  onAction?: (action: string) => void;
  // A way out of the host (sign out, leave the demo): an icon next to the gear, `data-action="signout"`.
  exit?: () => string | null;
  onStatus?: (status: Status) => void;
  // The shell's words over the object's (what the host calls its things, its groups, its errors).
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
// The systems by id: the host's, and its groups as systems once it names them
// (see groups()). Another host (setHost) brings its own channels, bound to its
// data, under the same ids.
const SYS: Record<string, System> = Object.fromEntries(host.systems.map((s) => [s.id, s]));
const ALL = host.systems.map((s) => s.id);
const valid = (ids?: string[]) => (ids ?? []).filter((id) => ALL.includes(id));

// The frame: what the shell (a card's config, the page's URL) allows. The
// viewer chooses within it with the gear; that choice is kept per browser.
const frame = {
  systems: valid(options.systems).length ? valid(options.systems) : ALL, mode: options.mode, start: options.start,
  axis: options.axis && AXES.includes(options.axis) ? options.axis : undefined,
  groups: options.groups?.length ? options.groups : undefined,
  look: options.look,
  layers: options.layers && options.layers >= 1 ? Math.floor(options.layers) : undefined,
  stack: options.stack && options.stack >= 1 ? Math.floor(options.stack) : undefined,
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
// The systems chosen (the gear within the frame): the board on the systems
// axis, and what each group's object is made of on the groups axis.
let CHOSEN: string[] = [];
let boardMode: BoardMode = 'grid';
let axis: Axis = 'systems';
// The host's groups as systems: built again when the host or the choices
// change, and each gets its view (sys-<group>) the first time.
const groupSystems = () => {
  const list = host.byGroup?.(CHOSEN, (sys, ch) => hiddenChannels(sys).includes(ch), t.noGroup) ?? [];
  for (const g of list) { SYS[g.id] = g; if (!views[`sys-${g.id}`]) views[`sys-${g.id}`] = (ctx: ViewContext) => system(ctx, g.id); }
  return list.map((g) => g.id);
};
const defined = <T extends object>(o?: T) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
const look = (): LookFull => ({ ...LOOK_DEFAULT, ...defined(frame.look), ...defined(local.look) });
const applySettings = () => {
  const chosen = valid(local.systems).filter((id) => frame.systems.includes(id));
  CHOSEN = chosen.length ? chosen : frame.systems;
  axis = host.byGroup && local.axis && AXES.includes(local.axis) ? local.axis : host.byGroup && frame.axis ? frame.axis : 'systems';
  if (axis === 'groups') {
    // The groups within the ones in force; the object of what is in no group only when none is chosen.
    const within = activeGroups();
    IDS = groupSystems().filter((id) => !within || within.includes(groupOf(id)));
  } else IDS = CHOSEN;
  boardMode = local.mode && BOARD_MODES.includes(local.mode) ? local.mode : frame.mode ?? 'grid';
  const theme = local.look?.theme ?? frame.look?.theme;
  if (theme === 'custom') applyColors(canvas, { ...frame.look?.colors, ...local.look?.colors });
  else applyTheme(canvas, theme && THEME_NAMES.includes(theme) ? theme : DEFAULT_THEME);
  applyGround();
};
// The ground: on the mount as --backdrop (each view paints it, so it zooms with the view).
const PHOTO_KEY = STORE ? `${STORE}-photo` : null;
const uploadedPhoto = () => { try { return PHOTO_KEY ? localStorage.getItem(PHOTO_KEY) ?? '' : ''; } catch { return ''; } };
const cssUrl = (u: string) => `url("${u.replace(/["\\\n]/g, (c) => encodeURIComponent(c))}")`;
function applyGround() {
  const lk = look(), st = canvas.style;
  const src = lk.ground === 'photo' ? (lk.photo === 'upload' ? uploadedPhoto() : lk.photo) : '';
  const ground = lk.ground === 'glow' || (lk.ground === 'photo' && src) ? lk.ground : 'flat';
  canvas.dataset.ground = ground;
  canvas.dataset.faces = ground === 'flat' ? 'flat' : lk.faces;
  if (ground === 'flat') { for (const k of ['--backdrop', '--backdrop-blur']) st.removeProperty(k); return; }
  const veil = (p: number) => `color-mix(in srgb, var(--bg) ${Math.round(p * 100)}%, transparent)`;
  st.setProperty('--backdrop', ground === 'glow'
    ? `radial-gradient(130% 130% at 32% 22%, color-mix(in srgb, ${lk.glow} 62%, var(--bg)) 0%, color-mix(in srgb, ${lk.glow} 26%, var(--bg)) 36%, var(--bg) 78%)`
    : `linear-gradient(${veil(lk.dim)}, ${veil(lk.dim)}), ${cssUrl(src)} center / cover no-repeat, var(--bg)`);
  st.setProperty('--backdrop-blur', `${ground === 'photo' ? lk.blur : 0}px`);
}
// A photo from this browser: at most 1920 px on its long side, as a JPEG, kept apart from the settings.
async function keepPhoto(file: File): Promise<boolean> {
  if (!PHOTO_KEY) return false;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55]) {
      try { localStorage.setItem(PHOTO_KEY, c.toDataURL('image/jpeg', q)); return true; } catch { /* too big: try smaller */ }
    }
    return false;
  } catch { return false; } finally { URL.revokeObjectURL(url); }
}
const startId = () => { const id = local.start ?? frame.start; return id && IDS.includes(id) ? id : null; };
// The groups the gear offers: the host's, within the frame; and the ones in force.
const hostGroups = () => host.groups?.() ?? [];
const frameGroups = () => hostGroups().flatMap((g) => g.items.map((i) => i.id)).filter((a) => !frame.groups || frame.groups.includes(a));
const activeGroups = (): string[] | undefined => {
  const offered = frameGroups();
  const chosen = (local.groups ?? []).filter((a) => offered.includes(a));
  return chosen.length ? chosen : frame.groups;
};
// The group a system of the groups axis stands for: its id, unless the host
// prefixed it ("room:kitchen" stands for "kitchen").
const groupOf = (id: string) => id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
const hiddenChannels = (id: string) => {
  const hidden = local.channels?.[id] ?? [];
  // At least one channel: a system with all of them hidden shows all of them.
  return SYS[id].channels.every((ch) => hidden.includes(ch.key)) ? [] : hidden;
};
// The views Zumly zooms between: the board, the detail and one per system
// (the groups join as the host names them; Zumly looks a view up when it zooms).
const views: Record<string, (ctx: ViewContext) => void> = {};
applySettings();
// The look in force: the viewer's choice over the shell's.
// How many layers the Layers view stacks: the viewer's choice, the shell's, or every system.
const layersShown = () => { const n = local.layers ?? frame.layers; return n && n >= 1 ? Math.min(n, IDS.length) : IDS.length; };
// How many channels a system stacks as layers: the viewer's choice, the shell's, or three (two on a phone), never past STACK_MAX.
const STACK_DEFAULT = PHONE ? 2 : 3;
const stackShown = () => { const n = local.stack ?? frame.stack; return Math.min(STACK_MAX, n && n >= 1 ? n : STACK_DEFAULT); };
const settings = (): BoardSettings => ({ systems: CHOSEN, mode: boardMode, axis, start: startId() ?? undefined,
  groups: activeGroups(), channels: local.channels, picks: local.picks, look: look(), layers: layersShown(), stack: stackShown() });
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

// A code being entered for actions that ask for one: the front layer is the keypad meanwhile.
type Code = { key: string; acts: Action[]; title: string; verb: string; format: CodeFormat; value: string; wrong: boolean; level?: 1 | 2 };
type Ui = {
  pick: string | null;                 // channel chosen by hand
  code: Code | null;                   // the keypad open on a channel
  since: Map<string, number>;          // when each alert appeared (rule 1: stable)
  sig: Map<string, string>;            // what each alert says: if it changes, it is no longer seen
  seen: Set<string>;                   // alerts marked as seen (no wave, they go behind)
};
const ui: Record<string, Ui> = {};
const uiOf = (id: string): Ui => { let u = ui[id]; if (!u) { u = { pick: null, code: null, since: new Map(), sig: new Map(), seen: new Set() }; ui[id] = u; } return u; };
let readings: Record<string, Map<string, { ch: Channel; r: Reading }>> = {};
// Every channel with something to show, hidden ones included: what the gear lists.
let channels: Record<string, { ch: Channel; r: Reading; hidden: boolean }[]> = {};
// Things with an unconfirmed action, and dial values the user is moving.
const pending = new Map<string, number>();
// Actions the host refused, by thing: what failed keeps a red outline and a
// Retry until a retry goes through or the thing changes anyway.
const failed = new Map<string, { acts: Action[]; message: string }>();
const hold = new Map<string, { value: number; until: number }>();
const log: { at: Date; text: string; level: number; id?: string; system?: string }[] = [];
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
// Layered view of the board: the systems as layers, each a bit bigger
// (tune.layerGrow), and the labels of the layers behind spread out so they do
// not overlap.
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
  const ctx = { groups: activeGroups() ?? null, picks: local.picks ?? {} };
  // On the groups axis the systems chosen are read too, only to list their channels in the gear.
  const listed = axis === 'groups' ? CHOSEN.filter((id) => !IDS.includes(id)) : [];
  for (const sys of [...IDS, ...listed].map((id) => SYS[id])) {
    const map = new Map<string, { ch: Channel; r: Reading }>(), u = uiOf(sys.id), hidden = hiddenChannels(sys.id);
    channels[sys.id] = [];
    for (const ch of sys.channels) {
      const r = ch.read(ctx);
      if (!r) continue;
      // A channel that follows a thing takes its name (the reading's `name`);
      // the gear lists every channel that has something, hidden or not.
      const named = r.name && r.name !== ch.name ? { ...ch, name: r.name } : ch;
      channels[sys.id].push({ ch: named, r, hidden: hidden.includes(ch.key) });
      if (hidden.includes(ch.key) || listed.includes(sys.id)) continue;
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
  const map = readings[id] ?? new Map<string, { ch: Channel; r: Reading }>(), u = uiOf(id);
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

const live = (id: string) => order(id).filter((k) => readings[id].get(k)!.r.alert && !uiOf(id).seen.has(k));
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
  let ok = true;
  for (const a of acts) {
    a.ids.forEach((e) => pending.set(e, Date.now()));
    try {
      await host.act(a);
      a.ids.forEach((e) => failed.delete(e));
    } catch (error) {
      ok = false;
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
  return ok;
}

// Actions that ask for a code wait on the keypad; the rest go now. On the
// keypad, the code is added to the ones that asked and all of them go
// together; a refusal keeps the keypad open, wrong, and empty.
function askCode(id: string, key: string, acts: Action[], title: string, verb: string, level?: 1 | 2) {
  const asks = acts.find((a) => a.asks);
  if (!asks) { void send(acts); return; }
  const u = uiOf(id);
  u.code = { key, acts, title, verb, format: asks.asks!, value: '', wrong: false, level };
  u.pick = key;
  repaint();
}
async function sendCode(id: string) {
  const u = uiOf(id), c = u.code;
  if (!c || !c.value) return;
  const ok = await send(c.acts.map((a) => a.asks ? { ...a, code: c.value } : a));
  if (u.code !== c) return;
  if (ok) u.code = null;
  else { c.value = ''; c.wrong = true; }
  repaint();
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
    name, controls, muted, call, open: look().dial === 'open', ends: look().ends,
    pending: (id) => id === undefined ? isPending(r) : pending.has(id),
    failed: (id) => id === undefined ? r.ids.some((e) => failed.has(e)) : failed.has(id),
  });
}
// The host's reading is the ring's, except that a range and the measurement are given in the dial's units.
const frac = (d: Dial, v: number) => Math.min(1, Math.max(0, (v - d.min) / (d.max - d.min)));
function ringReading(r: Reading): RingReading {
  return { ...r, range: r.range && r.dial ? { lo: frac(r.dial, r.range.lo), hi: frac(r.dial, r.range.hi) } : undefined,
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

// The weight of a system's ring on the board follows its level: what is fine a
// thin line, what calls heavier, the most serious the heaviest. Sizes never change.
const boardLanes = (level: number) => MINI_LANES * ([0.6, 1, 1.35][level] ?? 1);

function mini(id: string) {
  const sys = SYS[id], key = order(id)[0];
  if (!key) return '';
  const { ch, r } = readings[id].get(key)!;
  const level = worst(id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(key, r, boardLanes(level), false, !r.alert)}</span></span>${visualFor(id, key)}
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !uiOf(id).seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

// The calm, folded: one quiet tile with a dot for each (or, open, the button that folds them again).
function calmTile(n: number) {
  return calmOpen()
    ? `<button class="tile calm-fold is-open" data-calm aria-expanded="true"><span class="calm-ring"></span><span class="tile-title">${t.foldCalm}</span></button>`
    : `<button class="tile calm-fold" data-calm aria-expanded="false" aria-label="${esc(t.showTheCalm(n))}"><span class="calm-ring">${
      '<i></i>'.repeat(Math.min(n, 8))}</span><span class="tile-title">${t.calmN(n)}</span></button>`;
}
// The same under the layers and the list.
const calmToggle = (n: number) => `<button class="calm-toggle" data-calm aria-expanded="${calmOpen()}">${calmOpen() ? t.foldCalm : `${t.calmN(n)} · ${t.showCalm}`}</button>`;

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

function headlineLevel() {
  return host.status !== 'live' ? 0 : Math.max(0, ...IDS.flatMap((id) => live(id).map((k) => readings[id].get(k)!.r.alert!.level)));
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

// Four ways to look at the whole, over the same data:
// - grid: a mini ring per system (the usual one);
// - orbit: the pulse in the center and the systems around it;
// - layers: a single object, one system per layer; the one calling the most in front;
// - list: the systems on a ring that turns, like the lists of a watch.
const MODES: [BoardMode, string][] = BOARD_MODES.map((m) => [m, t.modes[m]]);
let boardPick: string | null = null;
// The list: the system the viewer put in its center (null: the most serious). Kept across views.
let listFocus: string | null = null;

// This month of an energy meter, by day (the detail's calendar), asked once
// per meter and kept a while.
const months = new Map<string, { values: (number | null)[]; at: number; error?: boolean }>();
const MONTH_MS = 15 * 60_000;
const monthLoading = new Set<string>();
const ROLLING_DAYS = 30;
const monthKey = (id: string) => look().month === 'rolling' ? `${id}|${ROLLING_DAYS}` : id;
async function loadMonth(id: string) {
  const key = monthKey(id), days = look().month === 'rolling' ? ROLLING_DAYS : undefined;
  if (monthLoading.has(key) || !host.statistics) return;
  monthLoading.add(key);
  try { months.set(key, { values: await host.statistics(id, days), at: Date.now() }); }
  catch { months.set(key, { values: [], at: Date.now(), error: true }); }
  monthLoading.delete(key);
  repaint();
}

// The changes of the last day, for the orbit's time: asked of the host once
// in a while (its history), merged with what this session saw.
let pastChanges: { at: number; changes: Record<string, StateChange[]> } | null = null;
let pastLoading = false;
const PAST_MS = 5 * 60_000;
async function loadPast() {
  if (pastLoading || !host.changes) return;
  pastLoading = true;
  try { pastChanges = { at: Date.now(), changes: await host.changes([...watched()], 24) }; }
  catch { pastChanges = { at: Date.now() - PAST_MS + 30_000, changes: {} }; }   // try again in half a minute
  pastLoading = false;
  repaint();
}
// The system and the glyph of a thing: the first channel that reads it.
function whose(thing: string) {
  for (const id of IDS) for (const { ch, r } of readings[id].values()) if (r.ids.includes(thing)) return { id, glyph: ch.glyph };
  return null;
}
// The changes as marks of the time window: a state that is a word (on, open,
// playing; a number that moves every minute would bury the rest), the alerts
// this session raised, the newest first. `ago` in hours.
type Mark = TimeMark & { id: string };
function timeMarks(hours: number, cap = 12): Mark[] {
  // Counted from the current minute: the marks move once a minute, not under a finger.
  const now = Math.floor(Date.now() / 60_000) * 60_000, out: (Mark & { at: number })[] = [];
  for (const [thing, list] of Object.entries(pastChanges?.changes ?? {})) {
    const who = whose(thing);
    if (!who) continue;
    for (const c of list) {
      // `ago` was counted when the history came; from it, the moment, and from that, how long ago now.
      const at = Math.floor((pastChanges!.at - c.ago * 3_600_000) / 60_000) * 60_000, ago = (now - at) / 3_600_000;
      if (ago >= hours || !Number.isNaN(Number(c.state)) || c.state === 'unavailable' || c.state === 'unknown') continue;
      out.push({ at, ago, glyph: who.glyph, id: who.id, name: SYS[who.id].title, when: time(new Date(at)).slice(0, 5), text: `${host.nameOf(thing)} → ${c.state}` });
    }
  }
  // The alerts that call now, at the moment they appeared, in their system's glyph.
  for (const id of IDS) for (const k of live(id)) {
    const since = uiOf(id).since.get(k), item = readings[id].get(k)!;
    if (since == null || (now - since) / 3_600_000 >= hours) continue;
    out.push({ at: since, ago: Math.max(0, (now - since) / 3_600_000), level: item.r.alert!.level, glyph: item.ch.glyph, id, name: SYS[id].title,
      when: time(new Date(since)).slice(0, 5), text: item.r.alert!.why });
  }
  // What this session saw before the history came (or with a host that keeps none).
  if (!pastChanges?.changes || !Object.keys(pastChanges.changes).length) for (const l of log) {
    const ago = Math.max(0, (now - l.at.getTime()) / 3_600_000), who = l.id ? whose(l.id) : null;
    if (!who || l.level || ago >= hours) continue;
    out.push({ at: l.at.getTime(), ago, glyph: who.glyph, id: who.id, name: SYS[who.id].title, when: time(l.at).slice(0, 5), text: l.text });
  }
  return out.sort((a, b) => a.ago - b.ago).slice(0, cap);
}
// How many of those changes fell in each of the last 24 hours, the oldest hour first.
function hourCounts() {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const list of Object.values(pastChanges?.changes ?? {})) for (const c of list) if (c.ago < 24 && Number.isNaN(Number(c.state))) counts[23 - Math.floor(c.ago)]++;
  for (const l of log) { const ago = (Date.now() - l.at.getTime()) / 3_600_000; if (ago < 24 && !pastChanges) counts[23 - Math.floor(ago)]++; }
  return counts;
}
// Which open alert the orbit's face shows (its dots step through them); 0: the most serious.
let hubAt = 0;
// The gear's tab last open.
const TAB_KEY = `${STORE ?? 'pulse-settings'}-tab`;
let settingsTab: Tab = (() => { try { const v = sessionStorage.getItem(TAB_KEY); return SETTINGS_TABS.includes(v as Tab) ? v as Tab : 'content'; } catch { return 'content'; } })();
// The measures of the hub, from the gear's tuning.
const hubLook = (): HubLook => ({ gap: tune.timeGap, pointer: 'triangle', size: tune.timePointer, bar: tune.timeBar });

// Systems by urgency, the most serious first, the usual order within a level;
// a choice made by hand never moves them (the queue of the orbit, the grid,
// the list and the index beside the layers).
function urgencyOrder(ids: string[]) {
  return ids.map((id, i) => ({ id, i, w: worst(id) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.id);
}
// While something calls, what is fine folds into one quiet element; the
// viewer opens it on demand, kept with the viewer's settings.
const calmOpen = () => local.calm === 'open';
const calmFolds = (ids: string[]) => ids.some((id) => worst(id)) && ids.some((id) => !worst(id));

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
  const a = r.alert && !uiOf(id).seen.has(key) ? r.alert : null;
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
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${ring(f.key, f.r, boardLanes(level), false, !f.r.alert)}</span></span>
        <span class="otile-glyph">${icon(f.ch.glyph, 24)}</span></span>
      <span class="otile-label outward-y"><span class="tile-title">${SYS[id].title}</span>
      <span class="tile-big">${esc(f.big)}</span></span>
    </button></div></div>`;
}

// The alerts open now, the most serious first: what the orbit's face steps through.
function openAlerts() {
  return IDS.flatMap((id) => live(id).map((k) => ({ id, k, ...readings[id].get(k)! })))
    .sort((a, b) => b.r.alert!.level - a.r.alert!.level || (uiOf(a.id).since.get(a.k) ?? 0) - (uiOf(b.id).since.get(b.k) ?? 0));
}
// Center of the orbit: one segment per system, facing its tile and pointing at
// it, painted if that system calls; inside, with time on, the news (orbitHub).
function hubRing(ids: string[], news?: HubNews) {
  return orbitHub({ levels: ids.map((id) => worst(id)), news, look: hubLook(), rounded: look().ends === 'rounded', aria: t.hubAria });
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
    <p class="eyebrow">${t.pulse} · ${time(new Date()).slice(0, 5)}</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? t.nAlerts(alerts.length) : t.allCalm.replace(/\.$/, '')}</p>
    <ul class="hub-rows">${rows.join('') || `<li><span>${t.waitingChanges}</span></li>`}</ul></div>` });
  return list;
}

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
    <header class="board-head"><span class="conn-slot"></span>
      <nav class="modes" aria-label="${t.viewSelector}">${MODES.map(([m, label]) =>
        `<button class="mode" data-mode="${m}">${label}</button>`).join('')}</nav><h1></h1>
      <p class="error" hidden></p></header>
    <div class="board-body"></div>
  </div><button type="button" class="exit${STORE ? ' with-gear' : ''}" data-action="signout" hidden>${EXIT}</button>` + (STORE ? settingsPanel() : '');
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
    // Layers: the systems grow up to 1.96× the 240 px disc, with 1.1× zoom.
    body.style.setProperty('--fit', String(Math.min(1, Math.min(width, height) / (240 * 1.96 * 1.1))));
  });
  fit.observe(body);
  ctx.onCleanup(() => fit.disconnect());

  // The pointer tilts the object in the orbit and in layers, as in each system's object.
  parallax(body, () => body.querySelector<HTMLElement>('.stage .obj'), () => ['orbit', 'layers'].includes(boardMode));

  const build = () => {
    built = boardMode;
    layers = new Map();
    boardEl.className = `board mode-${boardMode}`;
    drawn.delete(body);
    unbuild?.();
    unbuild = null;
    if (boardMode === 'list') {
      body.innerHTML = `<div class="stage list-stage queue-stage"><div class="one"></div><div class="queue-foot"></div></div>`;
    } else if (boardMode === 'orbit') {
      // The whole orbit is one Orbit system: the universe is the space left, the
      // pulse is the center satellite and the systems, satellites of orbit-10
      // (tune.orbit).
      // In 3D, like each system's object: the pulse in front and the systems one
      // step behind (Orbit layers); the pointer tilts the whole.
      body.innerHTML = `<div class="stage orbit-stage"><div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective">
        <div class="orbit-0 hub-orbit layer-front"><div class="satellite at-center"><div class="capsule">
          <div class="hub"><div class="hub-ring-slot"></div>
            <div class="hub-face"><div class="hub-slide" aria-live="polite"></div><div class="hub-before"></div></div></div>
        </div></div></div>
        <div class="orbit-${tune.orbit} orbit-tiles" data-depth="1"></div></div></div></div></div>`;
    } else if (boardMode === 'layers') {
      // In 3D, like the orbit: each layer one step further back and the pointer tilts the object.
      body.innerHTML = `<div class="stage board-stage" data-zoom="calm"><div class="obj"><div class="bigbang">
        <div class="gravity-spot depth outer-perspective"></div></div></div>
        <div class="layer-index-slot"></div><div class="strip board-strip"></div></div>`;
    } else body.innerHTML = '';
  };

  // One layer per system, all of them by default (the gear or the shell can
  // cap it; the rest are named under the object, each a button). The growth
  // per layer shrinks so the outermost always fits, and the spacing is even
  // or bunched behind or in front (tune.layerEase): each layer gets a
  // fractional depth, which Orbit turns into its distance and its size.
  const paintLayers = (all: string[]) => {
    const depth = body.querySelector<HTMLElement>('.depth')!;
    // Folded, only what calls is drawn (and the one picked by hand); the calm
    // wait under the object behind one button.
    const folded = calmFolds(all) && !calmOpen();
    const shown = folded ? all.filter((id) => worst(id) || id === boardPick) : all;
    const n = Math.max(1, Math.min(shown.length, layersShown()));
    const ids = shown.slice(0, n), rest = all.filter((id) => !ids.includes(id));
    const grow = n > 1 ? Math.min(tune.layerGrow, 0.96 / (n - 1)) : tune.layerGrow;
    const ease = Math.pow(2, tune.layerEase * 1.5);
    depth.style.setProperty('--o-depth-grow', grow.toFixed(3));
    for (const [id, layer] of layers) if (!ids.includes(id)) { layer.remove(); layers.delete(id); }
    ids.forEach((id, i) => {
      let layer = layers.get(id);
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'gravity-spot layer';
        layer.dataset.system = id;
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
    // Beside the object, the layers front to back, each a button; the ones past the cap hollow.
    setHTML(stage.querySelector<HTMLElement>('.layer-index-slot')!, layerIndex(urgencyOrder(IDS.filter((id) => all.includes(id))).map((id) => ({ id, title: SYS[id].title, big: front(id).big, level: worst(id), off: !ids.includes(id), front: id === ids[0] })), 'data-bpick'));
    const zoom = ids.some((id) => worst(id)) ? 'alert' : 'calm';
    if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
    // Under the object: the systems past the cap, each a button that brings it to the front. No feed of changes.
    const calm = all.filter((id) => !worst(id)), capped = rest.filter((id) => worst(id) || !folded);
    setHTML(stage.querySelector<HTMLElement>('.board-strip')!, (capped.length ? `<span class="behind">${t.behind(capped.length)}: ${capped.map((id) =>
      `<button class="more" data-bpick="${id}" aria-label="${esc(t.bringToFront(SYS[id].title))}">${SYS[id].title}</button>`).join(', ')}</span>` : '')
      + (calmFolds(all) ? calmToggle(calm.length) : ''));
  };

  // The list: the systems as a queue on two rings (queueRings), what calls
  // inside by urgency and the calm folded outside. The center holds the one
  // in focus: the most serious, unless the viewer picked another.
  const listItem = (id: string): ListItem => {
    const f = front(id);
    return { id, title: SYS[id].title, ring: ring(f.key, f.r, boardLanes(worst(id)), false, !f.r.alert), glyph: f.ch.glyph, big: f.big,
      label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`, level: worst(id) };
  };
  const paintList = (ids: string[]) => {
    const queue = urgencyOrder(ids), first = queue[0];
    const focus = listFocus && queue.includes(listFocus) ? listFocus : first;
    setHTML(body.querySelector<HTMLElement>('.queue-stage .one')!, queueRings(queue.map(listItem), { focus, open: calmOpen() }));
    // Under the object: back to what matters when a calm one is in the center, and the fold once open.
    const back = focus && !worst(focus) && first && worst(first)
      ? `<button class="queue-back" data-qfocus="${first}"><span class="queue-back-dot"></span>${esc(t.needsYou(SYS[first].title))}</button>` : '';
    setHTML(body.querySelector<HTMLElement>('.queue-foot')!, back + (calmFolds(queue) && calmOpen() ? calmToggle(queue.filter((id) => !worst(id)).length) : ''));
  };

  const paint = () => {
    if (built !== boardMode) build();
    // The headline is quiet: grey, in the color of the critical only when something is critical.
    // The orbit's center already says it, so there it is left to screen readers.
    const h1 = el.querySelector('h1')!;
    h1.textContent = headline();
    h1.className = `level-${headlineLevel()}`;
    // Only when it changed: the host repaints every few seconds and a button
    // recreated each time would lose taps.
    setHTML(el.querySelector<HTMLElement>('.conn-slot')!, status());
    // The way out, next to the gear; the view switch only when chosen.
    const exitBtn = el.querySelector<HTMLButtonElement>('.exit')!, exitLabel = options.exit?.() ?? null;
    exitBtn.hidden = !exitLabel;
    if (exitLabel) { exitBtn.setAttribute('aria-label', exitLabel); exitBtn.title = exitLabel; }
    el.querySelector<HTMLElement>('.modes')!.hidden = look().modes === 'hidden';
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === boardMode));
    if (form) syncSettings(form);
    const err = el.querySelector<HTMLElement>('.error')!;
    err.hidden = host.status !== 'error';
    err.textContent = host.error;
    const ready = host.status === 'live' || host.hasData;
    const ids = ready ? boardOrder() : [];
    if (boardMode === 'grid') {
      // What calls first, by urgency; the calm folded into one tile while something calls.
      const queue = urgencyOrder(IDS.filter((id) => ids.includes(id)));
      const calm = queue.filter((id) => !worst(id));
      const folds = calmFolds(queue);
      setHTML(body, `<div class="tiles">${(folds && !calmOpen() ? queue.filter((id) => worst(id)) : queue).map(mini).join('')}${
        folds ? calmTile(calm.length) : ''}</div>`);
    }
    else if (boardMode === 'orbit') {
      // The systems queue by urgency, clockwise from the top: the most serious first (urgencyOrder).
      // Each part is replaced on its own: the carousel does not redraw the rings.
      const fixed = urgencyOrder(IDS.filter((id) => ids.includes(id)));
      const hubEl = body.querySelector<HTMLElement>('.hub')!;
      if (hubEl.hidden !== !ready) hubEl.hidden = !ready;
      const tm = look().time, calling = fixed.some((id) => worst(id));
      const changesRing = tm === 'changes' || (tm === 'both' && calling), clock = (tm === 'clock' || tm === 'both') && !calling;
      if ((changesRing || clock) && host.changes && host.status === 'live' && (!pastChanges || Date.now() - pastChanges.at > PAST_MS)) void loadPast();
      const timeOn = changesRing || clock;
      hubEl.classList.toggle('has-time', timeOn);
      // The news inside the ring: the last 12 hours with the open alerts at the moment they began, or the calm day by hour.
      const alerts = openAlerts();
      if (hubAt >= alerts.length) hubAt = 0;
      const now = Date.now();
      const news: HubNews | undefined = changesRing
        ? { span: 12, alerts: alerts.map((a, i) => ({ ago: (now - (uiOf(a.id).since.get(a.k) ?? now)) / 3_600_000, level: a.r.alert!.level, current: i === hubAt })) }
        : clock ? { span: 24, bars: hourCounts() } : undefined;
      const hub = ready ? hubRing(fixed, news) : null;
      setHTML(body.querySelector<HTMLElement>('.hub-ring-slot')!, hub ? `<div class="hub-ring">${hub.svg}</div>` : '');
      if (hub) hubEl.style.setProperty('--hub-face-inset', `${(hub.inset * 100).toFixed(2)}%`);
      hubEl.style.setProperty('--hub-split', String(tune.timeSplit));
      // With time on, the face splits: now above the line, before under it (the last change, and the way into all of them).
      const span = changesRing ? 12 : 24, all = timeOn ? timeMarks(span, 500) : [];
      const last = all.find((m) => !m.level);
      hubEl.querySelector('.hub-face')!.classList.toggle('is-split', ready && timeOn);
      setHTML(body.querySelector<HTMLElement>('.hub-before')!, ready && timeOn ? `${last ? `<span class="hub-last">${esc(`${last.when} · ${last.text}`)}</span>` : ''}
        <button class="hub-changes zoom-me" data-to="changes" data-span="${span}" aria-label="${esc(t.openChanges(span))}">${esc(t.nChanges(all.length))} ›</button>` : '');
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
  };

  // The center of the orbit holds what matters most: the most serious alert,
  // or the pulse when all is calm. The rest call from their tiles
  // around it.
  const paintSlide = () => {
    const slides = hubSlides(), tm = look().time, alerts = slides.filter((x) => x.level);
    const shown = alerts.length ? alerts[Math.min(hubAt, alerts.length - 1)] : slides[slides.length - 1];
    // All calm and the clock chosen: the time itself.
    const clock = !alerts.length && (tm === 'clock' || tm === 'both');
    const now = new Date();
    // Several open with time on: a dot each, in its color, to step through them (all the same size).
    const dots = tm !== 'off' && alerts.length > 1 ? `<nav class="hub-dots" aria-label="${t.alerts}">${alerts.map((a, i) =>
      `<button class="hub-dot level-${a.level}" data-hubat="${i}" aria-current="${i === hubAt}" aria-label="${esc(t.alertNof(i + 1, alerts.length))}"></button>`).join('')}</nav>` : '';
    setHTML(body.querySelector<HTMLElement>('.hub-slide')!, clock ? `<div class="slide hub-clock">
      <p class="eyebrow">${esc(now.toLocaleDateString(localeOf(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      <p class="slide-big clock-big">${time(now).slice(0, 5)}</p>
      </div>` : shown.html.replace(/<\/div>\s*$/, `${dots}</div>`));
  };
  // The clock moves on its own: once a minute is enough.
  const clockTimer = window.setInterval(() => { if (boardMode === 'orbit' && look().time !== 'off' && app.getCurrentViewName() === 'board') paint(); }, 30_000);
  ctx.onCleanup(() => clearInterval(clockTimer));

  // The gear's tuning changes the orbit or the layers: rebuild.
  const retune = () => { built = null; paint(); };
  window.addEventListener('pulse-tune', retune);
  ctx.onCleanup(() => window.removeEventListener('pulse-tune', retune));

  let locked = false;
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const open = target.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (open) {
      const tile = body.querySelector<HTMLElement>(`.otile[data-system="${open}"]`);
      if (tile) void app.zoomIn(tile);
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) { options.onAction?.(action); return; }
    const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode as BoardMode | undefined;
    const pick = target.closest<HTMLElement>('[data-bpick]')?.dataset.bpick;
    if (target.closest('[data-calm]')) { setSettings({ calm: calmOpen() ? undefined : 'open' }); return; }
    const at = target.closest<HTMLElement>('[data-hubat]')?.dataset.hubat;
    if (at != null) { hubAt = Number(at); paint(); return; }
    const qitem = target.closest<HTMLElement>('[data-qitem]')?.dataset.qitem;
    if (qitem) { listFocus = qitem; paint(); return; }
    if (target.closest('[data-qfocus]')) { listFocus = null; paint(); return; }
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
    // Tabs: one section at a time; the one last open comes back.
    const tabs = [...form.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const showTab = (id: Tab, focus = false) => {
      settingsTab = id;
      try { sessionStorage.setItem(TAB_KEY, id); } catch { /* only to remember */ }
      for (const b of tabs) { const on = b.dataset.tab === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
      for (const p of form.querySelectorAll<HTMLElement>('[role="tabpanel"]')) p.hidden = p.dataset.pane !== id;
      form.querySelector<HTMLElement>('.settings-body')!.scrollTop = 0;
    };
    form.querySelector<HTMLElement>('.settings-tabs')!.addEventListener('keydown', (e) => {
      const i = tabs.findIndex((b) => b.dataset.tab === settingsTab);
      const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
      if (next == null) return;
      e.preventDefault();
      showTab(SETTINGS_TABS[(next + tabs.length) % tabs.length], true);
    });
    showTab(settingsTab);
    // Wide enough, the panel is a sheet at the side and the board moves over to
    // stay in view (what is tuned shows as it changes); narrow, a dialog over it.
    const open = () => {
      const side = el.clientWidth >= 880;
      el.classList.toggle('settings-side', side);
      el.classList.add('settings-open');
      form.setAttribute('aria-modal', String(!side));
      backdrop.hidden = false;
      gear.setAttribute('aria-expanded', 'true');
      tabs.find((b) => b.dataset.tab === settingsTab)?.focus();
    };
    const close = () => {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      el.classList.remove('settings-open', 'settings-side');
      gear.setAttribute('aria-expanded', 'false');
      gear.focus();
    };
    gear.addEventListener('click', () => (backdrop.hidden ? open() : close()));
    backdrop.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === backdrop || target.closest('[data-settings-close]')) { close(); return; }
      const tabId = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (tabId) { showTab(tabId); return; }
      if (target.closest('[data-settings-reset]')) { local = {}; setSettings({}); return; }
      const reset = target.closest<HTMLElement>('[data-tune-reset]')?.dataset.tuneReset;
      if (reset) { resetTune(reset === 'all' ? undefined : reset as TuneGroup); syncTune(form); return; }
      const copy = target.closest<HTMLButtonElement>('[data-tune-copy]');
      if (copy) {
        void navigator.clipboard?.writeText(tuneText()).catch(() => undefined);
        copy.textContent = t.copied;
        setTimeout(() => { copy.textContent = t.copy; }, 1200);
      }
    });
    // Sliders and colors move the board as they are dragged.
    form.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.name === 'tune') { setTune(target.dataset.key as keyof Tune, Number(target.value)); syncTune(form); }
      else if (target.name === 'dim' || target.name === 'blur' || target.name === 'glow') {
        // Live while dragged: the ground only; kept on release (the change event).
        const v = target.name === 'glow' ? target.value : Number(target.value);
        local = { ...local, look: { ...local.look, [target.name]: v } };
        applyGround();
        if (target.name !== 'glow') form.querySelector<HTMLOutputElement>(`[data-ground-out="${target.name}"]`)!.textContent = target.name === 'dim' ? `${Math.round(Number(v) * 100)}%` : `${v}px`;
      }
      else if (target.name === 'color') {
        const k = target.dataset.key as keyof Theme;
        applyColors(canvas, { ...currentColors(), [k]: target.value });
        form.querySelector<HTMLOutputElement>(`[data-color-out="${k}"]`)!.textContent = target.value;
      }
    });
    // Only the field that changed is kept: the others stay as the frame says.
    form.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement, field = target.name, data = new FormData(form);
      if (field === 'systems') {
        const chosen = data.getAll('systems').map(String);
        // At least one system: unchecking the last one does not stick.
        if (!chosen.length) { syncSettings(form); return; }
        setSettings({ systems: chosen.length === frame.systems.length ? undefined : chosen });
      } else if (field === 'axis') {
        const a = String(data.get('axis')) as Axis;
        setSettings({ axis: a === (frame.axis ?? 'systems') ? undefined : a });
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
      } else if (field === 'layers') {
        const n = Number(data.get('layers')) || undefined;
        setSettings({ layers: n === frame.layers ? undefined : n });
      } else if (field === 'stack') {
        const n = Number(data.get('stack')) || undefined;
        setSettings({ stack: n === (frame.stack ?? STACK_DEFAULT) ? undefined : n });
      } else if (field === 'tune') {
        // Kept as it moved (the input event).
      } else if (field === 'theme' || field === 'color') {
        const next: Look = { ...local.look };
        if (field === 'color') next.colors = { ...currentColors(), [(target as HTMLInputElement).dataset.key!]: target.value };
        else if (target.value === 'custom') next.colors = local.look?.colors ?? currentColors();
        next.theme = field === 'color' ? 'custom' : target.value as Look['theme'];
        if (next.theme === (frame.look?.theme ?? LOOK_DEFAULT.theme)) delete next.theme;
        setSettings({ look: Object.keys(next).length ? next : undefined });
      } else if (field === 'ground' || field === 'faces' || field === 'glow' || field === 'dim' || field === 'blur' || field === 'photo-url') {
        const v = field === 'dim' || field === 'blur' ? Number(target.value) : field === 'photo-url' ? target.value.trim() : target.value;
        const next: Look = { ...local.look, [field === 'photo-url' ? 'photo' : field]: v };
        if (field === 'photo-url' && v) next.ground = 'photo';
        for (const k of ['ground', 'faces', 'glow', 'photo', 'dim', 'blur'] as const) if (next[k] === (frame.look?.[k] ?? LOOK_DEFAULT[k])) delete next[k];
        setSettings({ look: Object.keys(next).length ? next : undefined });
      } else if (field === 'photo-file') {
        const file = (target as HTMLInputElement).files?.[0];
        const state = form.querySelector<HTMLElement>('.photo-state')!;
        if (!file) return;
        state.dataset.busy = '1';
        state.textContent = t.photoLoading;
        void keepPhoto(file).then((ok) => {
          delete state.dataset.busy;
          (target as HTMLInputElement).value = '';
          if (!ok) { state.textContent = t.photoTooBig; return; }
          setSettings({ look: { ...local.look, ground: 'photo', photo: 'upload' } });
        });
      } else if (field === 'modes') {
        const next: Look = { ...local.look, modes: (target as HTMLInputElement).checked ? 'shown' : 'hidden' };
        if (next.modes === (frame.look?.modes ?? LOOK_DEFAULT.modes)) delete next.modes;
        setSettings({ look: Object.keys(next).length ? next : undefined });
      } else if (field === 'dial' || field === 'day' || field === 'ends' || field === 'time' || field === 'month') {
        const next: Look = { ...local.look, [field]: String(data.get(field)) };
        for (const k of ['dial', 'day', 'ends', 'time', 'month'] as const) if (next[k] === (frame.look?.[k] ?? LOOK_DEFAULT[k])) delete next[k];
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
const EXIT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 7l5 5-5 5"/><path d="M20 12H9"/></svg>`;
const GEAR = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
function settingsPanel() {
  const tab = (id: Tab) => `<button type="button" role="tab" class="settings-tab" id="pulse-tab-${id}" data-tab="${id}" aria-controls="pulse-pane-${id}" aria-selected="false" tabindex="-1">${t.settingsTabs[id]}</button>`;
  const pane = (id: Tab, lead: string, html: string) => `<section class="settings-pane" role="tabpanel" id="pulse-pane-${id}" data-pane="${id}" aria-labelledby="pulse-tab-${id}" hidden>
    <p class="settings-lead">${lead}</p>${html}</section>`;
  const radios = (name: string, values: readonly string[], labels: Record<string, string>, title: string) =>
    `<fieldset class="settings-choice"><legend>${title}</legend><div class="settings-row">${values.map((v) =>
      `<label><input type="radio" name="${name}" value="${v}"> ${labels[v]}</label>`).join('')}</div></fieldset>`;
  const content = `<fieldset><legend>${t.systemsField}</legend>
        <div class="settings-systems">${frame.systems.map((id) =>
          `<label><input type="checkbox" name="systems" value="${id}"> ${SYS[id].title}</label>`).join('')}</div></fieldset>
      <fieldset class="settings-groups" hidden><legend>${t.groupsField}</legend>
        <div class="settings-groups-list"></div>
        <p class="hint">${t.groupsHint}</p></fieldset>
      <fieldset class="settings-channels-field"><legend>${t.channelsField}</legend>
        <div class="settings-channels"></div>
        <p class="hint">${t.channelsHint}</p></fieldset>`;
  const board = `<h3 class="settings-section">${t.viewSection}</h3>
      ${radios('mode', MODES.map(([m]) => m), Object.fromEntries(MODES), t.boardView)}
      <label class="settings-check"><input type="checkbox" name="modes"> ${t.showModes}</label>
      <fieldset class="settings-axis settings-choice"><legend>${t.axisField}</legend>
        <div class="settings-row">${AXES.map((a) => `<label><input type="radio" name="axis" value="${a}"> ${t.axes[a]}</label>`).join('')}</div>
        <p class="hint">${t.axisHint}</p></fieldset>
      <label class="settings-field"><span>${t.openInside}</span>
        <select name="start" aria-describedby="pulse-settings-start"></select></label>
      <p class="hint" id="pulse-settings-start">${t.startHint}</p>
      <h3 class="settings-section">${t.orbitSection}</h3>
      <label class="settings-field"><span>${t.timeField}</span><select name="time">${TIMES.map((n) =>
        `<option value="${n}">${t.timeLook[n]}</option>`).join('')}</select></label>
      <h3 class="settings-section">${t.layersSection}</h3>
      <label class="settings-field"><span>${t.layersField}</span>
        <select name="layers" aria-describedby="pulse-settings-layers"></select></label>
      <p class="hint" id="pulse-settings-layers">${t.layersHint}</p>
      <label class="settings-field"><span>${t.stackField}</span>
        <select name="stack" aria-describedby="pulse-settings-stack">${Array.from({ length: STACK_MAX }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <p class="hint" id="pulse-settings-stack">${t.stackHint}</p>`;
  const lookPane = `<fieldset class="settings-themes"><legend>${t.themeField}</legend>
        <div class="theme-grid">${[...THEME_NAMES, 'custom'].map((n) => `<label class="theme-tile" data-theme-tile="${n}"><input type="radio" name="theme" value="${n}">${
          n === 'custom' ? '<span class="theme-disc is-custom" aria-hidden="true"><i></i><i></i><i></i></span>' : swatch(THEMES[n as ThemeName])}<span class="theme-name">${t.themeNames[n]}<small>${t.themeNotes[n]}</small></span></label>`).join('')}</div></fieldset>
      <fieldset class="settings-colors" hidden><legend>${t.colorsField}</legend>
        <div class="color-grid">${COLOR_KEYS.map((k) => `<label class="color-field"><input type="color" name="color" data-key="${k}"><span>${t.colorLabels[k]}</span><output data-color-out="${k}"></output></label>`).join('')}</div>
        <p class="hint">${t.colorsHint}</p></fieldset>
      <h3 class="settings-section">${t.groundSection}</h3>
      ${radios('ground', GROUNDS, t.groundLook, t.groundField)}
      <label class="settings-field settings-glow"><span>${t.glowField}</span><input type="color" name="glow"></label>
      <div class="settings-photo">
        <div class="photo-row"><label class="plain photo-pick">${t.photoPick}<input type="file" name="photo-file" accept="image/*"></label>
          <span class="photo-state" aria-live="polite"></span></div>
        <label class="settings-field"><span>${t.photoUrl}</span><input type="text" name="photo-url" inputmode="url" placeholder="/local/living-room.jpg" autocomplete="off" spellcheck="false"></label>
        <p class="hint">${t.photoHint}</p>
        <label class="tune-field"><span>${t.dimField}</span><output data-ground-out="dim"></output><input type="range" name="dim" min="0" max="0.85" step="0.05"></label>
        <label class="tune-field"><span>${t.blurField}</span><output data-ground-out="blur"></output><input type="range" name="blur" min="0" max="24" step="1"></label>
      </div>
      <div class="settings-faces">${radios('faces', FACES, t.facesLook, t.facesField)}</div>
      <h3 class="settings-section">${t.ringsSection}</h3>
      ${radios('dial', DIALS, t.dialLook, t.dialField)}
      ${radios('day', DAYS, t.dayLook, t.dayField)}
      ${radios('ends', ENDS, t.endsLook, t.endsField)}
      <h3 class="settings-section">${t.detailsSection}</h3>
      <label class="settings-field"><span>${t.monthField}</span><select name="month">${MONTHS.map((n) =>
        `<option value="${n}">${t.monthLook[n]}</option>`).join('')}</select></label>`;
  const tunePane = GROUPS.map(([g, controls]) => `<div class="tune-group" data-tune-group="${g}">
        <div class="tune-head"><h3 class="settings-section">${t.tuneGroups[g]}</h3>
          <button type="button" class="plain tune-reset" data-tune-reset="${g}">${t.resetGroup}</button></div>
        ${controls.map((c) => `<label class="tune-field"><span>${t.tuneLabels[c.key]}</span><output data-tune-out="${c.key}"></output>
          <input type="range" name="tune" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join('')}</div>`).join('') +
      `<div class="tune-actions"><button type="button" class="plain" data-tune-copy>${t.copy}</button>
        <button type="button" class="plain" data-tune-reset="all">${t.resetAllTuning}</button></div>`;
  return `<button type="button" class="gear" aria-label="${t.settings}" aria-haspopup="dialog" aria-expanded="false">${GEAR}</button>
  <div class="settings-backdrop" hidden>
    <form class="settings" role="dialog" aria-modal="true" aria-labelledby="pulse-settings-title">
      <header><h2 id="pulse-settings-title">${t.settings}</h2>
        <button type="button" class="plain settings-close" data-settings-close aria-label="${t.close}">×</button></header>
      <div class="settings-tabs" role="tablist" aria-label="${t.settings}">${SETTINGS_TABS.map(tab).join('')}</div>
      <div class="settings-body">
        ${pane('content', t.contentLead, content)}
        ${pane('board', t.boardLead, board)}
        ${pane('look', t.lookLead, lookPane)}
        ${pane('tune', t.tuneLead, tunePane)}
      </div>
      <footer><span class="settings-kept">${t.settingsLead}</span>
        <button type="button" class="plain" data-settings-reset>${t.resetSettings}</button>
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
// The colors in force: the custom ones over the default theme's, or the chosen theme's.
function currentColors(): Theme {
  const lk = look();
  return lk.theme === 'custom' ? { ...THEMES[DEFAULT_THEME], ...lk.colors } : THEMES[THEME_NAMES.includes(lk.theme) ? lk.theme : DEFAULT_THEME];
}
// The sliders of the last tab, each with its value; the changed ones marked, the reset of a group only when it has one.
function syncTune(form: HTMLFormElement) {
  for (const c of CONTROLS) {
    const input = form.querySelector<HTMLInputElement>(`input[name="tune"][data-key="${c.key}"]`)!;
    if (activeElement() !== input) input.value = String(tune[c.key]);
    const out = form.querySelector<HTMLOutputElement>(`[data-tune-out="${c.key}"]`)!;
    out.textContent = fmt(c, tune[c.key]);
    out.classList.toggle('changed', tune[c.key] !== DEFAULTS[c.key]);
  }
  for (const [g] of GROUPS) form.querySelector<HTMLButtonElement>(`[data-tune-reset="${g}"]`)!.hidden = !tuned(g);
  form.querySelector<HTMLButtonElement>('[data-tune-reset="all"]')!.hidden = !tuned();
}
// A thing's name for the gear's lists, with where it is when that adds something.
const labelOf = (id: string) => {
  const n = host.nameOf(id), p = host.whereIs?.(id);
  return p && !n.toLowerCase().includes(p.toLowerCase()) ? `${n} · ${p}` : n;
};
function syncSettings(form: HTMLFormElement) {
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="systems"]')) box.checked = CHOSEN.includes(box.value);
  const lk = look();
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="dial"], input[name="day"], input[name="ends"]')) box.checked = lk[box.name as keyof Look] === box.value;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="theme"]')) box.checked = box.value === lk.theme;
  form.querySelector<HTMLInputElement>('input[name="modes"]')!.checked = lk.modes === 'shown';
  // The ground: its fields only for the ground chosen.
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="ground"], input[name="faces"]')) box.checked = lk[box.name as 'ground' | 'faces'] === box.value;
  form.querySelector<HTMLElement>('.settings-glow')!.hidden = lk.ground !== 'glow';
  form.querySelector<HTMLElement>('.settings-photo')!.hidden = lk.ground !== 'photo';
  form.querySelector<HTMLElement>('.settings-faces')!.hidden = lk.ground === 'flat';
  const glowIn = form.querySelector<HTMLInputElement>('input[name="glow"]')!;
  if (activeElement() !== glowIn) glowIn.value = lk.glow;
  const urlIn = form.querySelector<HTMLInputElement>('input[name="photo-url"]')!;
  if (activeElement() !== urlIn) urlIn.value = lk.photo === 'upload' ? '' : lk.photo;
  const photoState = form.querySelector<HTMLElement>('.photo-state')!;
  if (!photoState.dataset.busy) photoState.textContent = lk.photo === 'upload' && uploadedPhoto() ? t.photoKept : '';
  for (const k of ['dim', 'blur'] as const) {
    const input = form.querySelector<HTMLInputElement>(`input[name="${k}"]`)!;
    if (activeElement() !== input) input.value = String(lk[k]);
    form.querySelector<HTMLOutputElement>(`[data-ground-out="${k}"]`)!.textContent = k === 'dim' ? `${Math.round(lk.dim * 100)}%` : `${lk.blur}px`;
  }
  // Your colors: shown with the custom theme, each as it is in force.
  const colorsField = form.querySelector<HTMLElement>('.settings-colors')!;
  colorsField.hidden = lk.theme !== 'custom';
  const inForce = currentColors();
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="color"]')) {
    const k = input.dataset.key as keyof Theme;
    if (activeElement() !== input) input.value = inForce[k];
    form.querySelector<HTMLOutputElement>(`[data-color-out="${k}"]`)!.textContent = inForce[k];
  }
  const disc = form.querySelector<HTMLElement>('.theme-disc.is-custom')!;
  for (const k of COLOR_KEYS) disc.style.setProperty(`--sw-${k}`, (lk.colors?.[k] ?? inForce[k]));
  syncTune(form);
  form.querySelector<HTMLSelectElement>('select[name="time"]')!.value = lk.time;
  form.querySelector<HTMLSelectElement>('select[name="month"]')!.value = lk.month;
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
  const chHtml = CHOSEN.filter((id) => channels[id]?.length).map((id) => `<div class="settings-group"><span class="settings-group-title">${SYS[id].title}</span>${
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
  // The groups axis only when the host offers it and names groups.
  form.querySelector<HTMLElement>('.settings-axis')!.hidden = !host.byGroup || !hostGroups().some((g) => g.items.length);
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="axis"]')) radio.checked = radio.value === axis;
  const select = form.querySelector<HTMLSelectElement>('select[name="start"]')!;
  setHTML(select, `<option value="">${t.theBoard}</option>${IDS.map((id) => `<option value="${id}">${SYS[id].title}</option>`).join('')}`);
  select.value = startId() ?? '';
  const layersSel = form.querySelector<HTMLSelectElement>('select[name="layers"]')!;
  setHTML(layersSel, `<option value="">${t.allSystems}</option>${Array.from({ length: Math.max(0, IDS.length - 1) }, (_, i) =>
    `<option value="${i + 2}">${i + 2}</option>`).join('')}`);
  const cap = local.layers ?? frame.layers;
  layersSel.value = cap && cap < IDS.length ? String(cap) : '';
  form.querySelector<HTMLSelectElement>('select[name="stack"]')!.value = String(stackShown());
}

// ─── Dials: the value moves in place, the action goes out on release ──

type ValueText = { big: string; label: string; sentence: string };
// A dial's state, shared by the system view and the detail: `root` finds the
// markup that holds a channel's dial, `onValue` writes what it says now. The
// action goes out on release (or after a keyboard pause); until the host
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
    return hold.get(`${dial.id}#${handle}`)?.value ?? (handle === 'lo' ? range.lo : range.hi);
  };
  const setDial = (key: string, value: number, until = Infinity, handle?: string) => {
    const dial = dialOf(key);
    value = Math.min(dial.max, Math.max(dial.min, value));
    const el = root(key);
    if (handle) {
      // One end never crosses the other.
      const other = endOf(key, handle === 'lo' ? 'hi' : 'lo');
      value = handle === 'lo' ? Math.min(value, other) : Math.max(value, other);
      hold.set(`${dial.id}#${handle}`, { value, until });
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
      onValue(key, { big: `${num(lo)}–${num(hi)}${dial.unit}`, label: dial.label, sentence: t.between(num(lo), num(hi), dial.unit) });
      return value;
    }
    hold.set(dial.id, { value, until });
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
  const refit = (alert: boolean) => { if (box.width) stage.style.setProperty('--fit', fitFor(box.width, box.height, alert, stackShown()).toFixed(3)); };
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
    const ord = order(id), u = uiOf(id), map = readings[id] ?? new Map<string, { ch: Channel; r: Reading }>();
    // The keypad only lives on the front layer: if its channel went behind (an alert came first), it closes.
    if (u.code && ord[0] !== u.code.key) u.code = null;
    // Repaint only if something of this system changed.
    const SZ = sizes(stackShown());
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(map.get(k)!.r)]), [...u.seen], [...failed.keys()], flat, toast, SZ.length,
      PHONE ? IDS.map((o) => [order(o)[0], worst(o)]) : 0, u.code && [u.code.key, u.code.value.length, u.code.wrong, u.code.format]]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement() as HTMLElement | null;
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    // A new alert opens the 3D view; after that the toggle decides.
    const alert = live(id).length > 0;
    if (alert && !alertWas) flat = false;
    alertWas = alert;
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
      const d = Math.min(i, SZ.length - 1);
      layer.hidden = i >= SZ.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', !!r.alert);
      layer.classList.toggle('is-seen', seen);
      layer.dataset.level = String(r.alert?.level ?? 0);
      const grow = SZ[d];
      layer.style.setProperty('--halo', (d * 0.8 / (grow * (1 + d * 110 / 900))).toFixed(2));
      const shown = r.alert && !seen ? r.alert : r;
      // The alerts that wait are their layers behind, in their color and named; the strip counts them.
      const more = detailAdds(r);
      layer.innerHTML = ring(key, r, strokeAt(d) / grow / LANE, i === 0, false, i === 0 && !!r.alert && !seen, ch.name) + (i === 0
        ? face({ glyph: ch.glyph, name: ch.name, big: shown.big, label: shown.label, to: more ? 'detail' : undefined,
          props: { system: id, channel: key }, aria: t.details(ch.name), image: imageOf(r),
          extra: (isPending(r) ? `<span class="face-wait">${t.sending}</span>` : '') + visualFor(id, key) })
        : backLayer({ text: `${ch.name} · ${shown.big}`, at: labelAt(i), grow, stroke: strokeAt(d), hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    startVisuals(el, visuals);
    // The keypad over the object while a code is being entered; the object waits behind.
    const front = map.get(ord[0]);
    setHTML(stage.querySelector<HTMLElement>('.keypad-slot')!, u.code && front
      ? keypad({ name: front.ch.name, title: u.code.title, verb: u.code.verb, format: u.code.format, value: u.code.value, wrong: u.code.wrong, glyph: front.ch.glyph, level: u.code.level })
      : '');
    obj.classList.toggle('is-waiting', !!u.code);
    // Beside the object, the channels front to back, each a button; past the stack, hollow.
    setHTML(stage.querySelector<HTMLElement>('.layer-index-slot')!, layerIndex(ord.map((key, i) => {
      const { ch, r } = map.get(key)!, shown = r.alert && !u.seen.has(key) ? r.alert : r;
      return { id: key, title: ch.name, big: shown.big, level: r.alert && !u.seen.has(key) ? r.alert.level : 0, off: i >= SZ.length };
    }), 'data-pick'));

    const frontItem = map.get(ord[0]);
    if (!frontItem) { strip.textContent = t.noEntities; return; }
    const hidden = ord.slice(SZ.length).map((k) => ({ key: k, name: map.get(k)!.ch.name }));
    const fa = frontItem.r.alert && !u.seen.has(ord[0]) ? frontItem.r.alert : null;
    if (dotsEl) {
      dotsEl.innerHTML = dots(IDS.filter((other) => order(other).length).map((other) => {
        const k = order(other)[0];
        return { id: other, title: SYS[other].title, level: worst(other), ring: ring(k, readings[other].get(k)!.r, DOT_LANES) };
      }), id);
    }
    strip.innerHTML = toast ? `<span class="error">${esc(toast)}</span>`
      : u.code ? `<span>${esc(t.codeLine(frontItem.ch.name, u.code.title))}</span> <button class="plain" data-code="cancel">${t.cancel}</button>`
      : failuresOf(frontItem.r).length ? retryCard(frontItem.r)
      : fa ? `<strong>${frontItem.ch.name}:</strong> ${esc(fa.why)}.
          ${fa.busy ? `<span class="face-wait">${t.inProgress}</span>` : `<button class="primary level-${fa.level}" data-resolve="${ord[0]}">${esc(fa.verb)}</button>
          ${fa.acts.length ? `<button class="plain" data-seen="${ord[0]}">${t.mute}</button>` : ''}`}
          ${waiting.length ? `<span class="how">${t.moreWaiting(waiting.length)}</span>` : ''}`
      : calmStrip(sys.title, frontItem.ch.name, hidden);

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };

  const focusKey = (target: HTMLElement) => {
    const layer = target.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-act', 'data-key', 'data-code']) {
      const v = target.getAttribute(a);
      if (v === null) continue;
      const handle = target.getAttribute('data-handle');
      return `${(a === 'data-seg' || a === 'data-key') && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]${handle ? `[data-handle="${handle}"]` : ''}`;
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
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12') ?? null,
    current: d.fraction,
    stepOf: d.stepOf,
    set: (key, v, handle) => d.setDial(key, d.snap(key, v), Infinity, handle),
    nearest: d.nearest,
    onStart: () => { dragging = true; },
    onEnd: (key) => { dragging = false; d.commit(key); },
    onInput: d.commitSoon,
    activate: 'o-arc[data-pick], o-arc[data-seg]',
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
    // The keypad: a digit from the ring, delete, cancel or send.
    const digit = target.closest<HTMLElement>('[data-key]')?.dataset.key;
    const code = target.closest<HTMLElement>('[data-code]')?.dataset.code;
    if (digit !== undefined) { typeCode(digit); return; }
    if (code === 'delete') { typeCode(null); return; }
    if (code === 'cancel') { uiOf(id).code = null; repaint(); return; }
    if (code === 'enter') { void sendCode(id); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const { r } = readings[id].get(key)!, s = r.segs![Number(seg.dataset.seg)];
      if (s.act && !pending.has(s.id)) askCode(id, key, [s.act], s.label, s.label, r.alert?.level);
      return;
    }
    if (pick && !locked) { uiOf(id).pick = pick; lock(); }
    else if (resolve) {
      const a = readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.acts.length) askCode(id, resolve, a.acts, a.verb, a.verb, a.level);
      else uiOf(id).seen.add(resolve);
      lock();
    } else if (seenKey) { uiOf(id).seen.add(seenKey); lock(); }
    else if (act === 'view') flat = !flat;
    else return;
    repaint();
  });

  // A digit (or a deletion) into the code being entered; the input of a text code keeps its own.
  const typeCode = (digit: string | null) => {
    const c = uiOf(id).code;
    if (!c) return;
    c.wrong = false;
    c.value = digit === null ? c.value.slice(0, -1) : c.value + digit;
    repaint();
  };
  // With the keypad open the keyboard types the code wherever the focus is
  // (a tap on the ring leaves none): digits, Backspace, Enter sends, Escape cancels.
  const onKey = (e: KeyboardEvent) => {
    const u = uiOf(id);
    if (!u.code || !el.closest('.is-current-view')) return;
    const target = e.target as HTMLElement;
    const inInput = target.matches('.code-input');
    if (!inInput && (target.matches('input, textarea, select') || target.closest('.settings'))) return;
    if (e.key === 'Escape') { u.code = null; repaint(); }
    else if (e.key === 'Enter' && (inInput || !target.matches('button, o-arc'))) void sendCode(id);
    else if (inInput) return;
    else if (/^[0-9]$/.test(e.key)) typeCode(e.key);
    else if (e.key === 'Backspace') typeCode(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey, true));
  // Typing in the input of a text code: no repaint (it would lose the caret), the buttons follow by hand.
  el.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement, c = uiOf(id).code;
    if (!c || !target.matches('.code-input')) return;
    c.value = target.value; c.wrong = false;
    el.querySelector('.keypad')?.classList.remove('is-wrong');
    el.querySelectorAll<HTMLButtonElement>('[data-code="delete"], [data-code="enter"]').forEach((b) => { b.disabled = !c.value; });
  });

  // ─── Phone: from one system to the next ───
  const goSystem = (other: string) => {
    if (other !== id) void app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // The browser leaves the horizontal gesture to the page (otherwise it cancels
  // it as a scroll) so Zumly's lateral swipe sees it.
  if (PHONE) el.style.touchAction = 'pan-y';
  parallax(stage, () => obj, () => !flat);

  paint();
  whenCurrent(ctx, paint);
}

// ─── The changes of the last hours ──────────────────────────────────

// One tap further than the orbit's time: every change of the window as a list
// scrolled in a circle, when and whose along the ring, and the whole text of
// the one in focus in the middle, where a long alert has room.
function changes(ctx: ViewContext) {
  const el = ctx.target;
  const span = Number(ctx.props.span) || 12, title = t.changesTitle(span);
  el.dataset.title = title;
  if (host.changes && !pastChanges) void loadPast();
  // All of the window, not only the twelve the ring shows; taken once, so the list holds still under the finger.
  let list = timeMarks(span, 500);
  const key = 'changes', st = scrollState(key);
  // It opens on the newest, the alerts first when one is open.
  st.focus = Math.max(0, list.findIndex((m) => m.level)); st.offset = Math.max(0, Math.min(list.length - SCROLL_VISIBLE, st.focus - 3));
  // The middle: when, whose and how long ago; the whole text, in its alert's color; if it is still open, the way to it.
  const center = () => {
    const m = list[st.focus];
    if (!m) return `<p class="hint">${t.waitingChanges}</p>`;
    const open = m.level && live(m.id).length;
    return `<p class="eyebrow">${esc(`${m.when} · ${m.name} · ${t.agoShort(m.ago)}`)}</p><p class="changes-text${m.level ? ` level-${m.level}` : ''}">${esc(m.text)}</p>${
      open ? `<p class="changes-still">${t.stillOpen}</p>` : ''}<button class="plain changes-go zoom-me" data-to="sys-${esc(m.id)}" data-system="${esc(m.id)}">${esc(t.open(m.name))}</button>`;
  };
  const paint = () => {
    el.innerHTML = `<div class="changes-view"><p class="eyebrow changes-head">${esc(`${title} · ${t.nChanges(list.length)}`)}</p><div class="changes-stage">${
      scrollList(list.map((m) => ({ label: `${m.when} · ${m.name}`, on: false, act: true, level: m.level })), st, { key, name: title })}
      <div class="changes-center" aria-live="polite">${center()}</div></div></div>`;
  };
  paint();
  // The history may arrive after the zoom: then, once, the list fills.
  const fill = () => { if (list.length || !pastChanges) return; list = timeMarks(span, 500); if (list.length) paint(); };
  rerender.add(fill);
  ctx.onCleanup(() => { rerender.delete(fill); });
  // The arrows, the wheel and a tap move the focus: the middle follows.
  const follow = () => { const c = el.querySelector<HTMLElement>('.changes-center'); if (c) setHTML(c, center()); };
  ctx.onCleanup(scrollControls(el, { state: scrollState, count: () => list.length, pick: (_, i) => { st.focus = i; follow(); } }));
  for (const type of ['keyup', 'wheel', 'pointerup']) el.addEventListener(type, () => requestAnimationFrame(follow));
}

// ─── Channel detail ─────────────────────────────────────────────────

// Principle: the disc opens a detail only when the detail adds something the
// face does not have: a day of changes, a history, a long list, a picture,
// color, the month, or several things to name. A control of one thing that
// is resolved on the face (a volume, a fan, a thermostat with no history)
// has no detail: it would repeat the face.
const detailAdds = (r: Reading) => !!(r.tracks?.length || r.history || r.list || r.image || r.color || r.month) || r.ids.length > 1;

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
  let square = false, live = false, dragging = false;
  const paint = () => {
    if (dragging) return;              // repainting would cut the drag
    const item = readings[id]?.get(key);
    if (!item) return;
    const { ch, r } = item;
    const history = r.history ? histories.get(r.history) : undefined;
    const trackIds = r.tracks?.length && host.changes ? r.tracks.map((x) => x.id).join(' ') : '';
    const changes = trackIds ? changesOf.get(trackIds) : undefined;
    const monthOf = r.month ? months.get(monthKey(r.month)) : undefined;
    const now = JSON.stringify([r, [...pending.keys()], [...failed.keys()], toast, square, live, history?.values?.length ?? history?.error,
      changes?.at ?? changes?.error, monthOf?.at, host.changedAt?.(r.events?.[0]?.id ?? ''), look()]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement();
    const focusSel = focus && el.contains(focus) && focus.matches('[data-dial]')
      ? `[data-dial="${focus.dataset.dial}"]${focus.dataset.handle ? `[data-handle="${focus.dataset.handle}"]` : ''}` : null;
    const a = r.alert && !uiOf(id).seen.has(key) ? r.alert : null;
    // The dial, big, operated like the system's front ring (a knob at each
    // end of a range), what is now in its center; a light's hue and
    // saturation as curved sliders inside it, the center washed with the color.
    let control = '';
    if (r.dial) {
      const color = r.color?.hs ? hsCss(r.color.hs[0], r.color.hs[1]) : undefined;
      const value = r.range ? `${num(r.range.lo)}–${num(r.range.hi)}${r.dial.unit}` : `${num(r.dial.value)}${r.dial.unit}`;
      control = `<div class="bigbang detail-ring"><div class="gravity-spot">${ring(key, r, DETAIL_LANES, true, false, false, ch.name)}${
        r.color ? colorArcs(key, r.color.hs, { open: look().dial === 'open', name: ch.name }) : ''}${
        ringCenter(value, r.dial.label, r.color ? 13 : 18, color)}</div></div>`;
    } else if (r.list) {
      // A long choice: its options scrolled in a circle; the list opens at the one that is on.
      const sk = `${id}/${key}`, st = scrollState(sk), on = r.list.findIndex((x) => x.on);
      if (!scrollOpened.has(sk) && on >= 0) { st.focus = on; st.offset = Math.max(0, Math.min(r.list.length - SCROLL_VISIBLE, on - 3)); scrollOpened.add(sk); }
      control = scrollList(r.list.map((x) => ({ label: x.label, on: x.on, act: !!x.act })), st, { key: sk, name: r.name ?? ch.name });
      if (r.ids.some((e) => pending.has(e))) control = control.replace('class="bigbang detail-ring scroll-list"', 'class="bigbang detail-ring scroll-list is-pending"');
    } else if (r.segs) {
      // Switches, or the options of a choice (radios: the one that is on has no action).
      const type = r.kind === 'c' ? 'radio' : 'checkbox';
      control = `<ul class="switches${r.kind === 'c' ? ' choice' : ''}">${r.segs.map((s, i) => `<li><label class="${pending.has(s.id) ? 'is-pending' : ''}${
        r.alert?.fail?.includes(i) ? ` fail level-${r.alert.level}` : ''}">
        <input type="${type}" name="seg" data-seg="${i}"${s.on ? ' checked' : ''}${s.act ? '' : ' disabled'}> ${esc(s.label)}
        <span class="state">${esc(r.kind === 'c' ? '' : host.stateOf(s.id))}</span></label></li>`).join('')}</ul>`;
    }
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
        big: a ? a.big : r.big, label: a ? a.label : r.label, marks: true, names: true, aria: t.dayOf(ch.name),
      }) : `<p class="hint">${changes?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    } else if (r.history && host.history) {
      if (!history || (Date.now() - history.at > HISTORY_MS && history.values)) void loadHistory(r.history);
      const u = host.unitOf?.(r.history) ?? '';
      day = `<div class="history">${history?.values ? timeRing({ values: history.values, label: t.last24h, unit: u === '%' || !u ? u : ` ${u}`, marks: look().day === 'marks' })
        : `<p class="hint">${history?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    }
    // This month, a day per sector around: a meter's calendar.
    if (r.month && host.statistics) {
      if (!monthOf || (Date.now() - monthOf.at > MONTH_MS)) void loadMonth(r.month);
      const nowD = new Date(), name = host.nameOf(r.month);
      if (look().month === 'rolling') {
        // The last 30 days, today at the top; a notch where this month began.
        const values = monthOf?.values.length === ROLLING_DAYS ? monthOf.values : Array.from({ length: ROLLING_DAYS }, () => null);
        const v = values[ROLLING_DAYS - 1], first = ROLLING_DAYS - nowD.getDate();
        const total = values.reduce<number>((a, b) => a + (b ?? 0), 0);
        day += `<div class="history">${monthOf?.error ? `<p class="hint">${t.monthNone}</p>` : `<div class="month-window">${timeWindow({ span: ROLLING_DAYS, bars: values,
          turn: first > 0 ? { at: first, label: nowD.toLocaleDateString(localeOf(), { month: 'long' }) } : undefined, aria: t.lastDaysAria(name, ROLLING_DAYS) })}
          <div class="month-window-center"><span class="time-big">${v != null ? `${num(v)} kWh` : monthOf ? '—' : esc(t.loadingMonth)}</span>
          <span class="time-range">${esc(t.lastDays(ROLLING_DAYS, `${num(total, 0)} kWh`))}</span><span class="time-label">${esc(`${t.today} · ${name}`)}</span></div></div>`}</div>`;
      } else {
        const days = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate(), today = nowD.getDate();
        const values = monthOf?.values.length === days ? monthOf.values : Array.from({ length: days }, () => null);
        const title = nowD.toLocaleDateString(localeOf(), { month: 'long', year: 'numeric' }), v = values[today - 1];
        day += `<div class="history">${monthOf?.error ? `<p class="hint">${t.monthNone}</p>` : monthRing({ days, today, values, unit: ' kWh', title, aria: t.monthAria(name, title),
          big: v != null ? `${num(v)} kWh` : monthOf ? '—' : t.loadingMonth, label: `${t.today} · ${name}` })}</div>`;
      }
    }
    // What is now is said once: in the center of the rings, or as the headline.
    const inRing = rings || !!r.dial;
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${SYS[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      ${inRing ? '' : `<p class="detail-big${a ? ` level-${a.level}` : ''}">${esc(a ? a.big : r.big)}</p>
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
    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
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
  whenCurrent(ctx, paint);

  // ─── The dial and the color arcs: they move in place; the action goes out on release ───
  const d = dialBinding(id, () => el.querySelector<HTMLElement>('.detail-ring'), (_key, v) => {
    const big = el.querySelector('.detail-ring .ring-big');
    if (big) big.textContent = v.big;
  });
  const isHue = (k: string) => k.endsWith(':hue'), isSat = (k: string) => k.endsWith(':sat'), isColor = (k: string) => isHue(k) || isSat(k);
  const hsOf = (): [number, number] => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
    // A white light has no hue yet: the sliders start from a full red, not from white.
    return h ? [Math.floor(h.value / 1000), h.value % 1000] : r.color!.hs ?? [0, 100];
  };
  let colorTimer = 0;
  const sendColor = () => {
    const r = readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
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
    hold.set(`${r.color!.id}#hs`, { value: h * 1000 + sat, until: Infinity });
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
  }));

  ctx.onCleanup(scrollControls(el, {
    state: scrollState,
    count: () => readings[id].get(key)?.r.list?.length ?? 0,
    pick: (_, i) => { const x = readings[id].get(key)?.r.list?.[i]; if (x?.act && !pending.has(x.id)) void send([x.act]); },
  }));

  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.dataset.seg === undefined) return;
    const s = r.segs![Number(input.dataset.seg)];
    if (s.act) void send([s.act]);
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
    else { uiOf(id).seen.add(key); repaint(); }
  });
}

// ─── Start ──────────────────────────────────────────────────────────

Object.assign(views, { board, detail, changes, ...Object.fromEntries(ALL.map((id) => [`sys-${id}`, (ctx: ViewContext) => system(ctx, id)])) });
const app = new Zumly(zumlyOptions(views, 'board', canvas));
app.on('afterZoomOut', () => repaint());
const stopGestures = zoomOutGestures(app, canvas);

// Things some channel shows: only those enter the change log.
const watched = () => new Set(IDS.flatMap((id) => [...readings[id].values()].flatMap((x) => x.r.ids)));
let loaded = false;

const onStatus = () => {
  setLocale(host.language);
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
    for (const f of fresh) log.unshift({ at: new Date(), text: `${SYS[f.id].title}: ${f.a.why}`, level: f.a.level, system: f.id });
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
  unsubscribe = [h.onStatus(onStatus), h.onChange(onChange), h.onStructure?.(() => { applySettings(); repaint(); }) ?? (() => {})];
};
subscribe(host);
setLocale(host.language);
// The host may already hold data (a card's `hass` arrives before the mount).
compute();
const setHost = (h: PulseHost) => {
  if (h === host) return;
  host = h;
  for (const s of h.systems) if (ALL.includes(s.id)) SYS[s.id] = s;
  loaded = false;
  log.length = 0;
  pending.clear();
  hold.clear();
  setLocale(h.language);
  applySettings();
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
    destroy: () => { unsubscribe.forEach((fn) => fn()); compact.disconnect(); stopGestures(); app.destroy(); },
    ui,
    readings: () => readings,
  };
}
