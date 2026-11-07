// A long list scrolled in a circle, and its gestures, in one of two shapes.
// Rows (a detail's list): the rows stacked inside the disc, each as wide as
// the circle is at its height, a name and a line under it, the window of
// five whole and the rows passing out shrinking and fading at the rim. Ring
// (the changes): the items along the right side of the ring, their names
// reaching inward, the middle left free for what is in focus. Both have a
// curved scrollbar on the ring's right side.

import { t } from '../i18n.ts';
import { esc } from './markup.ts';

// A row: its name, a line under it (rows only), whether it is on (the one
// chosen of a choice; otherwise, off is dim), whether tapping it does
// something, and a level when it calls (a dot of its color, never dim).
export type ScrollItem = { label: string; detail?: string; on?: boolean; act?: boolean; level?: number };
export type ScrollState = { offset: number; focus: number };
export type ScrollOptions = {
  key: string; name: string;
  rows?: boolean;           // the rows shape; the ring's otherwise
  choice?: boolean;         // the one on is the one chosen: a check, and the others are not dim
  pending?: boolean;        // an action of the list is on its way: the rows wait
};

// The ring: items 22° apart along the right side, from 24° to 156°, the first
// visible at the top.
export const SCROLL_STEP = 22, SCROLL_FROM = 24, SCROLL_SPAN = 132;
export const SCROLL_VISIBLE = Math.floor(SCROLL_SPAN / SCROLL_STEP) + 1;
// The rows: five whole, each 13 % of the diameter, the window centered.
export const ROWS_VISIBLE = 5, ROW = 0.13;
const visibleOf = (rows: boolean) => (rows ? ROWS_VISIBLE : SCROLL_VISIBLE);
const scrollMax = (n: number, vis: number) => Math.max(0, n - vis);

function ringPlace(i: number, offset: number) {
  const a = SCROLL_FROM + (i - offset) * SCROLL_STEP, d = Math.abs(a - (SCROLL_FROM + SCROLL_SPAN / 2));
  return { a, hidden: a < SCROLL_FROM - 12 || a > SCROLL_FROM + SCROLL_SPAN + 12, opacity: Math.max(0.15, 1 - 0.75 * Math.max(0, d - 44) / 40).toFixed(2) };
}
// A row's place, as shares of the disc: how far from the center (y), how wide
// the circle is there (its outer edge, less a margin), and, past the window,
// how much of it is left.
function rowPlace(i: number, offset: number, n: number) {
  const vis = Math.min(n, ROWS_VISIBLE), c = (vis - 1) / 2, slot = i - offset;
  const out = slot < 0 ? -slot : slot > vis - 1 ? slot - (vis - 1) : 0;
  const y = (slot - c) * ROW, edge = Math.min(0.5, Math.abs(y) + ROW / 2);
  const width = Math.max(0.3, 2 * Math.sqrt(Math.max(0, 0.25 - edge * edge)) - 0.05);
  return { y, width, hidden: out > 1.5, opacity: Math.max(0, 1 - out / 1.2), scale: 1 - 0.15 * Math.min(1, out) };
}
const rowStyle = (p: ReturnType<typeof rowPlace>) =>
  `top:${(50 + p.y * 100).toFixed(2)}%; width:${(p.width * 100).toFixed(2)}%; opacity:${p.opacity.toFixed(2)}; transform:translate(-50%, -50%) scale(${p.scale.toFixed(3)})`;
function scrollThumb(n: number, offset: number, vis: number) {
  const len = n > vis ? Math.max(14, SCROLL_SPAN * vis / n) : SCROLL_SPAN;
  const max = scrollMax(n, vis);
  return { from: SCROLL_FROM + (max ? (SCROLL_SPAN - len) * Math.min(max, Math.max(0, offset)) / max : 0), len };
}

