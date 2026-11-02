// Lists on a ring: the radial list that turns like a watch's, with its
// gestures, and the board's queue on two rings (what calls inside, the calm
// folded outside).

import { t } from '../i18n.ts';
import { esc, icon } from './markup.ts';

export type ListItem = { id: string; title: string; ring: string; glyph: string; big: string; label: string; level?: number };
export const LIST_STEP = 30;         // degrees between items when there are more than fit around
// Up to twelve items share the whole circle; past that they keep 30° apart and
// the ring shows a window of them, the rest waiting past its ends.
export const listStep = (n: number) => n <= 12 ? 360 / Math.max(1, n) : LIST_STEP;
// The measures of the list: the orbit of the items and of their names (the
// notch sits one past the names), the size of an item and of the one at the
// top (lanes of their orbit), the size of the center, and how much an item
// fades towards the bottom.
export type ListLook = { orbit: number; names: number; item: number; focus: number; center: number; fade: number };
export const LIST_LOOK: ListLook = { orbit: 10, names: 13, item: 3, focus: 4.4, center: 8.6, fade: 0.55 };
function listPlace(i: number, offset: number, n: number, fade = LIST_LOOK.fade) {
  const step = listStep(n), full = n <= 12;
  let a = ((i - offset) * step) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return { a, hidden: !full && Math.abs(a) > 100, focus: Math.abs(a) < step / 2, opacity: (1 - fade * Math.abs(a) / (full ? 180 : 100)).toFixed(2) };
}

// A list to turn, like the lists of a watch: the items sit on a ring and the
// one at the top is the one chosen (its name and reading in the center, which
// opens it); turning the ring (wheel, drag, arrows) brings the next one up,
// and past the last comes the first again. `offset` is the index at the top,
// fractional while the ring turns.
export function radialList(items: ListItem[], offset: number, look: ListLook = LIST_LOOK) {
  const n = items.length;
  if (!n) return '';
  const full = n <= 12, step = listStep(n), turn = -offset * step;
  // The whole thing turns as one wheel: every item, its name and the ticks sit at their angle on a
  // ring drawn at the top and rotated there (`rotate`, which transitions; a new --o-from would make
  // Orbit redraw the arcs at once and the names would jump while the satellites slide). The capsule
  // turns back the same amount, so the glyph and the mini ring stay upright.
  const slots = items.map((it, i) => {
    const { a, hidden, focus, opacity } = listPlace(i, offset, n, look.fade);
    const level = it.level ? ` level-${it.level}` : '', r = (i * step + turn).toFixed(2);
    return `<div class="orbit-${look.orbit} list-orbit${hidden ? ' is-hidden' : ''}" data-i="${i}" style="--o-range:0deg; rotate:${r}deg">
      <div class="satellite list-item${focus ? ' is-focus' : ''}${level}" role="option" aria-selected="${focus}" aria-label="${esc(it.title)}"
        data-item="${esc(it.id)}" style="--o-size-ratio:${focus ? look.focus : look.item}; opacity:${opacity}">
        <div class="capsule" style="rotate:${-r}deg"><span class="bigbang list-ring"><span class="gravity-spot">${it.ring}</span></span><span class="list-glyph">${icon(it.glyph, focus ? 22 : 15)}</span></div></div></div>
    <div class="orbit-${look.names} list-name-orbit${hidden ? ' is-hidden' : ''}" data-i="${i}" style="rotate:${r}deg; opacity:${opacity}">
      <o-arc range="auto" text-anchor="middle"${nameFlip(a) ? ' flip' : ''} class="list-name${focus ? ' is-focus' : ''}${level}">${esc(it.title)}</o-arc></div>`;
  }).join('');
  const f = items[((Math.round(offset) % n) + n) % n];
  // The dial: a tick between items, and the notch above the top, where an item locks; the names ride outside, on orbit 13.
  const ticks = full ? `<div class="orbit-${look.orbit} list-ticks" style="--o-from:${(step / 2).toFixed(2)}deg; rotate:${turn.toFixed(2)}deg">${Array.from({ length: n }, () =>
    '<div class="vector list-tick" style="--o-size-ratio:.4"></div>').join('')}</div>` : '';
  return `<div class="bigbang radial-list" role="listbox" aria-label="${esc(t.systems)}" tabindex="0" data-turn="${turn.toFixed(2)}"><div class="gravity-spot">
    <div class="orbit-${look.orbit} list-track" style="--o-from:${full ? 0 : -100}deg; --o-range:${full ? 360 : 200}deg; --o-size-ratio:.15"><o-arc style="--o-fill:var(--line)"></o-arc></div>${ticks}
    <div class="orbit-${look.names + 1} list-notch-orbit" style="--o-range:0deg; --o-from:0deg"><div class="satellite list-notch" style="--o-size-ratio:.7"></div></div>${slots}
    <div class="orbit-0 list-center-orbit" style="--o-size-ratio:${look.center}">${listCenter(f)}</div></div></div>`;
}
// A name in the bottom half reads the other way round, so it is never upside down.
const nameFlip = (a: number) => a > 100 && a < 260;
// The center of the list: the item at the top, its glyph, its name and its
// reading; it opens the system.
export function listCenter(f: ListItem) {
  return `<div class="satellite at-center">
    <div class="capsule disc list-center zoom-me${f.level ? ` level-${f.level}` : ''}" role="button" tabindex="0" data-to="sys-${esc(f.id)}" data-system="${esc(f.id)}" aria-label="${esc(t.open(f.title))}">
      ${icon(f.glyph, 22)}<span class="face-name">${esc(f.title)}</span><span class="face-big">${esc(f.big)}</span><span class="face-label">${esc(f.label)}</span>
      <span class="list-open">${esc(t.openHint)}</span></div></div>`;
}

