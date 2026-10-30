// The radial object both prototypes share: the ring of a channel, the layer
// markup, the dial's gestures and the Zumly setup. The views (board, system,
// detail) stay in each prototype: one reads simulated data, the other a live
// Home Assistant, and what they do around the object differs.

import type { ZumlyOptions } from 'zumly';
import type Zumly from 'zumly';
import { num, t } from './i18n.ts';

// ─── What a ring needs to know about a channel ──────────────────────

export type RingSeg = { label: string; on: boolean; act?: unknown; entity?: string };
export type RingDial = { min: number; max: number; step: number; unit: string; label: string; value: number };
export type RingReading = {
  kind: 'p' | 's';
  v?: number;                       // progress 0..1
  segs?: RingSeg[];
  dial?: RingDial;
  alert?: { level: 1 | 2; fail?: number[] };
};

// ─── Sizes ──────────────────────────────────────────────────────────

// On a phone you look at one system at a time: two visible layers, less growth
// between layers and no parallax. Decided on load.
export const PHONE = matchMedia('(max-width: 600px)').matches;
export const GROW = PHONE ? 0.24 : 0.42;                   // --o-depth-grow
export const SIZE = Array.from({ length: PHONE ? 2 : 3 }, (_, d) => 1 + GROW * d);
export const STROKE = [6, 3, 2.5];                         // apparent stroke per depth, px
export const LOCK_MS = 800;                                // controls locked after a layer change
export const UNIVERSE = 240;                               // px; one lane is radius / 12 = 10 px
export const LANE = UNIVERSE / 2 / 12;

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
};

// A channel's ring on orbit-12, which touches the edge of the universe (.bigbang).
// Thickness is in lanes: `lanes` = px / lane. With `controls`, the dial is
// dragged (role="slider") and each segment with an action is a switch. The
// dial's knob is an `.at-value` satellite on the same ring: Orbit seats it
// where the progress ends and moves it when the value changes.
export function ring(key: string, r: RingReading, lanes: number, o: RingOptions = {}) {
  const fill = o.muted ? 'var(--muted)' : r.alert ? levelColor(r.alert.level) : 'var(--ink)';
  const size = `--o-size-ratio:${lanes.toFixed(3)}`;
  const isPending = o.pending ?? (() => false);
  if (r.kind === 'p') {
    const pct = ((r.v ?? 0) * 100).toFixed(1);
    const busy = r.segs?.some((s) => isPending(s.entity)) || isPending(undefined) ? ' is-pending' : '';
    const dial = o.controls && r.dial;
    if (!dial) {
      return `<div class="orbit-12${busy}" style="${size}"><o-progress value="${pct}"
        style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress></div>`;
    }
    return `<div class="orbit-12${busy}" style="${size}"><o-progress value="${pct}" class="dial" data-dial="${key}"
        interactive hit-width="12" role="slider" tabindex="0" aria-label="${esc(o.name ? t.dialOf(dial.label, o.name) : dial.label)}"
        aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${dial.value}"
        aria-valuetext="${num(dial.value)}${dial.unit}" style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress>
      <div class="satellite knob at-value" style="--o-size-ratio:1.4"></div></div>`;
  }
  const segs = (r.segs ?? []).map((s, i) => {
    const fail = !!r.alert?.fail?.includes(i) && !o.muted;
    const f = fail ? fill : s.on ? 'var(--ink)' : 'var(--dim)';
    // Rule 2: the wave comes out of the failing segment (o-arc.ripple).
    const cls = (isPending(s.entity) ? ' is-pending' : '') + (o.call && fail ? ' ripple' : '');
    if (!(o.controls && s.act)) return `<o-arc class="${cls.trim()}" style="--o-fill:${f}"></o-arc>`;
    return `<o-arc style="--o-fill:${f}" class="toggle${cls}" data-seg="${i}" interactive hit-width="10"
      role="switch" tabindex="0" aria-checked="${s.on}" aria-label="${esc(s.label)}"></o-arc>`;
  }).join('');
  const gap = (r.segs?.length ?? 0) > 1 ? 24 : 0;
  return `<div class="orbit-12" style="${size}; --o-gap:${gap}">${segs}</div>`;
}

// ─── Layers ─────────────────────────────────────────────────────────

export type Face = {
  glyph: string; name: string; big: string; label: string;
  to: string;                          // Zumly view the disc opens
  props?: Record<string, string>;      // data-* for that view
  aria: string;
  extra?: string;                      // more markup inside the disc ("sending…")
};

