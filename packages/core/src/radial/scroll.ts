// A long list scrolled in a circle: a window of items along the right side
// of the ring, a curved scrollbar, and its gestures.

import { t } from '../i18n.ts';
import { esc } from './markup.ts';

export type ScrollItem = { label: string; on?: boolean; act?: boolean; level?: number };
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
      <div class="satellite scroll-item${it.on ? ' is-on' : ''}${i === st.focus ? ' is-focus' : ''}${it.act === false ? ' is-still' : ''}${it.level ? ` level-${it.level}` : ''}" role="option" id="${esc(o.key)}-opt-${i}"
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
  let drag: { list: HTMLElement; key: string; angle: number; start: number; thumb: boolean; moved: boolean; target: HTMLElement; pointerId: number } | null = null;
  let swallowUntil = 0;
  const onDown = (e: PointerEvent) => {
    // A second finger is a pinch (Zumly's way back): the list settles and stops swallowing.
    if (drag && e.pointerId !== drag.pointerId) { const { list, key, moved } = drag; drag = null; swallowUntil = 0; if (moved) show(list, key, Math.round(c.state(key).offset)); return; }
    const list = listAt(e.target);
    if (!list) return;
    const key = list.dataset.scroll!;
    list.setPointerCapture(e.pointerId);
    drag = { list, key, angle: angleAt(list, e.clientX, e.clientY), start: c.state(key).offset, thumb: !!(e.target as HTMLElement).closest('.scroll-thumb'), moved: false, target: e.target as HTMLElement, pointerId: e.pointerId };
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
      e.stopPropagation();                 // Zumly reads the arrows as navigation
      const focus = Math.min(n - 1, Math.max(0, st.focus + step[e.key]));
      const offset = focus < st.offset ? focus : focus > st.offset + SCROLL_VISIBLE - 1 ? focus - SCROLL_VISIBLE + 1 : st.offset;
      show(list, key, Math.round(offset), focus);
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); c.pick(key, st.focus); }
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
