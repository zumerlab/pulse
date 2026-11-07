// A channel's ring: a band (a dial when it can be dragged, a range with two
// knobs), switches, or a choice with its names along the ring; the center of
// a detail's ring; and the gestures that drag, wheel and step a dial.

import { num, t } from '../i18n.ts';
import { esc, levelColor } from './markup.ts';
import { SWARM_FROM, swarmRing } from './swarm.ts';

export type RingSeg = { label: string; on: boolean; act?: unknown; to?: string; id?: string };
export type RingDial = { min: number; max: number; step: number; unit: string; label: string; value: number };
// The primitives of the object. 'p' a band that fills (a dial when it can be
// dragged); 's' segments that switch on and off; 'c' a choice: segments of
// which exactly one is on, with their names along the ring.
export type RingReading = {
  kind: 'p' | 's' | 'c';
  v?: number;                       // progress 0..1
  segs?: RingSeg[];
  dial?: RingDial;
  range?: { lo: number; hi: number };   // a 'p' with two handles: the band goes from lo to hi (fractions 0..1)
  now?: number;                     // where the measurement sits (fraction 0..1) when the band is a target: a mark on the open dial
  tint?: string;                    // CSS color of what is on, when nothing is wrong (a light's color)
  bearing?: number;                 // a direction: an arrow on the ring, degrees clockwise from the top (north, or the bow)
  alert?: { level: 1 | 2; fail?: number[] };
};

export type RingOptions = {
  name?: string;                       // channel name, for the dial's accessible label
  controls?: boolean;                  // the front ring is operated directly
  muted?: boolean;                     // painted gray even with an alert (mini rings)
  call?: boolean;                      // the alert calls: its failing segments ripple
  pending?: (id?: string) => boolean;       // an action sent and not yet confirmed
  open?: boolean;                      // a band as a three-quarter dial, open at the bottom, with its ends named
  failed?: (id?: string) => boolean;        // an action refused: a red outline until it goes through
  ends?: 'flat' | 'rounded';           // the ends of a band and of each segment: square, or rounded (Orbit's shape)
};
const shapeOf = (o: RingOptions) => o.ends === 'rounded' ? ' shape="rounded"' : '';

// The open dial: from 225° to 135° through the top, the gap at the bottom.
export const OPEN = { from: 225, range: 270 };
const openStyle = (o: RingOptions) => o.open ? `; --o-from:${OPEN.from}deg; --o-range:${OPEN.range}deg` : '';
// The ends of the open dial (min and max) and, when the band is a target, a
// mark where the measurement is: the eye reads how far it is from its goal.
function openMarks(r: RingReading, o: RingOptions) {
  if (!o.open || !o.controls) return '';   // only on the ring that is operated: not on tiles, dots or layers behind
  const dial = r.dial;
  const ends = dial ? `<div class="orbit-13 dial-ends" style="--o-from:${OPEN.from}deg; --o-range:${OPEN.range}deg; --o-fit-range:1">
      <div class="satellite" style="--o-size-ratio:3"><div class="capsule dial-end">${esc(`${num(dial.min)}${dial.unit}`)}</div></div>
      <div class="satellite" style="--o-size-ratio:3"><div class="capsule dial-end">${esc(`${num(dial.max)}${dial.unit}`)}</div></div></div>` : '';
  const now = r.now != null ? `<div class="orbit-12 now-orbit" style="--o-range:0deg; --o-from:${(OPEN.from + Math.min(1, Math.max(0, r.now)) * OPEN.range).toFixed(2)}deg">
      <div class="vector now-mark" style="--o-size-ratio:1.6"></div></div>` : '';
  return ends + now;
}

// A direction on the ring: an arrow seated at the bearing, pointing in, 0 at
// the top (north, or the bow) and clockwise. It reads on every ring, a tile's
// too: the wind on the board, the course on the system. Gray while muted.
function bearingMark(r: RingReading, o: RingOptions) {
  if (r.bearing == null || !Number.isFinite(r.bearing)) return '';
  const deg = ((r.bearing % 360) + 360) % 360;
  return `<div class="orbit-12 bearing-orbit" style="--o-range:0deg; --o-from:${deg.toFixed(1)}deg" aria-label="${esc(t.bearingOf(Math.round(deg)))}">
      <div class="vector bearing-mark${o.muted ? ' is-muted' : ''}" style="--o-size-ratio:2.4"></div></div>`;
}