// The front layer's center: the face in an at-center satellite of orbit-0,
// which is the Zumly trigger of the next level.
export function face(f: Face) {
  const props = Object.entries(f.props ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  return `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
    <div class="capsule disc zoom-me" role="button" tabindex="0" data-to="${f.to}"${props} aria-label="${esc(f.aria)}">
      ${icon(f.glyph)}<span class="face-name">${esc(f.name)}</span>
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
export function backLayer(b: BackLayer) {
  return `<div class="orbit-11" style="--o-from:${b.at}deg">
      <o-arc range="auto" class="arc-label" style="font-size:${(11 / b.grow).toFixed(2)}px">${esc(b.text)}</o-arc></div>
    <div class="orbit-12" style="--o-size-ratio:${(b.stroke / b.grow / LANE).toFixed(3)}">
      <o-arc interactive hit-width="${(b.hit / b.grow).toFixed(1)}" ${b.pick.attr}="${esc(b.pick.value)}" class="ring-hit"
        role="button" tabindex="0" aria-label="${esc(b.pick.aria)}"></o-arc></div>`;
}

// Labels of the layers behind alternate sides so they never share a line.
export const labelAt = (i: number) => (i === 1 ? 300 : 30);

// The system view's skeleton: stage with the universe, strip, dots on the
// phone and the buttons below.
export function systemShell(title: string | null, buttons: string) {
  return `<div class="system">
    ${title ? `<p class="eyebrow sys-title">${esc(title)}</p>` : ''}
    <div class="stage" data-zoom="calm">
      <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective is-flat"
        style="--o-depth-grow:${GROW}"></div></div></div>
    </div>
    <div class="strip" aria-live="polite"></div>
    ${PHONE ? `<nav class="dots" aria-label="${t.systems}"></nav>` : ''}
    <div class="controls">${buttons}</div>
  </div>`;
}

export type Dot = { id: string; title: string; level: number; ring: string };
// One mini ring per system; the one of a system with an alert beats.
export function dots(list: Dot[], currentId: string) {
  return list.map((d) => `<button class="dot${d.level ? ` has-alert level-${d.level}` : ''}" data-go="${d.id}"
      aria-label="${esc(d.title)}"${d.id === currentId ? ' aria-current="true"' : ''}>
      <span class="bigbang"><span class="gravity-spot">${d.ring}</span></span></button>`).join('');
}
export const DOT_LANES = 2.5 / (22 / 24);
export const MINI_LANES = 6 / 3.5;

export function calmStrip(title: string, frontName: string, extra: number, how: string) {
  return `<strong>${esc(title)}</strong> · ${t.inFront(frontName)}${extra > 0 ? ` · ${t.behind(extra)}` : ''}${
    how ? `<span class="how">${how}</span>` : ''}`;
}

// ─── Dial gestures ──────────────────────────────────────────────────

export type DialControls = {
  locked: () => boolean;
  ringOf: (key: string) => Element | null;      // the .orbit-12 that holds the dial, for the angle
  current: (key: string) => number;             // value as a fraction 0..1
  stepOf: (key: string) => number;              // one step as a fraction of the range
  set: (key: string, v: number) => void;        // from a fraction (clamped to 0..1)
  onStart?: (key: string) => void;
  onEnd?: (key: string) => void;                // the drag ended (send the command)
  onInput?: (key: string) => void;              // keyboard or wheel changed it (send after a pause)
  activate?: string;                            // selector of the arcs Enter and Space click
};

// Drag, wheel and keyboard on the front dial, and how they live with Zumly.
// Returns the cleanup.
export function dialControls(el: HTMLElement, c: DialControls) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  let drag: { key: string; last: number } | null = null;
  let swallowUntil = 0;

  // Pointer angle (0 at the top, clockwise) as a fraction of a turn. Near the
  // center the angle jumps with any movement: there it does not change.
  const angleAt = (key: string, x: number, y: number) => {
    const b = c.ringOf(key)?.getBoundingClientRect();
    if (!b) return null;
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    if (Math.hypot(dx, dy) < b.width * 0.2) return null;
    return ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360 / 360;
  };
  const dragTo = (x: number, y: number) => {
    if (!drag) return;
    let v = angleAt(drag.key, x, y);
    if (v === null) return;
    // No jumps across zero: from the end to the start (and back) it stays at the limit.
    if (drag.last > 0.75 && v < 0.25) v = 1;
    else if (drag.last < 0.25 && v > 0.75) v = 0;
    drag.last = v;
    c.set(drag.key, v);
  };
  const onDown = (e: PointerEvent) => {
    const ringEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ringEl || c.locked()) return;
    e.preventDefault();
    ringEl.setPointerCapture(e.pointerId);
    ringEl.focus({ preventScroll: true });
    const key = ringEl.dataset.dial!;
    drag = { key, last: c.current(key) };
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
    const key = ringEl.dataset.dial!;
    c.set(key, clamp(c.current(key) + (e.deltaY < 0 ? c.stepOf(key) : -c.stepOf(key))));
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
    const key = target.dataset.dial!, v = c.current(key), s = c.stepOf(key);
    const next: Record<string, number> = {
      ArrowRight: v + s, ArrowUp: v + s, ArrowLeft: v - s, ArrowDown: v - s,
      PageUp: v + s * 4, PageDown: v - s * 4, Home: 0, End: 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    c.set(key, clamp(next[e.key]));
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

// ±7° parallax with the pointer, only in 3D and not on the phone (no pointer).
export function parallax(stage: HTMLElement, obj: HTMLElement, active: () => boolean) {
  stage.addEventListener('pointermove', (e) => {
    if (!active() || PHONE) return;
    const b = stage.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    obj.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    obj.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
  });
  stage.addEventListener('pointerleave', () => {
    obj.style.setProperty('--rx', '0deg');
    obj.style.setProperty('--ry', '0deg');
  });
}

// ─── Zumly ──────────────────────────────────────────────────────────

// Navigation recedes with blur; the object's layers never do. That keeps
// "previous level" apart from "channel behind".
export function zumlyOptions(views: ZumlyOptions['views'], initialView: string, mount: ZumlyOptions['mount'] = '#canvas'): ZumlyOptions {
  return {
    mount,
    initialView,
    views,
    transitions: {
      duration: '0.8s',
      ease: 'cubic-bezier(.2,.8,.2,1)',
      effects: ['blur(3px) brightness(.45)', 'blur(8px) brightness(.25)'],
      // The blur is applied at once instead of animated: the zoom runs smoother.
      animateEffects: false,
      hideTrigger: 'fade',
    },
    // Going back: the button names where it goes (depthNav 'title'); the wheel,
    // a swipe and a pinch move the view while the gesture lasts (gestures.follow).
    depthNav: { style: 'title' },
    inputs: { pinch: true },
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
