// The board: every system at once, four ways to look at it over the same
// data. Grid, a mini ring per system; orbit, the pulse in the center and the
// systems around it; layers, one object with a system per layer; list, a
// queue on two rings. What calls comes first in all four.

import type { ViewContext } from 'zumly';
import { localeOf, time } from '../../i18n.ts';
import {
  LANE, LOCK_MS, MINI_LANES, backLayer, esc, face, icon, layerIndex, orbitHub, parallax, queueRings,
  type HubLook, type HubNews, type ListItem,
} from '../../radial/index.ts';
import { tune } from '../../tune.ts';
import type { Board } from '../context.ts';
import { forget, ring, setHTML, startVisuals, visualFor } from '../draw.ts';
import { settingsPanel, syncSettings, wireGear } from '../gear.ts';
import { calmOpen, layersShown, look, setSettings } from '../settings.ts';
import { live, order, uiOf, watched, whenCurrent, worst } from '../state.ts';
import { PAST_MS, hourCounts, loadPast, timeMarks } from '../time.ts';
import { BOARD_MODES, type BoardMode } from '../types.ts';

const EXIT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 7l5 5-5 5"/><path d="M20 12H9"/></svg>`;
// The labels of the layers behind, spread out so they do not overlap.
const LABEL_AT = [300, 30, 330, 60, 280, 80];

// The weight of a system's ring on the board follows its level: what is fine a
// thin line, what calls heavier, the most serious the heaviest. Sizes never change.
const boardLanes = (level: number) => MINI_LANES * ([0.6, 1, 1.35][level] ?? 1);

// Systems by urgency, the most serious first, the usual order within a level;
// a choice made by hand never moves them (the queue of the orbit, the grid,
// the list and the index beside the layers).
function urgencyOrder(b: Board, ids: string[]) {
  return ids.map((id, i) => ({ id, i, w: worst(b, id) })).sort((x, y) => y.w - x.w || x.i - y.i).map((x) => x.id);
}
const calmFolds = (b: Board, ids: string[]) => ids.some((id) => worst(b, id)) && ids.some((id) => !worst(b, id));

// Systems front to back: the choice made by hand, the ones calling (most serious
// first) and then the usual order. A new alert cancels the choice.
function boardOrder(b: Board) {
  const base = b.ids.filter((id) => order(b, id).length);
  const calling = base.filter((id) => worst(b, id)).sort((x, y) => worst(b, y) - worst(b, x));
  const all = [...calling, ...base.filter((id) => !calling.includes(id))];
  const pick = b.boardPick;
  if (pick && all.includes(pick)) all.sort((x, y) => Number(y === pick) - Number(x === pick));
  return all;
}

// The reading that represents a system: its front channel.
function front(b: Board, id: string) {
  const key = order(b, id)[0], { ch, r } = b.readings[id].get(key)!;
  const a = r.alert && !uiOf(b, id).seen.has(key) ? r.alert : null;
  return { key, ch, r, a, big: a ? a.big : r.big, label: a ? a.label : r.label };
}

// ─── The headline ───

function headlineLevel(b: Board) {
  return b.host.status !== 'live' ? 0 : Math.max(0, ...b.ids.flatMap((id) => live(b, id).map((k) => b.readings[id].get(k)!.r.alert!.level)));
}
function headline(b: Board) {
  const { t } = b;
  if (b.host.status !== 'live') return t.connecting;
  const calling = b.ids.flatMap((id) => live(b, id).map((k) => ({ id, k, a: b.readings[id].get(k)!.r.alert! })))
    .sort((x, y) => y.a.level - x.a.level);
  if (!calling.length) return t.allCalm;
  if (calling.length === 1) return `${calling[0].a.why}.`;
  return `${t.thingsCalling(calling.length, calling[0].a.why.toLowerCase())}.`;
}

// ─── Grid ───

