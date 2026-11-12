// One knob: the whole object handled by turning and pressing, for a screen
// with an encoder beside it, a dial on the desk or three keys. Turning walks
// what the view in front offers (its systems, the segments of a ring, the
// layers behind, the keys of the keypad, the buttons of the strip); pressing
// opens or acts on the one it is at; a long press steps back. A dial, a
// wheel of color or a list takes the turn for itself once it is held: a press
// holds it, and the first turn inside a system holds the dial in front, so
// the knob is that thing's control the moment it opens.
//
// The knob moves the focus and speaks to each control in the keys it already
// answers, so whatever the keyboard reaches, the knob reaches, and the other
// way round.

import type { Board } from './context.ts';

export type Knob = {
  // Clockwise is positive: `turn(1)` is one click of the encoder.
  turn(steps: number): void;
  press(): void;
  // A step back: lets go of what is held, closes the keypad, or zooms out.
  back(): void;
};

// What the knob stops at, and what it leaves out: the board's own furniture
// (the gear, the way out, the view switch) and the second ways to the same
// thing (the index beside the object, the phone's dots, the 3D toggle).
const STOPS = 'button, [tabindex="0"], a[href], summary';
const NOT = '.settings, .gear, .exit, .modes, .layer-index, .foot, .conn-slot, .z-depth-nav';
// Where it lands in a view it has not been in: the first of these there is.
const START = ['.keypad .key', '.layer-front [data-dial]', '.layer-front o-arc[data-seg]', '.scroll-list', '.radial-list', '.zoom-me[data-system]', '[data-qitem]'];
// What takes the turn once held: a slider by its arrows, a list by its own.
const LISTS = '.scroll-list, .radial-list';
const HELD = `[data-dial], [data-wheel], ${LISTS}`;
// How long a press is held to mean "back".
export const KNOB_HOLD_MS = 600;

