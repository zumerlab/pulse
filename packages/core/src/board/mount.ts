// The radial object over a PulseHost, mounted on an element: the board, one
// view per system, the channel detail and the changes of the last hours, as
// Zumly views inside `canvas`. Readings, alerts and their resolution come
// from the host; what is shown is what it confirmed; until it does, the
// segment or the dial stays "sending". The board knows nothing about where
// the data comes from: a host hands it systems whose channels read into
// Readings, and runs the actions handed back. A shell (an app's page, a
// card's shadow root) mounts it and passes its own words for the host's things.

import Zumly, { type ViewContext } from 'zumly';
import { setLocale, t as T } from '../i18n.ts';
import type { Changed, PulseHost } from '../model.ts';
import { PHONE, startInside, zoomOutGestures, zumlyOptions } from '../radial/index.ts';
import type { Board } from './context.ts';
import { loadTab } from './gear.ts';
import { applySettings, loadSettings, setSettings, settings, startId, valid } from './settings.ts';
import { compute, repaint, watched, worst } from './state.ts';
import { AXES, type BoardHandle, type BoardOptions } from './types.ts';
import { boardView } from './views/board/index.ts';
import { changesView } from './views/changes.ts';
import { detailView } from './views/detail.ts';
import { systemView } from './views/system.ts';

export function mountBoard(canvas: HTMLElement, options: BoardOptions): BoardHandle {
  const host = options.host;
  const all = host.systems.map((s) => s.id);
  const store = options.settings === false ? null : options.settings ?? 'pulse-settings';
  const b: Board = {
    canvas, options,
    t: { ...T, ...options.strings },
    sys: Object.fromEntries(host.systems.map((s) => [s.id, s])),
    all,
    frame: { systems: [] },
    store,
    views: {},
    app: undefined as unknown as Zumly,   // made below, before any view runs
    host,
    local: loadSettings(store),
    ids: [], chosen: [], objects: [], mode: 'grid', axis: 'systems',
    ui: {}, readings: {}, channels: {},
    pending: new Map(), failed: new Map(), hold: new Map(), log: [], toast: '', loaded: false, rerender: new Set(),
    boardPick: null, listFocus: null, orbitPage: 0, hubAt: 0, tab: loadTab(store), scrolls: new Map(), scrollOpened: new Set(),
    months: new Map(), monthLoading: new Set(), pastChanges: null, pastLoading: false, histories: new Map(), dayChanges: new Map(),
    repaint: () => repaint(b),
    systemView: (id) => (ctx: ViewContext) => systemView(b, ctx, id),
  };
  // The frame: what the shell allows.
  b.frame = {
    systems: valid(b, options.systems).length ? valid(b, options.systems) : all, mode: options.mode, start: options.start,
    axis: options.axis && AXES.includes(options.axis) ? options.axis : undefined,
    groups: options.groups?.length ? options.groups : undefined,
    look: options.look,
    layers: options.layers && options.layers >= 1 ? Math.floor(options.layers) : undefined,
    stack: options.stack && options.stack >= 1 ? Math.floor(options.stack) : undefined,
  };
  applySettings(b);

  // In a small box (a card in a section of a dashboard, a narrow window) the
  // board tightens: smaller headline, fewer lines of ticker, the object bigger.
  const compact = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    canvas.classList.toggle('compact', width < 640 || height < 540);
  });
  compact.observe(canvas);

  // The views Zumly zooms between: the board, the detail, the changes and one
  // per system (the groups join as the host names them; Zumly looks a view up when it zooms).
  Object.assign(b.views, {
    board: (ctx: ViewContext) => boardView(b, ctx),
    detail: (ctx: ViewContext) => detailView(b, ctx),
    changes: (ctx: ViewContext) => changesView(b, ctx),
    ...Object.fromEntries(all.map((id) => [`sys-${id}`, b.systemView(id)])),
  });
  const app = new Zumly(zumlyOptions(b.views, 'board', canvas));
  b.app = app;
  app.on('afterZoomOut', () => repaint(b));
  const stopGestures = zoomOutGestures(app, canvas);

  // ─── The host ───

  const onStatus = () => {
    setLocale(b.host.language);
    if (b.host.status === 'signed-out') { b.loaded = false; b.log.length = 0; }
    options.onStatus?.(b.host.status);
    repaint(b);
  };
  const onChange = (changed: Changed[]) => {
    for (const c of changed) { b.pending.delete(c.id); b.failed.delete(c.id); const h = b.hold.get(c.id); if (h && h.until !== Infinity) b.hold.delete(c.id); }
    const fresh = compute(b);
    if (fresh.length) b.boardPick = null;
    if (b.loaded) {
      const w = watched(b);
      for (const c of changed) {
        if (!w.has(c.id) || !c.logged) continue;
        b.log.unshift({ at: new Date(), text: `${b.host.nameOf(c.id)} → ${b.host.stateOf(c.id)}`, level: 0, id: c.id });
      }
      for (const f of fresh) b.log.unshift({ at: new Date(), text: `${b.sys[f.id].title}: ${f.a.why}`, level: f.a.level, system: f.id });
      b.log.splice(12);
    }
    b.rerender.forEach((fn) => fn());
    // A new critical alert opens its system on its own, from its tile (not from the center).
    const critical = b.loaded && fresh.find((f) => f.a.level === 2);
    if (critical && app.getCurrentViewName() === 'board') {
      const tile = canvas.querySelector<HTMLElement>(`.is-current-view .zoom-me[data-system="${critical.id}"]`);
      if (tile) void app.zoomIn(tile);
    }
    if (!b.loaded && b.host.status === 'live') { b.loaded = true; void start(); }
  };

  // The host can change (the live one, a demo): only the current one reaches
  // the UI, and everything that was pending is forgotten.
  let unsubscribe: (() => void)[] = [];
  const subscribe = (h: PulseHost) => {
    unsubscribe.forEach((fn) => fn());
    unsubscribe = [h.onStatus(onStatus), h.onChange(onChange), h.onStructure?.(() => { applySettings(b); repaint(b); }) ?? (() => {})];
  };
  subscribe(host);
  setLocale(host.language);
  // The host may already hold data (a card's `hass` arrives before the mount).
  compute(b);
  const setHost = (h: PulseHost) => {
    if (h === b.host) return;
    b.host = h;
    for (const s of h.systems) if (all.includes(s.id)) b.sys[s.id] = s;
    b.loaded = false;
    b.log.length = 0;
    b.objects = [];
    b.pending.clear();
    b.hold.clear();
    setLocale(h.language);
    applySettings(b);
    subscribe(h);
    onStatus();
    if (h.hasData) onChange([]);
  };

  // Inside the system asked for; on the phone, inside the one that calls the most.
  async function start() {
    const first = startId(b) ?? (PHONE ? [...b.ids].sort((x, y) => worst(b, y) - worst(b, x))[0] : null);
    if (first) await startInside(app, first, canvas);
  }

  return {
    app,
    get host() { return b.host; },
    setHost,
    settings: () => settings(b),
    setSettings: (patch) => setSettings(b, patch),
    repaint: () => repaint(b),
    // A host already live at mount time (a card's `hass`) starts as soon as
    // the board is in the DOM; otherwise the first live change starts it.
    ready: app.init().then(() => { if (!b.loaded && b.host.status === 'live') { b.loaded = true; return start(); } }),
    destroy: () => { unsubscribe.forEach((fn) => fn()); compact.disconnect(); stopGestures(); app.destroy(); },
    ui: b.ui,
    readings: () => b.readings,
  };
}