// A long list to scroll, in a circle. The focused row is bright (and ringed
// while the list has the keyboard). Outside the rows a curved scrollbar whose
// thumb shows where the window is; it drags. The wheel, a drag along the rows
// and the arrows scroll; a tap picks.
export function scrollList(items: ScrollItem[], st: ScrollState, o: ScrollOptions) {
  const n = items.length, rows = !!o.rows, vis = visibleOf(rows);
  const option = (it: ScrollItem, i: number, style: string, extra = '') =>
    `class="${rows ? '' : 'satellite '}scroll-item${it.on ? ' is-on' : ''}${i === st.focus ? ' is-focus' : ''}${it.act === false ? ' is-still' : ''}${it.level ? ` level-${it.level}` : ''}${extra}"
      role="option" id="${esc(o.key)}-opt-${i}" aria-selected="${!!it.on}" data-opt="${i}" style="${style}"`;
  const slots = rows
    ? items.map((it, i) => {
      const p = rowPlace(i, st.offset, n), dim = !o.choice && it.on === false && !it.level;
      return `<div ${option(it, i, rowStyle(p), `${p.hidden ? ' is-hidden' : ''}${dim ? ' is-off' : ''}`)}><span class="sl-name">${
        it.level ? '<i class="sl-mark" aria-hidden="true"></i>' : ''}<span class="sl-text">${esc(it.label)}</span>${
        o.choice && it.on ? '<span class="sl-check" aria-hidden="true">✓</span>' : ''}</span>${
        it.detail ? `<span class="sl-detail">${esc(it.detail)}</span>` : ''}</div>`;
    }).join('')
    : items.map((it, i) => {
      const { a, hidden, opacity } = ringPlace(i, st.offset);
      return `<div class="orbit-11 scroll-orbit${hidden ? ' is-hidden' : ''}" style="--o-range:0deg; --o-from:${a.toFixed(2)}deg">
      <div ${option(it, i, `--o-size-ratio:.6; opacity:${opacity}`)}><div class="capsule"><span class="sl-text">${esc(it.label)}</span></div></div></div>`;
    }).join('');
  const th = scrollThumb(n, st.offset, vis);
  // The ring is drawn whole, faint; the thumb rides on its right side.
  const bar = `<div class="orbit-12 scroll-track" style="--o-size-ratio:.3"><o-arc></o-arc></div>` + (n > vis ? `
    <div class="orbit-12 scroll-thumb-orbit" style="--o-from:${th.from.toFixed(2)}deg; --o-range:${th.len.toFixed(2)}deg; --o-size-ratio:.35">
      <o-arc class="scroll-thumb" interactive hit-width="8" role="scrollbar" aria-label="${esc(t.scrollbarOf(o.name))}" aria-orientation="vertical"
        aria-valuemin="0" aria-valuemax="${scrollMax(n, vis)}" aria-valuenow="${Math.round(st.offset)}"></o-arc></div>` : '');
  return `<div class="bigbang detail-ring scroll-list${rows ? ' is-rows' : ''}${o.pending ? ' is-pending' : ''}" role="listbox" aria-label="${esc(o.name)}" tabindex="0" data-scroll="${esc(o.key)}"
      aria-activedescendant="${esc(o.key)}-opt-${st.focus}" aria-description="${esc(t.nOptions(n))}"><div class="gravity-spot">
    ${bar}${rows ? '' : slots}
  </div>${rows ? `<div class="sl-rows">${slots}</div>` : ''}</div>`;
}
// Scrolls a drawn list in place: the items slide, the thumb moves, the focus changes hands.
export function turnScroll(root: HTMLElement, st: ScrollState) {
  const rows = root.classList.contains('is-rows'), vis = visibleOf(rows);
  const items = [...root.querySelectorAll<HTMLElement>('.scroll-item')], n = items.length;
  items.forEach((it, i) => {
    it.classList.toggle('is-focus', i === st.focus);
    if (rows) {
      const p = rowPlace(i, st.offset, n);
      it.setAttribute('style', rowStyle(p));
      it.classList.toggle('is-hidden', p.hidden);
      return;
    }
    const { a, hidden, opacity } = ringPlace(i, st.offset), o = it.parentElement!;
    o.style.setProperty('--o-from', `${a.toFixed(2)}deg`);
    o.classList.toggle('is-hidden', hidden);
    it.style.opacity = opacity;
  });
  const th = scrollThumb(n, st.offset, vis);
  const thumb = root.querySelector<HTMLElement>('.scroll-thumb-orbit');
  if (thumb) {
    thumb.style.setProperty('--o-from', `${th.from.toFixed(2)}deg`);
    thumb.firstElementChild!.setAttribute('aria-valuenow', String(Math.round(st.offset)));
  }
  root.setAttribute('aria-activedescendant', `${root.dataset.scroll}-opt-${st.focus}`);
}
// Where a list opens to show the row at `i`: the window around it.
export const scrollTo = (i: number, n: number, rows = false) => {
  const vis = visibleOf(rows);
  return Math.max(0, Math.min(n - vis, i - Math.floor(vis / 2)));
};

