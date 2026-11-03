// The board: every system at once, four ways to look at it over the same
// data (grid.ts, orbit.ts, layers.ts, list.ts). This is the view around
// them: the head with the headline and the connection, the way out, the
// gear, the body each mode draws in, and what a tap on the board means.

import type { ViewContext } from 'zumly';
import { LOCK_MS, parallax } from '../../../radial/index.ts';
import type { Board } from '../../context.ts';
import { forget, setHTML, startVisuals } from '../../draw.ts';
import { settingsPanel, syncSettings, wireGear } from '../../gear.ts';
import { calmOpen, look, setSettings } from '../../settings.ts';
import { live, order, whenCurrent, worst } from '../../state.ts';
import { BOARD_MODES, type BoardMode } from '../../types.ts';
import { paintGrid } from './grid.ts';
import { layersStage, paintLayers } from './layers.ts';
import { listStage, paintList } from './list.ts';
import { orbitStage, paintOrbit } from './orbit.ts';

const EXIT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 7l5 5-5 5"/><path d="M20 12H9"/></svg>`;

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

// The headline: what calls, the most serious first, or that all is calm.
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
  // The reason continues the sentence: its first letter lowered, unless the word is a name or an acronym (CPU, GitHub, M 7.1).
  const why = calling[0].a.why, lowered = /^[A-Z][a-z]/.test(why) && !/^[A-Z][a-z]+ \d/.test(why) ? why[0].toLowerCase() + why.slice(1) : why;
  return `${t.thingsCalling(calling.length, lowered)}.`;
}

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

  // A mode draws in a stage of its own, made again when the mode changes.
  const build = () => {
    built = b.mode;
    layers = new Map();
    boardEl.className = `board mode-${b.mode}`;
    forget(body);
    body.innerHTML = b.mode === 'list' ? listStage() : b.mode === 'orbit' ? orbitStage() : b.mode === 'layers' ? layersStage() : '';
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
    if (b.mode === 'grid') paintGrid(b, body, ids);
    else if (b.mode === 'orbit') paintOrbit(b, body, ids, ready, b.log[0] !== beat);
    else if (b.mode === 'list') { if (ready) paintList(b, body, b.ids.filter((id) => ids.includes(id))); }
    else if (ready) paintLayers(b, body, ids, layers);
    beat = b.log[0];
    startVisuals(b, body, visuals);
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