// A channel's ring on orbit-12, which touches the edge of the universe (.bigbang).
// Thickness is in lanes: `lanes` = px / lane. With `controls`, the dial is
// dragged (role="slider") and each segment with an action is a switch. The
// dial's knob is an `.at-value` satellite on the same ring: Orbit seats it
// where the progress ends and moves it when the value changes.
export function ring(key: string, r: RingReading, lanes: number, o: RingOptions = {}) {
  const on = o.muted ? 'var(--muted)' : (!r.alert && r.tint) || 'var(--ink)';
  const fill = o.muted ? 'var(--muted)' : r.alert ? levelColor(r.alert.level) : on;
  const size = `--o-size-ratio:${lanes.toFixed(3)}`;
  const isPending = o.pending ?? (() => false), isFailed = o.failed ?? (() => false);
  if (r.kind === 'p' && r.range) return rangeRing(key, r, fill, size, isPending(undefined), o) + bearingMark(r, o);
  if (r.kind === 'p') {
    const pct = ((r.v ?? 0) * 100).toFixed(1);
    const busy = (r.segs?.some((s) => isPending(s.id)) || isPending(undefined) ? ' is-pending' : '') + (isFailed(undefined) ? ' is-failed' : '');
    const dial = o.controls && r.dial;
    if (!dial) {
      return `<div class="orbit-12${busy}" style="${size}${openStyle(o)}"><o-progress value="${pct}"${shapeOf(o)}
        style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress></div>${openMarks(r, o)}${bearingMark(r, o)}`;
    }
    return `<div class="orbit-12${busy}" style="${size}${openStyle(o)}"><o-progress value="${pct}" class="dial" data-dial="${key}"${shapeOf(o)}
        interactive hit-width="12" role="slider" tabindex="0" aria-label="${esc(o.name ? t.dialOf(dial.label, o.name) : dial.label)}"
        aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${dial.value}"
        aria-valuetext="${num(dial.value)}${dial.unit}" style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress>
      <div class="satellite knob at-value" style="--o-size-ratio:1.4"></div></div>${openMarks(r, o)}${bearingMark(r, o)}`;
  }
  // Many switches (a fleet, a hundred sensors) are a swarm: a tick per member, one SVG.
  if (r.kind === 's' && (r.segs?.length ?? 0) > SWARM_FROM) {
    return swarmRing(r.segs!.map((s) => ({ on: s.on, label: s.label })), lanes, { name: o.name, on, fill, fail: r.alert?.fail, call: o.call, muted: o.muted }) + bearingMark(r, o);
  }
  // A choice is a radio group: the one that is on has no action, the others switch to themselves.
  const role = r.kind === 'c' ? 'radio' : 'switch';
  const segs = (r.segs ?? []).map((s, i) => {
    const fail = !!r.alert?.fail?.includes(i) && !o.muted;
    const f = fail ? fill : s.on ? on : 'var(--dim)';
    // Rule 2: the wave comes out of the failing segment (o-arc.ripple).
    const cls = (isPending(s.id) ? ' is-pending' : '') + (isFailed(s.id) ? ' is-failed' : '') + (o.call && fail ? ' ripple' : '');
    // The option that is chosen is a radio too, just not one that does anything.
    if (r.kind === 'c' && o.controls && s.on && !s.act) return `<o-arc class="${cls.trim()}"${shapeOf(o)} style="--o-fill:${f}" role="radio" aria-checked="true" aria-label="${esc(s.label)}"></o-arc>`;
    if (!(o.controls && (s.act || s.to))) return `<o-arc class="${cls.trim()}"${shapeOf(o)} style="--o-fill:${f}"></o-arc>`;
    return `<o-arc style="--o-fill:${f}"${shapeOf(o)} class="toggle${cls}" data-seg="${i}" interactive hit-width="10"
      role="${role}" tabindex="0" aria-checked="${s.on}" aria-label="${esc(s.label)}"></o-arc>`;
  }).join('');
  const n = r.segs?.length ?? 0, gap = n > 1 ? 24 : 0;
  const group = r.kind === 'c' && o.controls ? ` role="radiogroup"${o.name ? ` aria-label="${esc(o.name)}"` : ''}` : '';
  // The names of a choice run along the inside of the ring, each over its
  // segment; the ones in the lower half are flipped so they read upright.
  const labels = r.kind === 'c' && o.controls ? `<div class="orbit-10 choice-labels" style="--o-gap:${gap}">${
    (r.segs ?? []).map((s, i) => { const mid = (i + 0.5) * 360 / n; return `<o-arc text-anchor="middle"${mid > 90 && mid < 270 ? ' flip' : ''} class="choice-label${s.on ? ' is-on' : ''}" data-label="${esc(s.label)}">${esc(s.label)}</o-arc>`; }).join('')}</div>` : '';
  return `<div class="orbit-12" style="${size}; --o-gap:${gap}"${group}>${segs}</div>${labels}${bearingMark(r, o)}`;
}

