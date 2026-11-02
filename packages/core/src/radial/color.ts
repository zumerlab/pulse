// A light's color: the wheel (hue around, saturation outward) with its
// gestures, and the two curved sliders that sit inside a brightness dial.

import { t } from '../i18n.ts';
import { esc } from './markup.ts';
import { OPEN } from './ring.ts';

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

export type WheelControls = {
  current: (key: string) => [number, number];
  set: (key: string, hs: [number, number]) => void;     // moves the handle (no command yet)
  onEnd: (key: string) => void;                         // the gesture ended (send the command)
  onInput?: (key: string) => void;                      // the keyboard changed it (send after a pause)
};

// Drag or tap anywhere on the wheel; arrows turn the hue (left/right, 5° a
// step) and move the saturation (up/down, 5 a step). Returns the cleanup.
export function wheelControls(el: HTMLElement, c: WheelControls) {
  let drag: string | null = null, dragId = -1;
  const at = (wheel: HTMLElement, x: number, y: number): [number, number] => {
    const b = wheel.getBoundingClientRect();
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
    return [Math.round(h), Math.round(Math.min(1, Math.hypot(dx, dy) / (b.width / 2)) * 100)];
  };
  const onDown = (e: PointerEvent) => {
    if (drag && e.pointerId !== dragId) { onUp(); return; }   // a second finger: a pinch, not a drag
    const wheel = (e.target as HTMLElement).closest<HTMLElement>('[data-wheel]');
    if (!wheel) return;
    e.preventDefault();
    wheel.setPointerCapture(e.pointerId);
    wheel.focus({ preventScroll: true });
    drag = wheel.dataset.wheel!;
    dragId = e.pointerId;
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
