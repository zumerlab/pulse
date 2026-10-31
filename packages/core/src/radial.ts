// The radial object both prototypes share: the ring of a channel, the layer
// markup, the dial's gestures and the Zumly setup. The views (board, system,
// detail) stay in each prototype: one reads simulated data, the other a live
// Home Assistant, and what they do around the object differs.

import type { ZumlyOptions } from 'zumly';
import type Zumly from 'zumly';
import { num, t, time } from './i18n.ts';

// ─── What a ring needs to know about a channel ──────────────────────

export type RingSeg = { label: string; on: boolean; act?: unknown; entity?: string };
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
  alert?: { level: 1 | 2; fail?: number[] };
};

// ─── Sizes ──────────────────────────────────────────────────────────

// On a phone you look at one system at a time: two visible layers and less
// growth between layers. Decided on load.
export const PHONE = matchMedia('(max-width: 600px)').matches;
export const GROW = PHONE ? 0.24 : 0.42;                   // --o-depth-grow
export const SIZE = Array.from({ length: PHONE ? 2 : 3 }, (_, d) => 1 + GROW * d);
export const STROKE = [6, 3, 2.5];                         // apparent stroke per depth, px
// A system may stack more layers than SIZE's (the viewer chooses, up to this):
// each one GROW bigger than the one in front, the strokes thinner behind.
export const STACK_MAX = PHONE ? 3 : 5;
export const sizes = (n: number) => Array.from({ length: Math.max(1, Math.min(n, STACK_MAX)) }, (_, d) => 1 + GROW * d);
export const strokeAt = (d: number) => STROKE[Math.min(d, STROKE.length - 1)];
export const LOCK_MS = 800;                                // controls locked after a layer change
export const UNIVERSE = 240;                               // px; one lane is radius / 12 = 10 px
export const LANE = UNIVERSE / 2 / 12;
export const ZOOM = { calm: PHONE ? 1.1 : 1.2, alert: 1.35 };   // --zoom of .obj (see .stage[data-zoom])