export type ScrollControls = {
  state: (key: string) => ScrollState;        // the list's state, kept by the view
  count: (key: string) => number;
  pick: (key: string, i: number) => void;     // an item tapped or entered
  focus?: (key: string, i: number) => void;   // the focus moved to another row
};
// Scrolling: the wheel and a drag along the items move the window (on the
// ring the drag follows the pointer's angle around the center; the rows, its
// height); the thumb drags the window by its share of the track; the arrows
// move the focus and bring it into view, Enter and Space pick it. After a
// drag the window settles on a whole item and the click that follows is
// swallowed. Returns the cleanup.
export function scrollControls(el: HTMLElement, c: ScrollControls) {
  const listAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>('.scroll-list') ?? null;
  const isRows = (list: HTMLElement) => list.classList.contains('is-rows');
  const clamp = (list: HTMLElement, key: string, o: number) => Math.min(scrollMax(c.count(key), visibleOf(isRows(list))), Math.max(0, o));
  const show = (list: HTMLElement, key: string, offset: number, focus = c.state(key).focus) => {
    const st = c.state(key), was = st.focus;
    st.offset = clamp(list, key, offset);
    st.focus = Math.min(c.count(key) - 1, Math.max(0, focus));
    turnScroll(list, st);
    if (st.focus !== was) c.focus?.(key, st.focus);
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
  let drag: { list: HTMLElement; key: string; angle: number; y: number; start: number; thumb: boolean; moved: boolean; target: HTMLElement; pointerId: number } | null = null;
  let swallowUntil = 0;
  const onDown = (e: PointerEvent) => {
    // A second finger is a pinch (Zumly's way back): the list settles and stops swallowing.
    if (drag && e.pointerId !== drag.pointerId) { const { list, key, moved } = drag; drag = null; swallowUntil = 0; if (moved) show(list, key, Math.round(c.state(key).offset)); return; }
    const list = listAt(e.target);
    if (!list) return;
    const key = list.dataset.scroll!;
    list.setPointerCapture(e.pointerId);
    drag = { list, key, angle: angleAt(list, e.clientX, e.clientY), y: e.clientY, start: c.state(key).offset, thumb: !!(e.target as HTMLElement).closest('.scroll-thumb'), moved: false, target: e.target as HTMLElement, pointerId: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const n = c.count(drag.key), rows = isRows(drag.list), vis = visibleOf(rows);
    // The thumb moves the window by its share of the track; the items, one per step (or per row), the other way.
    const along = drag.thumb || !rows;
    const d = along ? angleAt(drag.list, e.clientX, e.clientY) - drag.angle : e.clientY - drag.y;
    if (Math.abs(d) > (along ? 2 : 4)) { drag.moved = true; swallowUntil = Infinity; }
    if (!drag.moved) return;
    const per = drag.thumb ? scrollMax(n, vis) / Math.max(1, SCROLL_SPAN - scrollThumb(n, 0, vis).len)
      : rows ? -1 / (ROW * drag.list.getBoundingClientRect().height) : -1 / SCROLL_STEP;
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
    const key = list.dataset.scroll!, st = c.state(key), n = c.count(key), vis = visibleOf(isRows(list));
    const step: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, PageDown: vis, PageUp: -vis, Home: -n, End: n };
    if (e.key in step) {
      e.preventDefault();
      e.stopPropagation();                 // Zumly reads the arrows as navigation
      const focus = Math.min(n - 1, Math.max(0, st.focus + step[e.key]));
      const offset = focus < st.offset ? focus : focus > st.offset + vis - 1 ? focus - vis + 1 : st.offset;
      show(list, key, Math.round(offset), focus);
    } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); c.pick(key, st.focus); }
  };
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);
  // Zumly zooms out on the release of ArrowDown and ArrowLeft unless the key was taken (it leaves sliders and text alone, not listboxes).
  const onKeyUp = (e: KeyboardEvent) => { if (listAt(e.target) && e.key.startsWith('Arrow')) e.preventDefault(); };
  el.addEventListener('keyup', onKeyUp);
  const swallowed = ['mouseup', 'touchend', 'click'];
  for (const type of swallowed) window.addEventListener(type, swallow, true);
  return () => { for (const type of swallowed) window.removeEventListener(type, swallow, true); };
}