// A band from lo to hi over a faint track, with a knob at each end. With
// `controls`, the knobs are sliders (data-handle lo|hi) and the track takes the
// drag: whichever knob is nearer follows the pointer.
function rangeRing(key: string, r: RingReading, fill: string, size: string, pending: boolean, o: RingOptions) {
  const { lo, hi } = r.range!, dial = r.dial;
  const knob = (handle: 'lo' | 'hi', v: number) => {
    const value = dial ? dial.min + v * (dial.max - dial.min) : v;
    const a = o.controls && dial ? ` data-dial="${key}" data-handle="${handle}" role="slider" tabindex="0"
      aria-label="${esc(t.handleOf(handle === 'lo' ? t.low : t.high, o.name ? t.dialOf(dial.label, o.name) : dial.label))}"
      aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${value}" aria-valuetext="${num(value)}${dial.unit}"` : '';
    return `<div class="orbit-12 knob-orbit" style="--o-range:0deg; --o-from:${(v * 360).toFixed(2)}deg">
      <div class="satellite knob ${handle}" style="--o-size-ratio:1.4"${a}></div></div>`;
  };
  const track = o.controls && dial ? `<o-arc class="dial range-track" data-dial="${key}" interactive hit-width="12" style="--o-fill:var(--line)"></o-arc>`
    : `<o-arc style="--o-fill:var(--line)"></o-arc>`;
  return `<div class="orbit-12${pending ? ' is-pending' : ''}" style="${size}">${track}</div>
    <div class="orbit-12 range-band" style="${size}"><o-arc class="band"${shapeOf(o)} start="${(lo * 100).toFixed(1)}" value="${((hi - lo) * 100).toFixed(1)}" style="--o-fill:${fill}"></o-arc></div>
    ${knob('lo', lo)}${knob('hi', hi)}`;
}

// The center of a detail's ring: what is now, over a wash of the color when there is one.
export function ringCenter(big: string, label: string, size: number, color?: string) {
  return `<div class="orbit-0" style="--o-size-ratio:${size}"><div class="satellite at-center"><div class="capsule ring-center${color ? ' has-color' : ''}"${color ? ` style="--c:${color}"` : ''}>
    <span class="ring-big">${esc(big)}</span><span class="ring-label">${esc(label)}</span></div></div></div>`;
}

// ─── Dial gestures ──────────────────────────────────────────────────

// A dial with two handles (a range) names them: `handle` is 'lo' or 'hi';
// a plain dial has none (undefined).
export type DialControls = {
  locked: () => boolean;
  ringOf: (key: string) => Element | null;      // the .orbit-12 that holds the dial, for the angle
  current: (key: string, handle?: string) => number;      // value as a fraction 0..1
  stepOf: (key: string) => number;              // one step as a fraction of the range
  set: (key: string, v: number, handle?: string) => void; // from a fraction (clamped to 0..1)
  nearest?: (key: string, v: number) => string | undefined;   // which handle a drag at `v` takes (ranges)
  onStart?: (key: string) => void;
  onEnd?: (key: string) => void;                // the drag ended (send the command)
  onInput?: (key: string) => void;              // keyboard or wheel changed it (send after a pause)
  activate?: string;                            // selector of the arcs Enter and Space click
};