export function wireKnob(b: Board, keys: boolean): { knob: Knob; stop(): void } {
  const { canvas } = b;
  let holding = false, sending = false;
  // The way in: what was pressed to open each view (nothing, when it opened some other way), to come back to it.
  const trail: (HTMLElement | null)[] = [];
  let pressed: HTMLElement | null = null;

  const view = () => canvas.querySelector<HTMLElement>(':scope > .z-view.is-current-view');
  const root = () => canvas.getRootNode() as Document | ShadowRoot;
  const at = (v: HTMLElement) => { const a = root().activeElement as HTMLElement | null; return a && v.contains(a) ? a : null; };
  const stops = (v: HTMLElement) => {
    // With the keypad over the object, only the keypad (and its cancel).
    const scope = v.querySelector('.keypad') ? '.keypad, .strip' : null;
    return [...v.querySelectorAll<HTMLElement>(STOPS)].filter((el) => !el.closest(NOT) && !(el as HTMLButtonElement).disabled
      && (!scope || el.closest(scope)) && el.getClientRects().length > 0);
  };
  // The canvas says the knob is in use (and whether it holds something), so the focus shows wherever it is.
  const mark = () => { canvas.dataset.knob = holding ? 'held' : 'on'; };
  // The focus never scrolls the canvas (Zumly moves its views by transform); a detail taller than
  // its screen is scrolled here, the stop brought to its middle.
  const focus = (el: HTMLElement) => {
    el.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
    const sc = el.closest<HTMLElement>('.detail');
    if (!sc || sc.scrollHeight <= sc.clientHeight + 1) return;
    const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect();
    sc.scrollTop += r.top + r.height / 2 - (s.top + s.height / 2);
  };
  const start = (v: HTMLElement, list: HTMLElement[]) => {
    for (const sel of START) { const el = v.querySelector<HTMLElement>(sel); if (el && list.includes(el)) return el; }
    return list[0];
  };
  // To what is held, in its own keys: the arrows a slider and a list already answer.
  const key = (el: HTMLElement, k: string) => {
    sending = true;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true }));
    sending = false;
  };
  const turnHeld = (el: HTMLElement, steps: number) => {
    const k = el.matches(LISTS) ? (steps > 0 ? 'ArrowDown' : 'ArrowUp') : steps > 0 ? 'ArrowRight' : 'ArrowLeft';
    for (let i = Math.abs(steps); i > 0; i--) key(el, k);
  };

  // Into a view the knob has not been in: its first stop, and the dial in front of a system held from
  // the start, so the knob is that thing's control the moment it opens.
  const land = () => {
    const v = view(), list = v ? stops(v) : [];
    holding = false;
    if (!v || !list.length) { mark(); return null; }
    const first = start(v, list);
    focus(first);
    holding = first.matches('.layer-front [data-dial]');
    mark();
    return first;
  };

  const turn = (steps: number) => {
    const v = view();
    if (!v || !steps) return;
    // The knob taken up again (after a touch, or for the first time): it lands first.
    if (!canvas.dataset.knob) { const first = land(); if (first && holding) turnHeld(first, steps); return; }
    const a = at(v);
    if (holding && a?.matches(HELD)) { turnHeld(a, steps); return; }
    holding = false;
    const list = stops(v), i = a ? list.indexOf(a) : -1;
    if (i < 0) { land(); return; }
    const next = list[(((i + steps) % list.length) + list.length) % list.length];
    focus(next);
    mark();
    // The list's center follows the knob: the item it is at comes to the center, and a press opens it.
    if (next.matches('[data-qitem][aria-pressed="false"]')) next.click();
  };

  const press = () => {
    const v = view();
    if (!v) return;
    const a = at(v);
    if (!canvas.dataset.knob || !a || !stops(v).includes(a)) { land(); return; }
    if (a.matches(LISTS)) { if (holding) key(a, 'Enter'); else holding = true; mark(); return; }
    if (a.matches(HELD)) { holding = !holding; mark(); return; }
    pressed = a;
    if (a.matches('.zoom-me')) void b.app.zoomIn(a);
    else a.click();
  };

  const back = () => {
    const v = view();
    if (!v) return;
    if (holding) { holding = false; mark(); return; }
    const cancel = v.querySelector<HTMLElement>('[data-code="cancel"]');
    if (cancel) { cancel.click(); return; }
    if (canvas.querySelectorAll(':scope > .z-view').length > 1) void b.app.zoomOut();
  };

  // A view opened: the knob lands in it, and what was pressed to open it is kept as the way back.
  // A view closed: the knob is back on what opened it.
  const onIn = () => {
    trail.push(pressed?.isConnected ? pressed : null);
    pressed = null;
    if (canvas.dataset.knob) land();
  };
  const onOut = (e: { levels?: number }) => {
    let from: HTMLElement | null = null;
    for (let i = Math.max(1, e.levels ?? 1); i > 0; i--) from = trail.pop() ?? null;
    if (!canvas.dataset.knob) return;
    holding = false;
    if (from?.isConnected) { focus(from); mark(); } else land();
  };
  b.app.on('afterZoomIn', onIn);
  b.app.on('afterZoomOut', onOut);

  // A pointer takes over: the knob's mark goes, and what it held is let go.
  const onPointer = () => { holding = false; delete canvas.dataset.knob; };
  canvas.addEventListener('pointerdown', onPointer, true);

  // ─── The keys and the wheel, when the shell asks for them ───
  // Arrows turn (right and down clockwise), Enter and Space press (held: back),
  // Escape goes back; the wheel turns, a click of it per step. They are taken
  // before anything else sees them: Zumly reads the arrows as navigation, and a
  // dial under the pointer would take the wheel.
  let long = false, timer = 0, acc = 0, accTimer = 0;
  const mine = (e: KeyboardEvent) => {
    if (sending || !canvas.isConnected || e.metaKey || e.ctrlKey || e.altKey) return null;
    const target = e.composedPath()[0] as HTMLElement | null;
    const typing = target?.matches?.('input, textarea, select') || target?.closest?.('.settings');
    if (typing) return e.key === 'Escape' && target?.matches('.code-input') ? 'back' : null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return 'cw';
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return 'ccw';
    if (e.key === 'Enter' || e.key === ' ') return 'press';
    return e.key === 'Escape' ? 'back' : null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const what = mine(e);
    if (!what) return;
    e.preventDefault();
    e.stopPropagation();
    if (what === 'cw') turn(1);
    else if (what === 'ccw') turn(-1);
    else if (what === 'back') back();
    else if (!e.repeat) { long = false; clearTimeout(timer); timer = window.setTimeout(() => { long = true; back(); }, KNOB_HOLD_MS); }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const what = mine(e);
    if (!what) return;
    e.preventDefault();
    e.stopPropagation();
    if (what !== 'press') return;
    clearTimeout(timer);
    if (!long) press();
    long = false;
  };
  const onWheel = (e: WheelEvent) => {
    // The pinch stays the way back (zoomOutGestures); the gear scrolls as a panel does.
    if (e.ctrlKey || (e.target as Element | null)?.closest?.('.settings')) return;
    e.preventDefault();
    e.stopPropagation();
    acc += e.deltaY;
    const steps = Math.trunc(acc / 60);
    if (steps) { acc -= steps * 60; turn(steps); }
    clearTimeout(accTimer);
    accTimer = window.setTimeout(() => { acc = 0; }, 300);
  };
  if (keys) {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  }

  return {
    knob: { turn, press, back },
    stop: () => {
      clearTimeout(timer);
      clearTimeout(accTimer);
      canvas.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      canvas.removeEventListener('wheel', onWheel, { capture: true });
    },
  };
}