// How much the object scales to fill its stage (--fit): calm, the outermost
// visible layer touches the shorter side; in an alert, the front disc at its
// zoom does. Never below half nor past 1.5, so a wall panel gets a big object
// and a narrow phone a whole one.
export function fitFor(width: number, height: number, alert: boolean, layers = SIZE.length) {
  const side = Math.min(width, height);
  const extent = alert ? UNIVERSE * ZOOM.alert : UNIVERSE * (1 + GROW * (Math.max(1, layers) - 1)) * ZOOM.calm;
  return Math.min(1.5, Math.max(0.5, side / extent));
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function icon(path: string, size = 22) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

export const levelColor = (level?: 1 | 2) => level === 2 ? 'var(--critical)' : level === 1 ? 'var(--minor)' : 'var(--ink)';

// ─── Ring ───────────────────────────────────────────────────────────

export type RingOptions = {
  name?: string;                       // channel name, for the dial's accessible label
  controls?: boolean;                  // the front ring is operated directly
  muted?: boolean;                     // painted gray even with an alert (mini rings)
  call?: boolean;                      // the alert calls: its failing segments ripple
  pending?: (entity?: string) => boolean;   // a command sent and not yet confirmed
  open?: boolean;                      // a band as a three-quarter dial, open at the bottom, with its ends named
  failed?: (entity?: string) => boolean;    // a command refused: a red outline until it goes through
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

// A channel's ring on orbit-12, which touches the edge of the universe (.bigbang).
// Thickness is in lanes: `lanes` = px / lane. With `controls`, the dial is
// dragged (role="slider") and each segment with an action is a switch. The
// dial's knob is an `.at-value` satellite on the same ring: Orbit seats it
// where the progress ends and moves it when the value changes.
export function ring(key: string, r: RingReading, lanes: number, o: RingOptions = {}) {
  const on = (!o.muted && !r.alert && r.tint) || 'var(--ink)';
  const fill = o.muted ? 'var(--muted)' : r.alert ? levelColor(r.alert.level) : on;
  const size = `--o-size-ratio:${lanes.toFixed(3)}`;
  const isPending = o.pending ?? (() => false), isFailed = o.failed ?? (() => false);
  if (r.kind === 'p' && r.range) return rangeRing(key, r, fill, size, isPending(undefined), o);
  if (r.kind === 'p') {
    const pct = ((r.v ?? 0) * 100).toFixed(1);
    const busy = (r.segs?.some((s) => isPending(s.entity)) || isPending(undefined) ? ' is-pending' : '') + (isFailed(undefined) ? ' is-failed' : '');
    const dial = o.controls && r.dial;
    if (!dial) {
      return `<div class="orbit-12${busy}" style="${size}${openStyle(o)}"><o-progress value="${pct}"${shapeOf(o)}
        style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress></div>${openMarks(r, o)}`;
    }
    return `<div class="orbit-12${busy}" style="${size}${openStyle(o)}"><o-progress value="${pct}" class="dial" data-dial="${key}"${shapeOf(o)}
        interactive hit-width="12" role="slider" tabindex="0" aria-label="${esc(o.name ? t.dialOf(dial.label, o.name) : dial.label)}"
        aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${dial.value}"
        aria-valuetext="${num(dial.value)}${dial.unit}" style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress>
      <div class="satellite knob at-value" style="--o-size-ratio:1.4"></div></div>${openMarks(r, o)}`;
  }
  // A choice is a radio group: the one that is on has no action, the others switch to themselves.
  const role = r.kind === 'c' ? 'radio' : 'switch';
  const segs = (r.segs ?? []).map((s, i) => {
    const fail = !!r.alert?.fail?.includes(i) && !o.muted;
    const f = fail ? fill : s.on ? on : 'var(--dim)';
    // Rule 2: the wave comes out of the failing segment (o-arc.ripple).
    const cls = (isPending(s.entity) ? ' is-pending' : '') + (isFailed(s.entity) ? ' is-failed' : '') + (o.call && fail ? ' ripple' : '');
    // The option that is chosen is a radio too, just not one that does anything.
    if (r.kind === 'c' && o.controls && s.on && !s.act) return `<o-arc class="${cls.trim()}"${shapeOf(o)} style="--o-fill:${f}" role="radio" aria-checked="true" aria-label="${esc(s.label)}"></o-arc>`;
    if (!(o.controls && s.act)) return `<o-arc class="${cls.trim()}"${shapeOf(o)} style="--o-fill:${f}"></o-arc>`;
    return `<o-arc style="--o-fill:${f}"${shapeOf(o)} class="toggle${cls}" data-seg="${i}" interactive hit-width="10"
      role="${role}" tabindex="0" aria-checked="${s.on}" aria-label="${esc(s.label)}"></o-arc>`;
  }).join('');
  const n = r.segs?.length ?? 0, gap = n > 1 ? 24 : 0;
  const group = r.kind === 'c' && o.controls ? ` role="radiogroup"${o.name ? ` aria-label="${esc(o.name)}"` : ''}` : '';
  // The names of a choice run along the inside of the ring, each over its
  // segment; the ones in the lower half are flipped so they read upright.
  const labels = r.kind === 'c' && o.controls ? `<div class="orbit-10 choice-labels" style="--o-gap:${gap}">${
    (r.segs ?? []).map((s, i) => { const mid = (i + 0.5) * 360 / n; return `<o-arc text-anchor="middle"${mid > 90 && mid < 270 ? ' flip' : ''} class="choice-label${s.on ? ' is-on' : ''}" data-label="${esc(s.label)}">${esc(s.label)}</o-arc>`; }).join('')}</div>` : '';
  return `<div class="orbit-12" style="${size}; --o-gap:${gap}"${group}>${segs}</div>${labels}`;
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

// ─── Layers ─────────────────────────────────────────────────────────

export type Face = {
  glyph: string; name: string; big: string; label: string;
  // The Zumly view the disc opens. Without it the disc is just the face: a
  // control of one entity that is resolved on the face has no detail to open
  // (a detail only exists when it adds something the face does not have).
  to?: string;
  props?: Record<string, string>;      // data-* for that view
  aria: string;
  extra?: string;                      // more markup inside the disc ("sending…")
  // A picture inside the disc (a camera, a cover, a plan, a map): the text sits over it.
  image?: { src: string; alt: string; key?: string };
};

// The front layer's center: the face in an at-center satellite of orbit-0,
// which is the Zumly trigger of the next level when there is one (`to`).
export function face(f: Face) {
  const props = Object.entries(f.props ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const img = f.image ? `<img class="face-image" src="${esc(f.image.src)}" alt="${esc(f.image.alt)}"${f.image.key ? ` data-image="${esc(f.image.key)}"` : ''}>` : '';
  const opens = f.to ? ` role="button" tabindex="0" data-to="${f.to}"${props} aria-label="${esc(f.aria)}"` : '';
  return `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
    <div class="capsule disc${f.to ? ' zoom-me' : ''}${img ? ' has-image' : ''}"${opens}>
      ${img}${icon(f.glyph)}<span class="face-name">${esc(f.name)}</span>
      <span class="face-big">${esc(f.big)}</span><span class="face-label">${esc(f.label)}</span>${f.extra ?? ''}</div></div></div>`;
}

export type BackLayer = {
  text: string;                        // the arc label, "Channel · value"
  at: number;                          // degrees where the label starts
  grow: number;                        // the layer's growth (SIZE[d]); text and strokes are divided by it
  stroke: number;                      // apparent stroke, px
  hit: number;                         // touch margin of the ring, px
  pick: { attr: string; value: string; aria: string };
};

// A layer behind: the label takes the length of its text (range="auto") and a
// transparent interactive arc on the ring receives the tap that brings it forward.
// The label rides just outside its ring (orbit 13), never over the rings inside it.
export function backLayer(b: BackLayer) {
  return `<div class="orbit-13" style="--o-from:${b.at}deg">
      <o-arc range="auto" class="arc-label" style="font-size:${(11 / b.grow).toFixed(2)}px">${esc(b.text)}</o-arc></div>
    <div class="orbit-12" style="--o-size-ratio:${(b.stroke / b.grow / LANE).toFixed(3)}">
      <o-arc interactive hit-width="${(b.hit / b.grow).toFixed(1)}" ${b.pick.attr}="${esc(b.pick.value)}" class="ring-hit"
        role="button" tabindex="0" aria-label="${esc(b.pick.aria)}"></o-arc></div>`;
}

// Labels of the layers behind alternate sides so they never share a line.
export const labelAt = (i: number) => (i === 1 ? 300 : 30);

// The system view's skeleton: stage with the universe, strip, dots on the
// phone and the buttons below.
// The system's screen: the title, the stage with the object, the strip under
// it and a footer bar: room at the left for the back button (Zumly's, at the
// bottom left of the canvas), the systems' dots in the middle on the phone,
// the secondary controls at the right.
export function systemShell(title: string | null, buttons: string) {
  return `<div class="system">
    ${title ? `<p class="eyebrow sys-title">${esc(title)}</p>` : ''}
    <div class="stage" data-zoom="calm">
      <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective is-flat"
        style="--o-depth-grow:${GROW}"></div></div></div>
      <div class="layer-index-slot"></div>
    </div>
    <div class="strip" aria-live="polite"></div>
    <footer class="foot">
      <span class="foot-back"></span>
      ${PHONE ? `<nav class="dots" aria-label="${t.systems}"></nav>` : '<span></span>'}
      <div class="controls">${buttons}</div>
    </footer>
  </div>`;
}

// The toggle between the flat object and its 3D view: an icon button out of
// the main path (the footer); its label says what it would do.
export function viewToggle() {
  return `<button class="plain icon-btn" data-act="view" aria-pressed="false" aria-label="${t.view3d}" title="${t.view3d}">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class="glyph"><path d="M12 4 3 9l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/></svg></button>`;
}
export function setViewToggle(btn: HTMLElement, flat: boolean) {
  const label = flat ? t.view3d : t.viewFlat;
  btn.setAttribute('aria-pressed', String(!flat));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

export type Dot = { id: string; title: string; level: number; ring: string };
// One mini ring per system; the one of a system with an alert beats.
export function dots(list: Dot[], currentId: string) {
  return list.map((d) => `<button class="dot${d.level ? ` has-alert level-${d.level}` : ''}" data-go="${d.id}"
      aria-label="${esc(d.title)}"${d.id === currentId ? ' aria-current="true"' : ''}>
      <span class="bigbang"><span class="gravity-spot">${d.ring}</span></span></button>`).join('');
}
export const DOT_LANES = 2.5 / (22 / 24);

// The layers of a stacked object named beside it, front to back: a dot per
// layer (its level's color, the front one filled) and the name, each a button
// that brings that layer to the front. Past the cap (`off`), the layer is not
// drawn and its dot is hollow. `attr` is the data attribute the host handles.
export type LayerItem = { id: string; title: string; big?: string; level: number; off?: boolean };
export function layerIndex(list: LayerItem[], attr: string) {
  return `<nav class="layer-index" aria-label="${esc(t.layerIndex)}">${list.map((l, i) => `<button class="layer-item${l.level ? ` level-${l.level}` : ''}${l.off ? ' is-off' : ''}"
      ${attr}="${esc(l.id)}" aria-label="${esc(t.bringToFront(l.title))}"${i === 0 ? ' aria-current="true"' : ''}>
      <span class="layer-dot"></span><span class="layer-name">${esc(l.title)}</span>${l.big ? `<span class="layer-big">${esc(l.big)}</span>` : ''}</button>`).join('')}</nav>`;
}
export const MINI_LANES = 6 / 3.5;

// The channels that do not fit as rings (past SIZE) are named in the strip,
// each a button that brings it to the front, like tapping its ring would.
// No instructions here: the handle, the names on the ring and the hover say
// what can be done.
export function calmStrip(title: string, frontName: string, hidden: { key: string; name: string }[]) {
  const more = hidden.length ? ` · <span class="behind">${t.behind(hidden.length)}: ${hidden.map((h) =>
    `<button class="more" data-pick="${esc(h.key)}" aria-label="${esc(t.bringToFront(h.name))}">${esc(h.name)}</button>`).join(', ')}</span>` : '';
  return `<strong>${esc(title)}</strong> · ${t.inFront(frontName)}${more}`;
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
  let drag: { key: string; last: number; handle?: string } | null = null;
  let swallowUntil = 0;

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
    drag = { key, last: c.current(key, handle), handle };
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

// ─── Time ring ──────────────────────────────────────────────────────

export type TimeRing = {
  values: (number | null)[];           // one per hour, oldest first; the last one is the current hour
  label: string;                       // under the day's range, in the center
  unit?: string;                       // after the numbers
  min?: number; max?: number;          // the scale; by default from zero (or the lowest value, when some are negative) to the highest
  marks?: boolean;                     // hour ticks on the rim and "6 h ago", "12 h ago", "18 h ago" outside
};

// The last 24 hours as a ring of radial bars, the way a voice visualizer
// draws sound: time runs clockwise and ends at the top with the current hour
// (the one bar in ink; the older, the fainter), each bar grows out from a
// baseline with the value, two bars an hour (the half hours interpolated) so
// the ring reads as a shape. The center gives the day's range. Its own
// universe; the width comes from CSS (.time-ring).
export function timeRing(tr: TimeRing) {
  const nums = tr.values.filter((v): v is number => v != null);
  const dataLo = Math.min(...nums), dataHi = Math.max(...nums);
  // The scale shows the day's shape without lying about it: the floor sits
  // half the day's swing under its lowest value (never below zero for a
  // magnitude), so a flat day stays flat and a swing is visible; the numbers
  // in the center say what the swing was.
  const swing = dataHi - dataLo;
  const lo = tr.min ?? (dataLo >= 0 ? Math.max(0, dataLo - swing / 2) : dataLo - swing / 2), hi = tr.max ?? dataHi;
  const span = hi - lo;
  const norm = (v: number) => span > 0 ? Math.min(1, Math.max(0, (v - lo) / span)) : 0.6;
  // Two bars an hour: the hour itself, then the midpoint to the next.
  const points: { v: number | null; ago: number; real: boolean }[] = [];
  tr.values.forEach((v, i, arr) => {
    const ago = arr.length - 1 - i;
    if (i > 0) { const prev = arr[i - 1]; points.push({ v: prev != null && v != null ? (prev + v) / 2 : null, ago: ago + 0.5, real: false }); }
    points.push({ v, ago, real: true });
  });
  const n = points.length || 1;
  const REACH = 6;                    // lanes from the baseline (orbit 6) to the edge of the universe
  // Each point is a sector of the ring: all of them share the baseline (the
  // rim of orbit 6) and each grows outward by its value, up to the edge of the
  // universe. Half an hour is a slot of the scale (48 to the turn), "now" sits
  // centered at the top and the slot after it stays empty: the seam of the day.
  const slots = n + 1;
  const bars = points.map(({ v, ago, real }) => {
    const start = (slots - 0.5 - 2 * ago).toFixed(1);
    if (v == null) return `<o-arc class="time-bar is-empty outer-orbit" start="${start}" value="0"></o-arc>`;
    const len = Math.max(0.25, REACH * norm(v));
    const title = real ? ` title="${esc(`${ago === 0 ? t.now : t.hoursAgo(ago)}: ${num(v)}${tr.unit ?? ''}`)}"` : '';
    // The older, the fainter.
    return `<o-arc class="time-bar outer-orbit${ago === 0 ? ' is-now' : ''}" start="${start}" value="1" interactive style="--o-size-ratio:${len.toFixed(3)}; opacity:${(1 - 0.6 * ago / (n / 2)).toFixed(2)}"${title}></o-arc>`;
  }).join('');
  // The center says now; the day's range under it, rounded to what matters.
  const r = (v: number) => num(v, Math.abs(dataHi) >= 10 ? 0 : 1);
  const last = [...tr.values].reverse().find((v): v is number => v != null);
  const range = nums.length ? (r(dataLo) === r(dataHi) ? `${r(dataHi)}${tr.unit ?? ''}` : `${r(dataLo)}–${r(dataHi)}${tr.unit ?? ''}`) : '';
  const big = last != null ? `${num(last)}${tr.unit ?? ''}` : range;
  return `<div class="bigbang time-ring${tr.marks ? ' has-marks' : ''}" role="img" aria-label="${esc(`${t.last24h}: ${range}`)}"><div class="gravity-spot">
    <div class="orbit-6 time-bars" style="--o-max:${slots}; --o-gap:1; --o-stroke-width:0">${bars}</div>
    ${tr.marks ? hourMarks() : ''}
    <div class="orbit-0" style="--o-size-ratio:8"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(big)}</span><span class="time-range">${esc(range)}</span><span class="time-label">${esc(tr.label)}</span></div></div></div>
  </div></div>`;
}
export const TIME_RING = 220;        // px; the universe of the time ring (see .time-ring in the CSS)

// Hour marks, on request: a tick per hour on the rim, longer every six, and
// "6 h ago", "12 h ago", "18 h ago" along the outside; now is the top.
const hourMarks = () => `<div class="orbit-13 time-ticks">${Array.from({ length: 24 }, (_, k) =>
    `<div class="vector time-tick${k % 6 === 0 ? ' is-major' : ''}" style="--o-size-ratio:${k % 6 === 0 ? 1 : 0.5}"></div>`).join('')}</div>
  <div class="orbit-14 time-hours" style="--o-max:24">${[6, 12, 18].map((h) =>
    `<o-arc range="auto" text-anchor="middle" start="${24 - h}"${h === 12 ? ' flip' : ''} class="time-hour">${esc(t.hAgo(h))}</o-arc>`).join('')}</div>`;

// ─── Timeline: a day per entity ─────────────────────────────────────

export type Tone = 'warn' | 'critical';
export type Track = {
  key: string;                       // data-track on its arcs: what a tap on this ring means
  name: string;                      // names its spans
  spans: [number, number][];         // when it was on, as [from, to] in hours ago (to = 0 while it still is)
  on?: boolean;                      // on right now: the ring reaches the top and glows there
  tone?: Tone;                       // the spans in an alert's color instead of ink
  act?: boolean;                     // a tap does something
  pending?: boolean;                 // a command sent and not confirmed: the ring beats
  failed?: boolean;                  // the command was refused: red outline
};
export type TimeEvent = { ago: number; text: string; tone?: Tone };   // a moment worth a word, placed at its hour
export type Timeline = {
  hours: number;                     // the window; 24 is a day
  tracks: Track[];                   // outermost first; the first MAX_TRACKS are drawn
  events?: TimeEvent[];
  big: string; label: string;        // the center: what is now
  marks?: boolean;                   // hour ticks and "6 h ago"… (24 h only)
  names?: boolean;                   // each ring named on itself, at its start
  aria: string;
};
export const MAX_TRACKS = 8;

// The last hours of several entities as concentric rings, one per entity,
// outermost first: time runs clockwise and ends at the top, where a ring that
// is on right now arrives and glows; what was on is drawn, what was off is
// the faint track under it. The seam after "now" is the same as the time
// ring's. Events sit outside the rings at their hour. Its own universe; the
// width comes from CSS (.timeline).
export function timeline(tl: Timeline) {
  // The scale is in minutes: a window of W minutes plus a seam of one 48th.
  const W = tl.hours * 60, seam = W / 48, S = W + seam, half = seam / 2;
  const at = (agoH: number) => (((S + half - agoH * 60) % S) + S) % S;
  const when = (agoH: number) => time(new Date(Date.now() - agoH * 3_600_000)).slice(0, 5);
  const tracks = tl.tracks.slice(0, MAX_TRACKS);
  const rings = tracks.map((tr, i) => {
    const cls = ['track', tr.on && 'is-on', tr.tone, tr.act && 'has-act', tr.pending && 'is-pending'].filter(Boolean).join(' ');
    const spans = tr.spans.map(([from, to]) => {
      const f = Math.min(from, tl.hours), len = (f - to) * 60;
      if (len <= 0) return '';
      const title = `${tr.name}: ${to <= 0 ? t.sinceTime(when(f)) : `${when(f)}–${when(to)}`}`;
      return `<o-arc class="track-span${tr.failed ? ' is-failed' : ''}" start="${at(f).toFixed(1)}" value="${Math.max(len, 3).toFixed(1)}" interactive data-track="${esc(tr.key)}" title="${esc(title)}"></o-arc>`;
    }).join('');
    // Each ring is named on itself, a step further round than the one outside
    // it (the names would pile up at one angle), over whatever is there.
    const name = tl.names ? `<div class="orbit-${12 - i} track-name-orbit" style="--o-from:${(half / S * 360 + 6 + i * 38).toFixed(1)}deg">
      <o-arc range="auto" class="arc-label track-name" style="font-size:${i ? 9.5 : 10.5}px">${esc(tr.name)}</o-arc></div>` : '';
    return `<div class="orbit-${12 - i} ${cls}" style="--o-max:${S}; --o-gap:0; --o-stroke-width:0; --o-size-ratio:.3">
      <o-arc class="track-back" start="${at(tl.hours).toFixed(1)}" value="${W}" interactive data-track="${esc(tr.key)}" title="${esc(tr.name)}"></o-arc>${spans}</div>${name}`;
  }).join('');
  // Events within the same half hour share a word.
  const grouped: TimeEvent[] = [];
  for (const e of [...(tl.events ?? [])].filter((e) => e.ago >= 0 && e.ago <= tl.hours).sort((a, b) => a.ago - b.ago)) {
    const near = grouped.find((g) => Math.abs(g.ago - e.ago) * 60 < seam);
    if (near) { near.text = `${near.text}, ${e.text}`; near.tone = near.tone === 'critical' ? near.tone : e.tone ?? near.tone; }
    else grouped.push({ ...e });
  }
  const events = grouped.map((e) =>
    `<div class="orbit-13 time-events" style="--o-from:${(at(e.ago) / S * 360).toFixed(1)}deg"><div class="satellite"><div class="capsule time-event${e.tone ? ` ${e.tone}` : ''}">${esc(e.text)}</div></div></div>`).join('');
  // The center fills what the rings leave (a unit of size is one orbit step).
  const inner = (2 * (11.5 - tracks.length) - 0.8).toFixed(1);
  return `<div class="bigbang timeline${tl.marks ? ' has-marks' : ''}" role="group" aria-label="${esc(tl.aria)}"><div class="gravity-spot">
    ${rings}${events}${tl.marks ? hourMarks() : ''}
    <div class="orbit-0" style="--o-size-ratio:${inner}"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(tl.big)}</span><span class="time-label">${esc(tl.label)}</span></div></div></div>
  </div></div>`;
}

// ─── Color wheel ────────────────────────────────────────────────────

// Hue around (0 at the top, clockwise), saturation outward: the control of a
// light's color. The handle shows the color it points at. Its gestures live
// in wheelControls().
export function colorWheel(hs: [number, number] | null, key: string, label: string) {
  const [h, s] = hs ?? [0, 0];
  const x = 50 + 50 * (s / 100) * Math.sin(h * Math.PI / 180), y = 50 - 50 * (s / 100) * Math.cos(h * Math.PI / 180);
  return `<div class="color-wheel${hs ? '' : ' is-unset'}" data-wheel="${esc(key)}" role="slider" tabindex="0" aria-label="${esc(label)}"
      aria-valuemin="0" aria-valuemax="360" aria-valuenow="${Math.round(h)}" aria-valuetext="${esc(t.hueSat(Math.round(h), Math.round(s)))}">
    <div class="color-handle" style="left:${x.toFixed(1)}%; top:${y.toFixed(1)}%; background:${hsCss(h, s)}"></div></div>`;
}
// CSS color of a hue/saturation at full brightness.
export const hsCss = (h: number, s: number) => `hsl(${Math.round(h)} 100% ${Math.round(100 - s / 2)}%)`;

// ─── Color arcs ─────────────────────────────────────────────────────

// A light's color as two curved sliders inside its brightness dial: the hue
// around (a rainbow of short arcs on orbit 10) and the saturation inside it
// (from white to that hue, on orbit 8). Each is a slider of its own, with the
// dial's gestures (data-dial "key:hue" and "key:sat" on a transparent grab
// ring), and a knob sits at its value, painted with the color it points at.
// Both follow the dial's span: a full ring, or the open dial.
export const HUE_STEPS = 36, SAT_STEPS = 12;
export const COLOR_ORBITS = { hue: 10, sat: 8 } as const;
export const satColor = (h: number, i: number) => hsCss(h, (i + 0.5) * 100 / SAT_STEPS);
export function colorArcs(key: string, hs: [number, number] | null, o: { open?: boolean; name: string }) {
  const [h, s] = hs ?? [0, 100];
  const from = o.open ? OPEN.from : 0, range = o.open ? OPEN.range : 360;
  const span = o.open ? `--o-from:${from}deg; --o-range:${range}deg; ` : '';
  const unset = hs ? '' : ' is-unset';
  const part = (what: 'hue' | 'sat', value: number, max: number, label: string, size: number, arcs: string, v: number, color: string) =>
    `<div class="orbit-${COLOR_ORBITS[what]} ${what}-ring${unset}" style="${span}--o-size-ratio:${size}; --o-gap:0; --o-stroke-width:0">${arcs}</div>
    <div class="orbit-${COLOR_ORBITS[what]} ring-grab" style="${span}--o-size-ratio:${size}" data-dial="${esc(key)}:${what}" role="slider" tabindex="0"
      aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(value)}"><o-arc interactive hit-width="4"></o-arc></div>
    <div class="orbit-${COLOR_ORBITS[what]} knob-orbit" style="--o-range:0deg; --o-from:${(from + v * range).toFixed(2)}deg">
      <div class="satellite knob ${what}-knob" style="--o-size-ratio:1.4; background:${color}"></div></div>`;
  const hue = Array.from({ length: HUE_STEPS }, (_, i) => `<o-arc style="--o-fill:hsl(${i * 360 / HUE_STEPS} 100% 50%)"></o-arc>`).join('');
  const sat = Array.from({ length: SAT_STEPS }, (_, i) => `<o-arc style="--o-fill:${satColor(h, i)}"></o-arc>`).join('');
  return part('hue', h, 360, t.hueOf(o.name), 1.2, hue, h / 360, `hsl(${Math.round(h)} 100% 50%)`)
    + part('sat', s, 100, t.saturationOf(o.name), 1, sat, s / 100, hsCss(h, s));
}

// The center of a detail's ring: what is now, over a wash of the color when there is one.
export function ringCenter(big: string, label: string, size: number, color?: string) {
  return `<div class="orbit-0" style="--o-size-ratio:${size}"><div class="satellite at-center"><div class="capsule ring-center${color ? ' has-color' : ''}"${color ? ` style="--c:${color}"` : ''}>
    <span class="ring-big">${esc(big)}</span><span class="ring-label">${esc(label)}</span></div></div></div>`;
}

export type WheelControls = {
  current: (key: string) => [number, number];
  set: (key: string, hs: [number, number]) => void;     // moves the handle (no command yet)
  onEnd: (key: string) => void;                         // the gesture ended (send the command)
  onInput?: (key: string) => void;                      // the keyboard changed it (send after a pause)
};

// Drag or tap anywhere on the wheel; arrows turn the hue (left/right, 5° a
// step) and move the saturation (up/down, 5 a step). Returns the cleanup.
export function wheelControls(el: HTMLElement, c: WheelControls) {
  let drag: string | null = null;
  const at = (wheel: HTMLElement, x: number, y: number): [number, number] => {
    const b = wheel.getBoundingClientRect();
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    return [Math.round(h), Math.round(Math.min(1, Math.hypot(dx, dy) / (b.width / 2)) * 100)];
  };
  const onDown = (e: PointerEvent) => {
    const wheel = (e.target as HTMLElement).closest<HTMLElement>('[data-wheel]');
    if (!wheel) return;
    e.preventDefault();
    wheel.setPointerCapture(e.pointerId);
    wheel.focus({ preventScroll: true });
    drag = wheel.dataset.wheel!;
    c.set(drag, at(wheel, e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const wheel = el.querySelector<HTMLElement>(`[data-wheel="${drag}"]`);
    if (wheel) c.set(drag, at(wheel, e.clientX, e.clientY));
  };
  const onUp = () => { if (!drag) return; const key = drag; drag = null; c.onEnd(key); };
  const onKey = (e: KeyboardEvent) => {
    const wheel = (e.target as HTMLElement).closest<HTMLElement>('[data-wheel]');
    if (!wheel) return;
    const key = wheel.dataset.wheel!, [h, s] = c.current(key);
    const next: Record<string, [number, number]> = {
      ArrowRight: [(h + 5) % 360, s], ArrowLeft: [(h + 355) % 360, s],
      ArrowUp: [h, Math.min(100, s + 5)], ArrowDown: [h, Math.max(0, s - 5)], Home: [h, 0], End: [h, 100],
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    c.set(key, next[e.key]);
    c.onInput?.(key);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  return () => { /* the listeners go with the element */ };
}

// ±7° tilt with the pointer, only in 3D and not on the phone (no pointer).
// It goes through the Web Animations API, never through a style attribute:
// Orbit watches every attribute in the document, and a change on an ancestor
// of the rings makes it measure and redraw all of them (31/10: 1,500 raster
// tasks in 3 s of mouse). The animation moves `rotate` on the compositor, in
// half degrees, one write per frame; the stage is measured once per entry.
export function parallax(stage: HTMLElement, obj: () => HTMLElement | null, active: () => boolean) {
  let rx = 0, ry = 0, frame = 0, box: DOMRect | null = null, last = '';
  const live: Animation[] = [];
  const write = () => {
    frame = 0;
    const o = obj();
    if (!o) return;
    // rotateX(rx) then rotateY(ry): for small angles, one turn of √(rx²+ry²) around the axis (rx, ry, 0).
    const a = Math.hypot(rx, ry);
    const value = a < 0.01 ? 'none' : `${(rx / a).toFixed(3)} ${(ry / a).toFixed(3)} 0 ${a.toFixed(1)}deg`;
    if (value === last) return;
    last = value;
    // Each turn starts from where the previous one left it (the underlying value
    // includes the earlier animations); the earlier ones go once this one ends.
    const anim = o.animate([{ rotate: value }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    const earlier = live.splice(0);
    live.push(anim);
    anim.finished.then(() => { for (const e of earlier) e.cancel(); if (value === 'none' && live[0] === anim) { live.length = 0; anim.cancel(); } }, () => {});
  };
  const half = (d: number) => Math.round(d * 2) / 2;
  stage.addEventListener('pointerenter', () => { box = stage.getBoundingClientRect(); });
  stage.addEventListener('pointermove', (e) => {
    if (!active() || PHONE || e.pointerType === 'touch') return;
    if (!box) box = stage.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5, y = (e.clientY - box.top) / box.height - 0.5;
    rx = half(-y * 14);
    ry = half(x * 14);
    if (!frame) frame = requestAnimationFrame(write);
  });
  stage.addEventListener('pointerleave', () => { box = null; rx = 0; ry = 0; if (!frame) frame = requestAnimationFrame(write); });
}

// ─── Zumly ──────────────────────────────────────────────────────────

// Navigation recedes (the levels behind fade, see .z-view.is-previous-view in
// style.css); the object's layers never do. That keeps "previous level" apart
// from "channel behind". No filter on the views behind: a blurred view the
// size of the screen is filtered again on every frame it is drawn, and under
// the zoom that starved the raster of the view in front (tiles missing, the
// "black sectors" of 31/10).
export function zumlyOptions(views: ZumlyOptions['views'], initialView: string, mount: ZumlyOptions['mount'] = '#canvas'): ZumlyOptions {
  return {
    mount,
    initialView,
    views,
    transitions: {
      duration: '0.8s',
      ease: 'cubic-bezier(.2,.8,.2,1)',
      effects: ['none'],
      hideTrigger: 'fade',
    },
    // Going back: the button names where it goes (depthNav 'title'); a swipe
    // and a pinch move the view while the gesture lasts (gestures.follow).
    // Never the wheel: on a trackpad any two-finger movement over a view (an
    // inertial scroll past the end of a panel included) would start the
    // zoom-out scrub, and the blurred views behind, scaled up, took the
    // screen for a moment (31/10, Martin's recording). The dials and the
    // lists keep their own wheel.
    depthNav: { style: 'title' },
    inputs: { pinch: true, wheel: false },
    gestures: { follow: true },
    // On the phone, swiping sideways moves between systems (sibling views sys-*).
    // No Zumly bar: the mini-ring dots belong to the view. A gesture that starts
    // on the dial is not a swipe (Zumly ignores those born on a slider).
    lateralNav: PHONE ? { swipe: true, mode: 'auto', arrows: false, dots: false } : false,
  };
}

// On the phone, start inside a system: the board stays behind as the overview,
// a pinch or the back button away.
export async function startInside(app: Zumly, systemId: string, root: ParentNode = document) {
  const tile = root.querySelector<HTMLElement>(`.zoom-me[data-system="${systemId}"]`);
  if (!tile) return;
  tile.dataset.withDuration = '1ms';
  await app.zoomIn(tile);
  delete tile.dataset.withDuration;
}

// ─── Month ring: a calendar ─────────────────────────────────────────

export type MonthRing = {
  days: number;                      // days in the month
  today: number;                     // today's day number (1-based); 0 when the month is not this one
  values: (number | null)[];         // one per day, the first day first; null where nothing is known (the days to come)
  unit?: string;
  big: string; label: string;        // the center: today's value and what it is
  title: string;                     // the month and year
  aria: string;
};

// A month as a ring: the days around (satellites, the first at the top,
// today marked, the days to come faint) and each day's value as a sector
// growing out from a baseline inside them, the way the day ring draws its
// hours. The center says today and the month.
export function monthRing(m: MonthRing) {
  const nums = m.values.filter((v): v is number => v != null);
  const hi = Math.max(0, ...nums);
  const REACH = 3.5;                 // lanes from the baseline (orbit 7) outward
  const bars = m.values.map((v, i) => v == null ? '' : `<o-arc class="month-bar outer-orbit${i + 1 === m.today ? ' is-today' : ''}" start="${i}" value="1" interactive
      style="--o-size-ratio:${Math.max(0.2, REACH * (hi ? v / hi : 0)).toFixed(3)}" title="${esc(`${i + 1} ${m.title}: ${num(v)}${m.unit ?? ''}`)}"></o-arc>`).join('');
  const days = Array.from({ length: m.days }, (_, i) => `<div class="orbit-12 day-orbit" style="--o-range:0deg; --o-from:${((i + 0.5) * 360 / m.days).toFixed(2)}deg">
      <div class="satellite day${i + 1 === m.today ? ' is-today' : ''}${m.today && i + 1 > m.today ? ' is-ahead' : ''}" style="--o-size-ratio:1.5"><div class="capsule">${i + 1}</div></div></div>`).join('');
  return `<div class="bigbang month-ring" role="img" aria-label="${esc(m.aria)}"><div class="gravity-spot">
    ${days}<div class="orbit-7 month-bars" style="--o-max:${m.days}; --o-gap:1; --o-stroke-width:0">${bars}</div>
    <div class="orbit-0" style="--o-size-ratio:9"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(m.big)}</span><span class="time-label">${esc(m.label)}</span><span class="time-range">${esc(m.title)}</span></div></div></div>
  </div></div>`;
}

// ─── Clock rim ──────────────────────────────────────────────────────

export type ClockMark = { at: Date; level?: number; text: string };
// A clock's rim inside a ring: twelve hour ticks, the latest changes as dots
// at their minute (in their level's color, the text as a title) and now as a
// brighter dot. For the center of the orbit view; the time itself is text.
export function clockRim(marks: ClockMark[], now = new Date()) {
  const angle = (d: Date) => (d.getHours() % 12) * 30 + d.getMinutes() * 0.5;
  const ticks = Array.from({ length: 12 }, () => `<div class="vector clock-tick" style="--o-size-ratio:.6"></div>`).join('');
  const dots = marks.map((mk) => `<div class="orbit-11 clock-mark-orbit" style="--o-range:0deg; --o-from:${angle(mk.at).toFixed(1)}deg">
      <div class="satellite clock-mark${mk.level ? ` level-${mk.level}` : ''}" style="--o-size-ratio:.55" title="${esc(`${time(mk.at).slice(0, 5)} ${mk.text}`)}"></div></div>`).join('');
  return `<div class="orbit-11 clock-ticks">${ticks}</div>${dots}
    <div class="orbit-11 clock-now-orbit" style="--o-range:0deg; --o-from:${angle(now).toFixed(1)}deg"><div class="satellite clock-now" style="--o-size-ratio:.9" title="${esc(time(now).slice(0, 5))}"></div></div>`;
}

// ─── Radial list ────────────────────────────────────────────────────

export type ListItem = { id: string; title: string; ring: string; glyph: string; big: string; label: string; level?: number };
export const LIST_STEP = 30;         // degrees between items when there are more than fit around
// Up to twelve items share the whole circle; past that they keep 30° apart and
// the ring shows a window of them, the rest waiting past its ends.
export const listStep = (n: number) => n <= 12 ? 360 / Math.max(1, n) : LIST_STEP;
function listPlace(i: number, offset: number, n: number) {
  const step = listStep(n), full = n <= 12;
  let a = ((i - offset) * step) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return { a, hidden: !full && Math.abs(a) > 100, focus: Math.abs(a) < step / 2, opacity: (1 - 0.55 * Math.abs(a) / (full ? 180 : 100)).toFixed(2) };
}

// A list to turn, like the lists of a watch: the items sit on a ring and the
// one at the top is the one chosen (its name and reading in the center, which
// opens it); turning the ring (wheel, drag, arrows) brings the next one up,
// and past the last comes the first again. `offset` is the index at the top,
// fractional while the ring turns.
export function radialList(items: ListItem[], offset: number) {
  const n = items.length;
  if (!n) return '';
  const slots = items.map((it, i) => {
    const { a, hidden, focus, opacity } = listPlace(i, offset, n);
    return `<div class="orbit-10 list-orbit${hidden ? ' is-hidden' : ''}" style="--o-range:0deg; --o-from:${a.toFixed(2)}deg">
      <div class="satellite list-item${focus ? ' is-focus' : ''}${it.level ? ` level-${it.level}` : ''}" role="option" aria-selected="${focus}" aria-label="${esc(it.title)}"
        data-item="${esc(it.id)}" style="--o-size-ratio:${focus ? 4.4 : 2.8}; opacity:${opacity}">
        <div class="capsule"><span class="bigbang list-ring"><span class="gravity-spot">${it.ring}</span></span><span class="list-glyph">${icon(it.glyph, focus ? 22 : 15)}</span></div></div></div>`;
  }).join('');
  const f = items[((Math.round(offset) % n) + n) % n];
  return `<div class="bigbang radial-list" role="listbox" aria-label="${esc(t.systems)}" tabindex="0"><div class="gravity-spot">
    <div class="orbit-10 list-track" style="--o-from:${n <= 12 ? 0 : -100}deg; --o-range:${n <= 12 ? 360 : 200}deg; --o-size-ratio:.15"><o-arc style="--o-fill:var(--line)"></o-arc></div>${slots}
    <div class="orbit-0 list-center-orbit" style="--o-size-ratio:11">${listCenter(f)}</div></div></div>`;
}
// The center of the list: the item at the top, named with its reading; it opens the system.
export function listCenter(f: ListItem) {
  return `<div class="satellite at-center">
    <div class="capsule disc list-center zoom-me${f.level ? ` level-${f.level}` : ''}" role="button" tabindex="0" data-to="sys-${esc(f.id)}" data-system="${esc(f.id)}" aria-label="${esc(t.open(f.title))}">
      <span class="face-name">${esc(f.title)}</span><span class="face-big">${esc(f.big)}</span><span class="face-label">${esc(f.label)}</span></div></div>`;
}

// Turns a drawn list in place (no redraw: the satellites slide to their new
// angle). Returns the index of the item now at the top.
export function turnList(root: HTMLElement, offset: number) {
  const orbits = [...root.querySelectorAll<HTMLElement>('.list-orbit')], n = orbits.length;
  orbits.forEach((o, i) => {
    const { a, hidden, focus, opacity } = listPlace(i, offset, n);
    o.style.setProperty('--o-from', `${a.toFixed(2)}deg`);
    o.classList.toggle('is-hidden', hidden);
    const it = o.firstElementChild as HTMLElement;
    it.classList.toggle('is-focus', focus);
    it.setAttribute('aria-selected', String(focus));
    it.style.setProperty('--o-size-ratio', focus ? '4.4' : '2.8');
    it.style.opacity = opacity;
    const g = it.querySelector('.list-glyph svg');
    if (g) { g.setAttribute('width', focus ? '22' : '15'); g.setAttribute('height', focus ? '22' : '15'); }
  });
  return n ? ((Math.round(offset) % n) + n) % n : 0;
}

export type ListControls = {
  count: () => number;
  offset: () => number;
  set: (offset: number) => void;        // the ring turned (fractional while it moves)
  settle: (offset: number) => void;     // it came to rest on an item
};
// Turning the list: the wheel and the arrows move one item; a drag around
// the center turns it with the pointer, and it settles on the nearest item
// when the pointer lets go. A tap on an item brings it to the top. Zumly's
// gestures do not see a drag here. Returns the cleanup.
export function listControls(el: HTMLElement, c: ListControls) {
  const wrap = (o: number) => { const n = c.count(); return n ? ((o % n) + n) % n : 0; };
  let wheelTimer = 0, wheelAcc = 0;
  const onWheel = (e: WheelEvent) => {
    if (!(e.target as HTMLElement).closest('.radial-list')) return;
    e.preventDefault();
    e.stopPropagation();
    wheelAcc += e.deltaY;
    const steps = Math.trunc(wheelAcc / 60);
    if (steps) { wheelAcc -= steps * 60; c.settle(wrap(Math.round(c.offset()) + steps)); }
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { wheelAcc = 0; }, 300);
  };
  let drag: { angle: number; start: number; moved: boolean; target: HTMLElement } | null = null;
  let swallowUntil = 0;
  const angleAt = (list: Element, x: number, y: number) => {
    const b = list.getBoundingClientRect();
    return Math.atan2(x - (b.left + b.width / 2), -(y - (b.top + b.height / 2))) * 180 / Math.PI;
  };
  const onDown = (e: PointerEvent) => {
    const list = (e.target as HTMLElement).closest<HTMLElement>('.radial-list');
    if (!list || (e.target as HTMLElement).closest('.list-center')) return;
    list.setPointerCapture(e.pointerId);
    drag = { angle: angleAt(list, e.clientX, e.clientY), start: c.offset(), moved: false, target: e.target as HTMLElement };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const list = (e.target as HTMLElement).closest<HTMLElement>('.radial-list') ?? el.querySelector<HTMLElement>('.radial-list');
    if (!list) return;
    let d = angleAt(list, e.clientX, e.clientY) - drag.angle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) > 3) { drag.moved = true; swallowUntil = Infinity; }
    if (drag.moved) c.set(drag.start - d / listStep(c.count()));
  };
  const onUp = () => {
    if (!drag) return;
    const { moved, target } = drag;
    drag = null;
    if (moved) { swallowUntil = performance.now() + 400; c.settle(wrap(Math.round(c.offset()))); return; }
    const item = target.closest<HTMLElement>('[data-item]');
    if (item) { const i = [...el.querySelectorAll('[data-item]')].indexOf(item); if (i >= 0) c.settle(i); }
  };
  const swallow = (e: Event) => { if (performance.now() < swallowUntil) e.stopPropagation(); };
  const onKey = (e: KeyboardEvent) => {
    if (!(e.target as HTMLElement).closest('.radial-list')) return;
    const step: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in step) { e.preventDefault(); c.settle(wrap(Math.round(c.offset()) + step[e.key])); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.querySelector<HTMLElement>('.list-center')?.click(); }
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  const swallowed = ['mouseup', 'touchend', 'click'];
  for (const type of swallowed) window.addEventListener(type, swallow, true);
  return () => { for (const type of swallowed) window.removeEventListener(type, swallow, true); };
}

// ─── Music visual (WebGL) ───────────────────────────────────────────

export type MusicVisual = { level: () => number; playing: () => boolean };
// Sound as a ring of 48 bars inside a face, the way a player's visualizer
// draws it: each bar grows from the rim inward with the beat, as loud as the
// volume says. There is no audio to listen to: the beat is kept in time (120
// a minute) and the bars drift on their own. WebGL draws it; without WebGL,
// or with reduced motion, one still frame. Returns the stop.
export function musicVisual(canvas: HTMLCanvasElement, o: MusicVisual) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return () => {};
  const N = 48;
  const compile = (type: number, src: string) => { const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 v; uniform float bars[${N}];
    void main(){
      float r = length(v); float a = atan(v.x, v.y); if (a < 0.) a += 6.28318;
      float slot = a / 6.28318 * ${N}.; int i = int(floor(slot));
      float h = 0.; for (int k = 0; k < ${N}; k++) { if (k == i) h = bars[k]; }
      float w = fract(slot); float edge = smoothstep(0.12, 0.3, w) * smoothstep(0.12, 0.3, 1. - w);
      float r1 = 0.985, r0 = r1 - 0.2 * h;
      float inBar = smoothstep(r0 - 0.008, r0 + 0.008, r) * (1. - smoothstep(r1 - 0.01, r1, r));
      float alpha = inBar * edge * (0.3 + 0.6 * h);
      gl_FragColor = vec4(vec3(alpha), alpha);
    }`));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const loc = gl.getUniformLocation(prog, 'bars[0]');
  const bars = new Float32Array(N), cur = new Float32Array(N);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame = 0, stopped = false;
  // Behind the current view (Zumly keeps it, blurred) or in a hidden tab the bars wait.
  const shown = () => !document.hidden && !!canvas.closest('.is-current-view, .is-new-current-view, [data-visual-live]');
  const draw = (t: number) => {
    if (stopped) return;
    if (!shown()) { setTimeout(() => { if (!stopped) frame = requestAnimationFrame(draw); }, 300); return; }
    const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(canvas.clientHeight * devicePixelRatio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    const lvl = Math.min(1, Math.max(0, o.level())), on = o.playing();
    const beat = on ? Math.pow(1 - ((t / 500) % 1), 2) : 0;          // 120 a minute
    for (let i = 0; i < N; i++) {
      const drift = 0.5 + 0.5 * Math.sin(i * 1.7 + t / 1000 * (1.2 + (i % 5) * 0.25));
      const amp = 0.3 + 0.7 * lvl;
      const target = on ? amp * (0.15 + 0.85 * drift * (0.5 + 0.5 * beat)) : amp * 0.12;
      cur[i] += (target - cur[i]) * (still ? 1 : 0.22);
      bars[i] = cur[i];
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1fv(loc, bars);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!still) frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}

// ─── Scroll list: a long list, in a circle ───────────────────────────

export type ScrollItem = { label: string; on?: boolean; act?: boolean };
export type ScrollState = { offset: number; focus: number };
// The window: items 22° apart along the right side of the ring, from 24° to
// 156°, the first visible at the top; a curved scrollbar outside them.
export const SCROLL_STEP = 22, SCROLL_FROM = 24, SCROLL_SPAN = 132;
export const SCROLL_VISIBLE = Math.floor(SCROLL_SPAN / SCROLL_STEP) + 1;
const scrollMax = (n: number) => Math.max(0, n - SCROLL_VISIBLE);
function scrollPlace(i: number, offset: number) {
  const a = SCROLL_FROM + (i - offset) * SCROLL_STEP, d = Math.abs(a - (SCROLL_FROM + SCROLL_SPAN / 2));
  return { a, hidden: a < SCROLL_FROM - 12 || a > SCROLL_FROM + SCROLL_SPAN + 12, opacity: Math.max(0.15, 1 - 0.75 * Math.max(0, d - 44) / 40).toFixed(2) };
}
function scrollThumb(n: number, offset: number) {
  const len = n > SCROLL_VISIBLE ? Math.max(14, SCROLL_SPAN * SCROLL_VISIBLE / n) : SCROLL_SPAN;
  const max = scrollMax(n);
  return { from: SCROLL_FROM + (max ? (SCROLL_SPAN - len) * Math.min(max, Math.max(0, offset)) / max : 0), len };
}

// A long list to scroll, in a circle: the items along the right side of the
// ring, their names reaching inward, a window of seven; the one that is on
// has a dot on the ring, the focused one is bright. Outside them a curved
// scrollbar whose thumb shows where the window is; it drags. The wheel, a
// drag along the items and the arrows scroll; a tap picks. On the left,
// what is chosen and how many there are.
export function scrollList(items: ScrollItem[], st: ScrollState, o: { key: string; name: string }) {
  const n = items.length;
  const slots = items.map((it, i) => {
    const { a, hidden, opacity } = scrollPlace(i, st.offset);
    return `<div class="orbit-11 scroll-orbit${hidden ? ' is-hidden' : ''}" style="--o-range:0deg; --o-from:${a.toFixed(2)}deg">
      <div class="satellite scroll-item${it.on ? ' is-on' : ''}${i === st.focus ? ' is-focus' : ''}${it.act === false ? ' is-still' : ''}" role="option" id="${esc(o.key)}-opt-${i}"
        aria-selected="${!!it.on}" data-opt="${i}" style="--o-size-ratio:.6; opacity:${opacity}"><div class="capsule"><span class="sl-text">${esc(it.label)}</span></div></div></div>`;
  }).join('');
  const th = scrollThumb(n, st.offset);
  // The ring is drawn whole, faint; the thumb rides on its right side.
  const bar = `<div class="orbit-12 scroll-track" style="--o-size-ratio:.3"><o-arc></o-arc></div>` + (n > SCROLL_VISIBLE ? `
    <div class="orbit-12 scroll-thumb-orbit" style="--o-from:${th.from.toFixed(2)}deg; --o-range:${th.len.toFixed(2)}deg; --o-size-ratio:.35">
      <o-arc class="scroll-thumb" interactive hit-width="8" role="scrollbar" aria-label="${esc(t.scrollbarOf(o.name))}" aria-orientation="vertical"
        aria-valuemin="0" aria-valuemax="${scrollMax(n)}" aria-valuenow="${Math.round(st.offset)}"></o-arc></div>` : '');
  return `<div class="bigbang detail-ring scroll-list" role="listbox" aria-label="${esc(o.name)}" tabindex="0" data-scroll="${esc(o.key)}"
      aria-activedescendant="${esc(o.key)}-opt-${st.focus}" aria-description="${esc(t.nOptions(n))}"><div class="gravity-spot">
    ${bar}${slots}
  </div></div>`;
}
// Scrolls a drawn list in place: the items slide, the thumb moves, the focus changes hands.
export function turnScroll(root: HTMLElement, st: ScrollState) {
  const orbits = [...root.querySelectorAll<HTMLElement>('.scroll-orbit')], n = orbits.length;
  orbits.forEach((o, i) => {
    const { a, hidden, opacity } = scrollPlace(i, st.offset);
    o.style.setProperty('--o-from', `${a.toFixed(2)}deg`);
    o.classList.toggle('is-hidden', hidden);
    const it = o.firstElementChild as HTMLElement;
    it.classList.toggle('is-focus', i === st.focus);
    it.style.opacity = opacity;
  });
  const th = scrollThumb(n, st.offset);
  const thumb = root.querySelector<HTMLElement>('.scroll-thumb-orbit');
  if (thumb) {
    thumb.style.setProperty('--o-from', `${th.from.toFixed(2)}deg`);
    thumb.firstElementChild!.setAttribute('aria-valuenow', String(Math.round(st.offset)));
  }
  root.setAttribute('aria-activedescendant', `${root.dataset.scroll}-opt-${st.focus}`);
}

export type ScrollControls = {
  state: (key: string) => ScrollState;        // the list's state, kept by the view
  count: (key: string) => number;
  pick: (key: string, i: number) => void;     // an item tapped or entered
};
// Scrolling: the wheel and a drag along the items move the window (the drag
// follows the pointer's angle around the center); the thumb drags the window
// by its share of the track; the arrows move the focus and bring it into
// view, Enter and Space pick it. After a drag the window settles on a whole
// item and the click that follows is swallowed. Returns the cleanup.
export function scrollControls(el: HTMLElement, c: ScrollControls) {
  const listAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>('.scroll-list') ?? null;
  const clamp = (key: string, o: number) => Math.min(scrollMax(c.count(key)), Math.max(0, o));
  const show = (list: HTMLElement, key: string, offset: number, focus = c.state(key).focus) => {
    const st = c.state(key);
    st.offset = clamp(key, offset);
    st.focus = Math.min(c.count(key) - 1, Math.max(0, focus));
    turnScroll(list, st);
  };
  let wheelTimer = 0;
  const onWheel = (e: WheelEvent) => {
    const list = listAt(e.target);
    if (!list) return;
    const key = list.dataset.scroll!;
    e.preventDefault();
    e.stopPropagation();                 // Zumly would read the wheel as a zoom out
    show(list, key, c.state(key).offset + e.deltaY / 40);
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => show(list, key, Math.round(c.state(key).offset)), 160);
  };
  const angleAt = (list: Element, x: number, y: number) => {
    const b = list.getBoundingClientRect();
    let a = Math.atan2(x - (b.left + b.width / 2), -(y - (b.top + b.height / 2))) * 180 / Math.PI;
    if (a < 0) a += 360;
    return a;
  };
  let drag: { list: HTMLElement; key: string; angle: number; start: number; thumb: boolean; moved: boolean; target: HTMLElement } | null = null;
  let swallowUntil = 0;
  const onDown = (e: PointerEvent) => {
    const list = listAt(e.target);
    if (!list) return;
    const key = list.dataset.scroll!;
    list.setPointerCapture(e.pointerId);
    drag = { list, key, angle: angleAt(list, e.clientX, e.clientY), start: c.state(key).offset, thumb: !!(e.target as HTMLElement).closest('.scroll-thumb'), moved: false, target: e.target as HTMLElement };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const d = angleAt(drag.list, e.clientX, e.clientY) - drag.angle;
    if (Math.abs(d) > 2) { drag.moved = true; swallowUntil = Infinity; }
    if (!drag.moved) return;
    const n = c.count(drag.key);
    // The thumb moves the window by its share of the track; the items, one per step, the other way.
    const per = drag.thumb ? scrollMax(n) / Math.max(1, SCROLL_SPAN - scrollThumb(n, 0).len) : -1 / SCROLL_STEP;
    show(drag.list, drag.key, drag.start + d * per);
  };
  const onUp = () => {
    if (!drag) return;
    const { list, key, moved, target } = drag;
    drag = null;
    if (moved) { swallowUntil = performance.now() + 400; show(list, key, Math.round(c.state(key).offset)); return; }
    const opt = target.closest<HTMLElement>('[data-opt]');
    if (opt) { const i = Number(opt.dataset.opt); show(list, key, c.state(key).offset, i); c.pick(key, i); }
  };
  const swallow = (e: Event) => { if (performance.now() < swallowUntil) e.stopPropagation(); };
  const onKey = (e: KeyboardEvent) => {
    const list = listAt(e.target);
    if (!list) return;
    const key = list.dataset.scroll!, st = c.state(key), n = c.count(key);
    const step: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: SCROLL_VISIBLE, PageUp: -SCROLL_VISIBLE, Home: -n, End: n };
    if (e.key in step) {
      e.preventDefault();
      const focus = Math.min(n - 1, Math.max(0, st.focus + step[e.key]));
      const offset = focus < st.offset ? focus : focus > st.offset + SCROLL_VISIBLE - 1 ? focus - SCROLL_VISIBLE + 1 : st.offset;
      show(list, key, Math.round(offset), focus);
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.pick(key, st.focus); }
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  const swallowed = ['mouseup', 'touchend', 'click'];
  for (const type of swallowed) window.addEventListener(type, swallow, true);
  return () => { for (const type of swallowed) window.removeEventListener(type, swallow, true); };
}