// Drag, wheel and keyboard on the front dial, and how they live with Zumly.
// Returns the cleanup.
export function dialControls(el: HTMLElement, c: DialControls) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  let drag: { key: string; last: number; start: number; handle?: string; pointerId: number } | null = null;
  let swallowUntil = 0;
  // A second finger is a pinch (Zumly's way back), never a drag: the dial goes
  // back to where it was and stops swallowing, so Zumly sees the touch end.
  const cancelDrag = () => {
    if (!drag) return;
    const { key, start, handle } = drag;
    drag = null;
    swallowUntil = 0;
    c.set(key, start, handle);
    c.onEnd?.(key);
  };

  // The ring's span: a full turn, or the open dial's (--o-from / --o-range on the orbit).
  const spanOf = (ring: Element) => {
    const cs = getComputedStyle(ring);
    return { from: parseFloat(cs.getPropertyValue('--o-from')) || 0, range: parseFloat(cs.getPropertyValue('--o-range')) || 360 };
  };
  // Pointer angle as a fraction of the ring's span (0 at its start, clockwise).
  // Near the center the angle jumps with any movement: there it does not
  // change. In the gap of an open dial, the nearer end.
  const angleAt = (key: string, x: number, y: number) => {
    const ring = c.ringOf(key), b = ring?.getBoundingClientRect();
    if (!ring || !b) return null;
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    if (Math.hypot(dx, dy) < b.width * 0.2) return null;
    const { from, range } = spanOf(ring);
    const a = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360 - from) % 360;
    if (a > range) return a - range < 360 - a ? 1 : 0;
    return a / range;
  };
  const dragTo = (x: number, y: number) => {
    if (!drag) return;
    let v = angleAt(drag.key, x, y);
    if (v === null) return;
    // On a full ring, no jumps across zero: from the end to the start (and back) it stays at the limit.
    const ring = c.ringOf(drag.key);
    if (ring && spanOf(ring).range >= 360) {
      if (drag.last > 0.75 && v < 0.25) v = 1;
      else if (drag.last < 0.25 && v > 0.75) v = 0;
    }
    drag.last = v;
    c.set(drag.key, v, drag.handle);
  };
  const onDown = (e: PointerEvent) => {
    if (drag && e.pointerId !== drag.pointerId) { cancelDrag(); return; }
    const ringEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ringEl || c.locked()) return;
    e.preventDefault();
    ringEl.setPointerCapture(e.pointerId);
    const key = ringEl.dataset.dial!;
    // A knob names its handle; on the track, the nearer handle follows.
    let handle = ringEl.dataset.handle;
    if (!handle && c.nearest) { const at = angleAt(key, e.clientX, e.clientY); handle = c.nearest(key, at ?? c.current(key)); }
    const focusEl = handle && !ringEl.dataset.handle ? c.ringOf(key)?.parentElement?.querySelector<HTMLElement>(`[data-dial="${key}"][data-handle="${handle}"]`) : ringEl;
    (focusEl ?? ringEl).focus({ preventScroll: true });
    drag = { key, last: c.current(key, handle), start: c.current(key, handle), handle, pointerId: e.pointerId };
    swallowUntil = Infinity;
    c.onStart?.(key);
    dragTo(e.clientX, e.clientY);
  };
  const onMove = (e: PointerEvent) => { if (drag) dragTo(e.clientX, e.clientY); };
  const endDrag = () => {
    if (!drag) return;
    const key = drag.key;
    drag = null;
    swallowUntil = performance.now() + 400;
    c.onEnd?.(key);
  };
  // Zumly listens to mouseup and touchend on the canvas: releasing over the disc
  // would zoom in, and on touch a swipe to the left would zoom out. While
  // dragging (and for a moment after) those events do not reach it.
  const swallow = (e: Event) => { if (performance.now() < swallowUntil) e.stopPropagation(); };
  // The wheel over the dial moves the value (Zumly would use it to go back).
  const onWheel = (e: WheelEvent) => {
    const ringEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ringEl) return;
    e.preventDefault();
    e.stopPropagation();
    const key = ringEl.dataset.dial!, handle = ringEl.dataset.handle;
    c.set(key, clamp(c.current(key, handle) + (e.deltaY < 0 ? c.stepOf(key) : -c.stepOf(key))), handle);
    c.onInput?.(key);
  };
  // The o-arc are not native buttons: Enter and Space activate them. The dial
  // answers to the arrows like a slider (Zumly ignores role="slider").
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && c.activate && target.matches(c.activate)) {
      e.preventDefault();
      target.click();
      return;
    }
    if (!target.matches('[data-dial]')) return;
    const key = target.dataset.dial!, handle = target.dataset.handle, v = c.current(key, handle), s = c.stepOf(key);
    const next: Record<string, number> = {
      ArrowRight: v + s, ArrowUp: v + s, ArrowLeft: v - s, ArrowDown: v - s,
      PageUp: v + s * 4, PageDown: v - s * 4, Home: 0, End: 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    c.set(key, clamp(next[e.key]), handle);
    c.onInput?.(key);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('keydown', onKey);
  const swallowed = ['mouseup', 'touchend', 'click'];
  for (const type of swallowed) window.addEventListener(type, swallow, true);
  return () => {
    for (const type of swallowed) window.removeEventListener(type, swallow, true);
  };
}
