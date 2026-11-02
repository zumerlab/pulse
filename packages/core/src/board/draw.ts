// What the views draw with, over the core's primitives: a channel's ring with
// what is sending or refused, a reading's picture, markup replaced only when
// it changed, and the sound in Media's face.

import type { Dial, Reading } from '../model.ts';
import { musicVisual, ring as drawRing, type RingReading } from '../radial/index.ts';
import type { Board } from './context.ts';
import { look } from './settings.ts';
import { isPending } from './state.ts';

// Focus lives in the document or in a shadow root (a card).
export const activeElement = (b: Board) => (b.canvas.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;

// `call`: this ring's alert acts (in front and not muted): its failing segments ripple.
// What was sent and not confirmed is marked pending (it beats).
export function ring(b: Board, key: string, r: Reading, lanes: number, controls = false, muted = false, call = false, name?: string) {
  const lk = look(b);
  return drawRing(key, ringReading(r), lanes, {
    name, controls, muted, call, open: lk.dial === 'open', ends: lk.ends,
    pending: (id) => id === undefined ? isPending(b, r) : b.pending.has(id),
    failed: (id) => id === undefined ? r.ids.some((e) => b.failed.has(e)) : b.failed.has(id),
  });
}
// The host's reading is the ring's, except that a range and the measurement are given in the dial's units.
export const frac = (d: Dial, v: number) => Math.min(1, Math.max(0, (v - d.min) / (d.max - d.min)));
function ringReading(r: Reading): RingReading {
  return { ...r, range: r.range && r.dial ? { lo: frac(r.dial, r.range.lo), hi: frac(r.dial, r.range.hi) } : undefined,
    now: r.now != null && r.dial ? frac(r.dial, r.now) : undefined };
}

// A reading's picture, resolved against the host. A live one is asked again
// every few seconds (the bucket in the URL): the browser does not cache it.
export function imageOf(b: Board, r: Reading) {
  if (!r.image) return undefined;
  const src = b.host.url(r.image.src);
  return { src: r.image.live ? `${src}${src.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 8192)}` : src, alt: r.image.alt, key: r.image.live ? r.image.id : undefined };
}

// Principle: the disc opens a detail only when the detail adds something the
// face does not have: a day of changes, a history, a long list, a picture,
// color, the month, or several things to name. A control of one thing that
// is resolved on the face (a volume, a fan, a thermostat with no history)
// has no detail: it would repeat the face.
export const detailAdds = (r: Reading) => !!(r.tracks?.length || r.history || r.list || r.image || r.color || r.month) || r.ids.length > 1;

// Replaces the content only if it changed: new o-arc take a moment to draw (and
// to receive taps), and a host sends changes every few seconds.
const drawn = new WeakMap<HTMLElement, string>();
export function setHTML(el: HTMLElement, html: string) {
  if (drawn.get(el) === html) return;
  drawn.set(el, html);
  el.innerHTML = html;
}
// Forgets what an element holds, so the next setHTML writes it.
export const forget = (el: HTMLElement) => drawn.delete(el);

// Where a scrolling list is (first item shown, focus), kept across repaints and visits.
export const scrollState = (b: Board, key: string) => {
  let st = b.scrolls.get(key);
  if (!st) { st = { offset: 0, focus: 0 }; b.scrolls.set(key, st); }
  return st;
};

// Sound in Media's face: a canvas the visual draws on, when the playing channel is in front.
export const visualFor = (id: string, key: string) => id === 'media' && key === 'playing' ? '<canvas class="face-visual" aria-hidden="true"></canvas>' : '';
// Starts the visual on every canvas of a view not drawing yet; stops the ones gone.
export function startVisuals(b: Board, root: HTMLElement, stops: Map<HTMLCanvasElement, () => void>) {
  for (const [c, stop] of stops) if (!c.isConnected) { stop(); stops.delete(c); }
  for (const c of root.querySelectorAll<HTMLCanvasElement>('canvas.face-visual')) {
    if (stops.has(c)) continue;
    stops.set(c, musicVisual(c, {
      level: () => b.readings.media?.get('volume')?.r.v ?? 0.6,
      playing: () => !!b.readings.media?.get('playing')?.r.segs?.some((x) => x.on),
    }));
  }
}