// Turns a drawn list in place (no redraw: the wheel rotates to its new angle,
// the short way round, and the items slide with it). Returns the index of the
// item now at the top.
export function turnList(root: HTMLElement, offset: number, look: ListLook = LIST_LOOK) {
  const orbits = [...root.querySelectorAll<HTMLElement>('.list-orbit')], n = orbits.length, step = listStep(n);
  const names = [...root.querySelectorAll<HTMLElement>('.list-name-orbit')];
  // The wheel's angle keeps counting past a full turn, so a settle on a wrapped
  // offset (the last item to the first) is still one step, not a whole turn back.
  const prev = parseFloat(root.dataset.turn ?? '0'), target = -offset * step;
  const turn = target + 360 * Math.round((prev - target) / 360);
  root.dataset.turn = turn.toFixed(2);
  const ticks = root.querySelector<HTMLElement>('.list-ticks');
  if (ticks) ticks.style.rotate = `${turn.toFixed(2)}deg`;
  orbits.forEach((o, i) => {
    const { a, hidden, focus, opacity } = listPlace(i, offset, n, look.fade);
    const r = (i * step + turn).toFixed(2);
    o.style.rotate = `${r}deg`;
    o.classList.toggle('is-hidden', hidden);
    const it = o.firstElementChild as HTMLElement;
    (it.firstElementChild as HTMLElement).style.rotate = `${-r}deg`;
    it.classList.toggle('is-focus', focus);
    it.setAttribute('aria-selected', String(focus));
    it.style.setProperty('--o-size-ratio', String(focus ? look.focus : look.item));
    it.style.opacity = opacity;
    const g = it.querySelector('.list-glyph svg');
    if (g) { g.setAttribute('width', focus ? '22' : '15'); g.setAttribute('height', focus ? '22' : '15'); }
    const no = names[i];
    if (no) {
      no.style.rotate = `${r}deg`;
      no.style.opacity = opacity;
      no.classList.toggle('is-hidden', hidden);
      const arc = no.firstElementChild as HTMLElement;
      arc.classList.toggle('is-focus', focus);
      arc.toggleAttribute('flip', nameFlip(a));
    }
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
  let drag: { angle: number; start: number; moved: boolean; target: HTMLElement; pointerId: number } | null = null;
  let swallowUntil = 0;
  const angleAt = (list: Element, x: number, y: number) => {
    const b = list.getBoundingClientRect();
    return Math.atan2(x - (b.left + b.width / 2), -(y - (b.top + b.height / 2))) * 180 / Math.PI;
  };
  const onDown = (e: PointerEvent) => {
    // A second finger is a pinch (Zumly's way back): the ring settles and stops swallowing.
    if (drag && e.pointerId !== drag.pointerId) { const { moved } = drag; drag = null; swallowUntil = 0; if (moved) c.settle(wrap(Math.round(c.offset()))); return; }
    const list = (e.target as HTMLElement).closest<HTMLElement>('.radial-list');
    if (!list || (e.target as HTMLElement).closest('.list-center')) return;
    list.setPointerCapture(e.pointerId);
    drag = { angle: angleAt(list, e.clientX, e.clientY), start: c.offset(), moved: false, target: e.target as HTMLElement, pointerId: e.pointerId };
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

// ─── Queue: what calls inside, the calm folded outside ─────────────

// The systems as a queue on two rings around a center. The inner ring holds
// what calls, in order of urgency clockwise from the top, each named beside
// it, upright; the outer ring, on the left half, holds what is fine: folded
// into one quiet button while something calls, or each system there when
// open. Every item is the same size; what calls is told by its ring's weight
// and color and by a wave (see the CSS). The center is the item in `focus`
// (listCenter): it opens it. The host handles `data-qitem` (focus an item)
// and `data-calm` (fold or open the calm).
export type QueueLook = { inner: number; outer: number; item: number; center: number };
export const QUEUE_LOOK: QueueLook = { inner: 8, outer: 11, item: 3, center: 9 };
export function queueRings(items: ListItem[], o: { focus: string; open: boolean; look?: QueueLook }) {
  const look = o.look ?? QUEUE_LOOK;
  const urgent = items.filter((it) => it.level), calm = items.filter((it) => !it.level);
  // Nothing calls: everything is fine and sits on the inner ring, nothing to fold.
  const inner = urgent.length ? urgent : calm, outer = urgent.length ? calm : [];
  const spread = (n: number, from: number, span: number) => Array.from({ length: n }, (_, i) =>
    n === 1 ? from + (urgent.length ? 0 : span / 2) : from + i * Math.min(urgent.length ? 40 : 360 / n, span / (n - 1)));
  const innerAt = urgent.length ? spread(inner.length, 30, 140) : inner.map((_, i) => i * 360 / inner.length);
  const outerAt = outer.length === 1 ? [270] : spread(outer.length, 205, 130);
  const slot = (it: ListItem, a: number, orbit: number, side: 'start' | 'end') => {
    const level = it.level ? ` level-${it.level}` : '', focus = it.id === o.focus;
    return `<div class="orbit-${orbit} queue-orbit" style="--o-range:0deg; rotate:${a.toFixed(1)}deg">
      <div class="satellite queue-item${focus ? ' is-focus' : ''}${level}" style="--o-size-ratio:${look.item}">
        <div class="capsule" style="rotate:${(-a).toFixed(1)}deg">
          <button class="queue-hit" data-qitem="${esc(it.id)}" aria-pressed="${focus}" aria-label="${esc(`${it.title}, ${it.big}`)}">
            <span class="bigbang queue-ring"><span class="gravity-spot">${it.ring}</span></span><span class="queue-glyph">${icon(it.glyph, 18)}</span></button>
          <span class="queue-label is-${side}" aria-hidden="true"><span class="queue-title">${esc(it.title)}</span><span class="queue-big">${esc(it.big)}</span></span>
        </div></div></div>`;
  };
  const sideOf = (a: number) => (((a % 360) + 360) % 360) < 180 ? 'start' : 'end';
  const innerHtml = inner.map((it, i) => slot(it, innerAt[i], look.inner, sideOf(innerAt[i]))).join('');
  const outerHtml = !outer.length ? '' : o.open ? outer.map((it, i) => slot(it, outerAt[i], look.outer, 'end')).join('')
    : `<div class="orbit-${look.outer} queue-orbit" style="--o-range:0deg; rotate:270deg"><div class="satellite queue-fold" style="--o-size-ratio:${look.item}">
        <div class="capsule" style="rotate:-270deg"><button class="queue-hit" data-calm aria-expanded="false" aria-label="${esc(t.showTheCalm(outer.length))}">
          <span class="queue-dots">${'<i></i>'.repeat(Math.min(outer.length, 6))}</span></button>
          <span class="queue-label is-end" aria-hidden="true"><span class="queue-title">${esc(t.calmN(outer.length))}</span><span class="queue-big">${esc(t.showCalm)}</span></span></div></div></div>`;
  // The tracks: the inner ring whole and faint; the outer one only where the calm sit.
  const tracks = `<div class="orbit-${look.inner} queue-track" style="--o-size-ratio:.15"><o-arc style="--o-fill:var(--line)"></o-arc></div>${outer.length
    ? `<div class="orbit-${look.outer} queue-track" style="--o-size-ratio:.15; --o-from:${o.open ? 195 : 255}deg; --o-range:${o.open ? 150 : 30}deg"><o-arc style="--o-fill:var(--line)"></o-arc></div>` : ''}`;
  const f = items.find((it) => it.id === o.focus) ?? items[0];
  return `<div class="bigbang queue-rings" role="group" aria-label="${esc(t.systems)}"><div class="gravity-spot">${tracks}${innerHtml}${outerHtml}
    <div class="orbit-0 queue-center-orbit" style="--o-size-ratio:${look.center}">${f ? listCenter(f) : ''}</div></div></div>`;
}