function mini(b: Board, id: string) {
  const sys = b.sys[id], key = order(b, id)[0];
  if (!key) return '';
  const { ch, r } = b.readings[id].get(key)!;
  const level = worst(b, id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${b.t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(b, key, r, boardLanes(level), false, !r.alert)}</span></span>${visualFor(id, key)}
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !uiOf(b, id).seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

// The calm, folded: one quiet tile with a dot for each (or, open, the button that folds them again).
function calmTile(b: Board, n: number) {
  const { t } = b;
  return calmOpen(b)
    ? `<button class="tile calm-fold is-open" data-calm aria-expanded="true"><span class="calm-ring"></span><span class="tile-title">${t.foldCalm}</span></button>`
    : `<button class="tile calm-fold" data-calm aria-expanded="false" aria-label="${esc(t.showTheCalm(n))}"><span class="calm-ring">${
      '<i></i>'.repeat(Math.min(n, 8))}</span><span class="tile-title">${t.calmN(n)}</span></button>`;
}
// The same under the layers and the list.
const calmToggle = (b: Board, n: number) => `<button class="calm-toggle" data-calm aria-expanded="${calmOpen(b)}">${calmOpen(b) ? b.t.foldCalm : `${b.t.calmN(n)} · ${b.t.showCalm}`}</button>`;

// ─── Orbit ───

// A system of the orbit: an Orbit satellite. Orbit places it; the ring fills the
// satellite and the text hangs outward with Orbit's `.outward-y` (above in the
// top half, below in the rest).
function orbitTile(b: Board, id: string) {
  const f = front(b, id), level = worst(b, id), title = b.sys[id].title;
  return `<div class="satellite"><div class="capsule">
    <button class="otile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${b.t.open(title)}">
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${ring(b, f.key, f.r, boardLanes(level), false, !f.r.alert)}</span></span>
        <span class="otile-glyph">${icon(f.ch.glyph, 24)}</span></span>
      <span class="otile-label outward-y"><span class="tile-title">${title}</span>
      <span class="tile-big">${esc(f.big)}</span></span>
    </button></div></div>`;
}

// The alerts open now, the most serious first: what the orbit's face steps through.
function openAlerts(b: Board) {
  return b.ids.flatMap((id) => live(b, id).map((k) => ({ id, k, ...b.readings[id].get(k)! })))
    .sort((x, y) => y.r.alert!.level - x.r.alert!.level || (uiOf(b, x.id).since.get(x.k) ?? 0) - (uiOf(b, y.id).since.get(y.k) ?? 0));
}
// The measures of the hub, from the gear's tuning.
const hubLook = (): HubLook => ({ gap: tune.timeGap, pointer: 'triangle', size: tune.timePointer, bar: tune.timeBar });
// Center of the orbit: one segment per system, facing its tile and pointing at
// it, painted if that system calls; inside, with time on, the news (orbitHub).
function hubRing(b: Board, ids: string[], news?: HubNews) {
  return orbitHub({ levels: ids.map((id) => worst(b, id)), news, look: hubLook(), rounded: look(b).ends === 'rounded', aria: b.t.hubAria });
}

// Inside the center, one thing at a time: each alert (most serious first) and
// at the end the pulse.
type Slide = { key: string; level: number; html: string };
function hubSlides(b: Board): Slide[] {
  const { t, host } = b;
  const alerts = b.ids.flatMap((id) => live(b, id).map((k) => ({ id, ...b.readings[id].get(k)!, k })))
    .sort((x, y) => y.r.alert!.level - x.r.alert!.level);
  const list: Slide[] = alerts.map(({ id, k, ch, r }) => {
    const a = r.alert!;
    return { key: `${id}:${k}`, level: a.level, html: `<div class="slide level-${a.level}">
      <p class="eyebrow">${esc(`${b.sys[id].title} · ${ch.name}`)}</p>
      <p class="slide-big">${esc(a.big)}</p>
      <p class="slide-why">${esc(a.why)}</p>
      <button class="plain slide-go" data-open="${id}">${t.openShort}</button></div>` };
  });
  // The three shown things that changed last, with their current value.
  const rows = [...watched(b)].map((e) => ({ id: e, at: host.changedAt?.(e) ?? 0 })).filter((x) => x.at > 0)
    .sort((x, y) => y.at - x.at).slice(0, 3)
    .map((x) => `<li><span>${esc(host.nameOf(x.id))}</span><strong>${esc(host.stateOf(x.id))}</strong></li>`);
  list.push({ key: 'pulse', level: 0, html: `<div class="slide">
    <p class="eyebrow">${t.pulse} · ${time(new Date()).slice(0, 5)}</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? t.nAlerts(alerts.length) : t.allCalm.replace(/\.$/, '')}</p>
    <ul class="hub-rows">${rows.join('') || `<li><span>${t.waitingChanges}</span></li>`}</ul></div>` });
  return list;
}

// ─── The view ───

export function boardView(b: Board, ctx: ViewContext) {
  const { t, options } = b;
  const modes: [BoardMode, string][] = BOARD_MODES.map((m) => [m, t.modes[m]]);
  const el = ctx.target;
  el.dataset.title = t.board;   // shown by Zumly's back button
  el.innerHTML = `<div class="board">
    <header class="board-head"><span class="conn-slot"></span>
      <nav class="modes" aria-label="${t.viewSelector}">${modes.map(([m, label]) =>
        `<button class="mode" data-mode="${m}">${label}</button>`).join('')}</nav><h1></h1>
      <p class="error" hidden></p></header>
    <div class="board-body"></div>
  </div><button type="button" class="exit${b.store ? ' with-gear' : ''}" data-action="signout" hidden>${EXIT}</button>` + (b.store ? settingsPanel(b) : '');
  const boardEl = el.querySelector<HTMLElement>('.board')!;
  const body = el.querySelector<HTMLElement>('.board-body')!;
  if (b.store) { if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; }
  const form = el.querySelector<HTMLFormElement>('.settings');
  let built: BoardMode | null = null;
  let layers = new Map<string, HTMLElement>();
  let beat = b.log[0];
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
  parallax(body, () => body.querySelector<HTMLElement>('.stage .obj'), () => ['orbit', 'layers'].includes(b.mode));

  const build = () => {
    built = b.mode;
    layers = new Map();
    boardEl.className = `board mode-${b.mode}`;
    forget(body);
    unbuild?.();
    unbuild = null;
    if (b.mode === 'list') {
      body.innerHTML = `<div class="stage list-stage queue-stage"><div class="one"></div><div class="queue-foot"></div></div>`;
    } else if (b.mode === 'orbit') {
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
    } else if (b.mode === 'layers') {
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
    const folded = calmFolds(b, all) && !calmOpen(b);
    const shown = folded ? all.filter((id) => worst(b, id) || id === b.boardPick) : all;
    const n = Math.max(1, Math.min(shown.length, layersShown(b)));
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
      const f = front(b, id), scale = 1 + grow * d, level = worst(b, id), title = b.sys[id].title;
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
      setHTML(layer, ring(b, f.key, f.r, stroke / scale / LANE, false, !level) + (i === 0
        ? face({ glyph: f.ch.glyph, name: title, big: f.big, label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`,
          to: `sys-${id}`, props: { system: id }, aria: t.open(title), extra: visualFor(id, f.key) })
        : backLayer({ text: `${title} · ${f.big}`, at: LABEL_AT[(i - 1) % LABEL_AT.length], grow: scale, stroke, hit: 8,
          pick: { attr: 'data-bpick', value: id, aria: t.bringToFront(title) } })));
    });
    const stage = body.querySelector<HTMLElement>('.board-stage')!;
    // Beside the object, the layers front to back, each a button; the ones past the cap hollow.
    setHTML(stage.querySelector<HTMLElement>('.layer-index-slot')!, layerIndex(urgencyOrder(b, b.ids.filter((id) => all.includes(id))).map((id) => ({
      id, title: b.sys[id].title, big: front(b, id).big, level: worst(b, id), off: !ids.includes(id), front: id === ids[0] })), 'data-bpick'));
    const zoom = ids.some((id) => worst(b, id)) ? 'alert' : 'calm';
    if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
    // Under the object: the systems past the cap, each a button that brings it to the front. No feed of changes.
    const calm = all.filter((id) => !worst(b, id)), capped = rest.filter((id) => worst(b, id) || !folded);
    setHTML(stage.querySelector<HTMLElement>('.board-strip')!, (capped.length ? `<span class="behind">${t.behind(capped.length)}: ${capped.map((id) =>
      `<button class="more" data-bpick="${id}" aria-label="${esc(t.bringToFront(b.sys[id].title))}">${b.sys[id].title}</button>`).join(', ')}</span>` : '')
      + (calmFolds(b, all) ? calmToggle(b, calm.length) : ''));
  };

  // The list: the systems as a queue on two rings (queueRings), what calls
  // inside by urgency and the calm folded outside. The center holds the one
  // in focus: the most serious, unless the viewer picked another.
  const listItem = (id: string): ListItem => {
    const f = front(b, id);
    return { id, title: b.sys[id].title, ring: ring(b, f.key, f.r, boardLanes(worst(b, id)), false, !f.r.alert), glyph: f.ch.glyph, big: f.big,
      label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`, level: worst(b, id) };
  };
  const paintList = (ids: string[]) => {
    const queue = urgencyOrder(b, ids), first = queue[0];
    const focus = b.listFocus && queue.includes(b.listFocus) ? b.listFocus : first;
    setHTML(body.querySelector<HTMLElement>('.queue-stage .one')!, queueRings(queue.map(listItem), { focus, open: calmOpen(b) }));
    // Under the object: back to what matters when a calm one is in the center, and the fold once open.
    const back = focus && !worst(b, focus) && first && worst(b, first)
      ? `<button class="queue-back" data-qfocus="${first}"><span class="queue-back-dot"></span>${esc(t.needsYou(b.sys[first].title))}</button>` : '';
    setHTML(body.querySelector<HTMLElement>('.queue-foot')!, back + (calmFolds(b, queue) && calmOpen(b) ? calmToggle(b, queue.filter((id) => !worst(b, id)).length) : ''));
  };

  // The orbit: the systems around, the hub in the center with the news inside it.
  const paintOrbit = (ids: string[], ready: boolean) => {
    // The systems queue by urgency, clockwise from the top: the most serious first (urgencyOrder).
    // Each part is replaced on its own: the carousel does not redraw the rings.
    const fixed = urgencyOrder(b, b.ids.filter((id) => ids.includes(id)));
    const hubEl = body.querySelector<HTMLElement>('.hub')!;
    if (hubEl.hidden !== !ready) hubEl.hidden = !ready;
    const tm = look(b).time, calling = fixed.some((id) => worst(b, id));
    const changesRing = tm === 'changes' || (tm === 'both' && calling), clock = (tm === 'clock' || tm === 'both') && !calling;
    if ((changesRing || clock) && b.host.changes && b.host.status === 'live' && (!b.pastChanges || Date.now() - b.pastChanges.at > PAST_MS)) void loadPast(b);
    const timeOn = changesRing || clock;
    hubEl.classList.toggle('has-time', timeOn);
    // The news inside the ring: the last 12 hours with the open alerts at the moment they began, or the calm day by hour.
    const alerts = openAlerts(b);
    if (b.hubAt >= alerts.length) b.hubAt = 0;
    const now = Date.now();
    const news: HubNews | undefined = changesRing
      ? { span: 12, alerts: alerts.map((a, i) => ({ ago: (now - (uiOf(b, a.id).since.get(a.k) ?? now)) / 3_600_000, level: a.r.alert!.level, current: i === b.hubAt })) }
      : clock ? { span: 24, bars: hourCounts(b) } : undefined;
    const hub = ready ? hubRing(b, fixed, news) : null;
    setHTML(body.querySelector<HTMLElement>('.hub-ring-slot')!, hub ? `<div class="hub-ring">${hub.svg}</div>` : '');
    if (hub) hubEl.style.setProperty('--hub-face-inset', `${(hub.inset * 100).toFixed(2)}%`);
    hubEl.style.setProperty('--hub-split', String(tune.timeSplit));
    // With time on, the face splits: now above the line, before under it (the last change, and the way into all of them).
    const span = changesRing ? 12 : 24, all = timeOn ? timeMarks(b, span, 500) : [];
    const last = all.find((m) => !m.level);
    hubEl.querySelector('.hub-face')!.classList.toggle('is-split', ready && timeOn);
    setHTML(body.querySelector<HTMLElement>('.hub-before')!, ready && timeOn ? `${last ? `<span class="hub-last">${esc(`${last.when} · ${last.text}`)}</span>` : ''}
      <button class="hub-changes zoom-me" data-to="changes" data-span="${span}" aria-label="${esc(t.openChanges(span))}">${esc(t.nChanges(all.length))} ›</button>` : '');
    const tilesEl = body.querySelector<HTMLElement>('.orbit-tiles')!;
    // Half a step of offset: no system right at the top, and each one faces its
    // segment of the center ring.
    tilesEl.style.setProperty('--o-from', `${180 / Math.max(1, fixed.length)}deg`);
    setHTML(tilesEl, fixed.map((id) => orbitTile(b, id)).join(''));
    if (ready) paintSlide();
    if (b.log[0] !== beat) { hubEl.classList.remove('beat'); void hubEl.offsetWidth; hubEl.classList.add('beat'); }
  };

  const paint = () => {
    if (built !== b.mode) build();
    // The headline is quiet: grey, in the color of the critical only when something is critical.
    // The orbit's center already says it, so there it is left to screen readers.
    const h1 = el.querySelector('h1')!;
    h1.textContent = headline(b);
    h1.className = `level-${headlineLevel(b)}`;
    // The connection line is the shell's (sign out, leave the demo); a card has none.
    // Only when it changed: the host repaints every few seconds and a button
    // recreated each time would lose taps.
    setHTML(el.querySelector<HTMLElement>('.conn-slot')!, options.status?.() ?? '');
    // The way out, next to the gear; the view switch only when chosen.
    const exitBtn = el.querySelector<HTMLButtonElement>('.exit')!, exitLabel = options.exit?.() ?? null;
    exitBtn.hidden = !exitLabel;
    if (exitLabel) { exitBtn.setAttribute('aria-label', exitLabel); exitBtn.title = exitLabel; }
    el.querySelector<HTMLElement>('.modes')!.hidden = look(b).modes === 'hidden';
    for (const x of el.querySelectorAll<HTMLElement>('[data-mode]')) x.setAttribute('aria-pressed', String(x.dataset.mode === b.mode));
    if (form) syncSettings(b, form);
    const err = el.querySelector<HTMLElement>('.error')!;
    err.hidden = b.host.status !== 'error';
    err.textContent = b.host.error;
    const ready = b.host.status === 'live' || b.host.hasData;
    const ids = ready ? boardOrder(b) : [];
    if (b.mode === 'grid') {
      // What calls first, by urgency; the calm folded into one tile while something calls.
      const queue = urgencyOrder(b, b.ids.filter((id) => ids.includes(id)));
      const calm = queue.filter((id) => !worst(b, id));
      const folds = calmFolds(b, queue);
      setHTML(body, `<div class="tiles">${(folds && !calmOpen(b) ? queue.filter((id) => worst(b, id)) : queue).map((id) => mini(b, id)).join('')}${
        folds ? calmTile(b, calm.length) : ''}</div>`);
    }
    else if (b.mode === 'orbit') paintOrbit(ids, ready);
    else if (b.mode === 'list') { if (ready) paintList(b.ids.filter((id) => ids.includes(id))); }
    else if (ready) paintLayers(ids);
    beat = b.log[0];
    startVisuals(b, body, visuals);
  };

  // The center of the orbit holds what matters most: the most serious alert,
  // or the pulse when all is calm. The rest call from their tiles
  // around it.
  const paintSlide = () => {
    const slides = hubSlides(b), tm = look(b).time, alerts = slides.filter((x) => x.level);
    const shown = alerts.length ? alerts[Math.min(b.hubAt, alerts.length - 1)] : slides[slides.length - 1];
    // All calm and the clock chosen: the time itself.
    const clock = !alerts.length && (tm === 'clock' || tm === 'both');
    const now = new Date();
    // Several open with time on: a dot each, in its color, to step through them (all the same size).
    const dots = tm !== 'off' && alerts.length > 1 ? `<nav class="hub-dots" aria-label="${t.alerts}">${alerts.map((a, i) =>
      `<button class="hub-dot level-${a.level}" data-hubat="${i}" aria-current="${i === b.hubAt}" aria-label="${esc(t.alertNof(i + 1, alerts.length))}"></button>`).join('')}</nav>` : '';
    setHTML(body.querySelector<HTMLElement>('.hub-slide')!, clock ? `<div class="slide hub-clock">
      <p class="eyebrow">${esc(now.toLocaleDateString(localeOf(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      <p class="slide-big clock-big">${time(now).slice(0, 5)}</p>
      </div>` : shown.html.replace(/<\/div>\s*$/, `${dots}</div>`));
  };
  // The clock moves on its own: once a minute is enough.
  const clockTimer = window.setInterval(() => { if (b.mode === 'orbit' && look(b).time !== 'off' && b.app.getCurrentViewName() === 'board') paint(); }, 30_000);
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
      if (tile) void b.app.zoomIn(tile);
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) { options.onAction?.(action); return; }
    const mode = target.closest<HTMLElement>('[data-mode]')?.dataset.mode as BoardMode | undefined;
    const pick = target.closest<HTMLElement>('[data-bpick]')?.dataset.bpick;
    if (target.closest('[data-calm]')) { setSettings(b, { calm: calmOpen(b) ? undefined : 'open' }); return; }
    const at = target.closest<HTMLElement>('[data-hubat]')?.dataset.hubat;
    if (at != null) { b.hubAt = Number(at); paint(); return; }
    const qitem = target.closest<HTMLElement>('[data-qitem]')?.dataset.qitem;
    if (qitem) { b.listFocus = qitem; paint(); return; }
    if (target.closest('[data-qfocus]')) { b.listFocus = null; paint(); return; }
    if (mode && mode !== b.mode) {
      setSettings(b, { mode });
    } else if (pick && !locked) {
      b.boardPick = pick;
      locked = true;
      setTimeout(() => { locked = false; }, LOCK_MS);
      paint();
    }
  });
  el.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && target.matches('o-arc[data-bpick]')) { e.preventDefault(); target.click(); }
  });

  wireGear(b, el);
  paint();
  whenCurrent(b, ctx, paint);
}
