// The changes of the last hours, one tap further than the orbit's time:
// every change of the window as a list scrolled in a circle, when and whose
// along the ring, and the whole text of the one in focus in the middle, where
// a long alert has room.

import type { ViewContext } from 'zumly';
import { SCROLL_VISIBLE, esc, scrollControls, scrollList } from '../../radial/index.ts';
import type { Board } from '../context.ts';
import { scrollState, setHTML } from '../draw.ts';
import { live } from '../state.ts';
import { loadPast, timeMarks } from '../time.ts';

export function changesView(b: Board, ctx: ViewContext) {
  const { t } = b;
  const el = ctx.target;
  const span = Number(ctx.props.span) || 12, title = t.changesTitle(span);
  el.dataset.title = title;
  if (b.host.changes && !b.pastChanges) void loadPast(b);
  // All of the window, not only the twelve the ring shows; taken once, so the list holds still under the finger.
  let list = timeMarks(b, span, 500);
  const key = 'changes', st = scrollState(b, key);
  // It opens on the newest, the alerts first when one is open.
  st.focus = Math.max(0, list.findIndex((m) => m.level)); st.offset = Math.max(0, Math.min(list.length - SCROLL_VISIBLE, st.focus - 3));
  // The middle: when, whose and how long ago; the whole text, in its alert's color; if it is still open, the way to it.
  const center = () => {
    const m = list[st.focus];
    if (!m) return `<p class="hint">${t.waitingChanges}</p>`;
    const open = m.level && live(b, m.id).length;
    return `<p class="eyebrow">${esc(`${m.when} · ${m.name} · ${t.agoShort(m.ago)}`)}</p><p class="changes-text${m.level ? ` level-${m.level}` : ''}">${esc(m.text)}</p>${
      open ? `<p class="changes-still">${t.stillOpen}</p>` : ''}<button class="plain changes-go zoom-me" data-to="sys-${esc(m.id)}" data-system="${esc(m.id)}">${esc(t.open(m.name))}</button>`;
  };
  const paint = () => {
    el.innerHTML = `<div class="changes-view"><p class="eyebrow changes-head">${esc(`${title} · ${t.nChanges(list.length)}`)}</p><div class="changes-stage">${
      scrollList(list.map((m) => ({ label: `${m.when} · ${m.name}`, on: false, act: true, level: m.level })), st, { key, name: title })}
      <div class="changes-center" aria-live="polite">${center()}</div></div></div>`;
  };
  paint();
  // The history may arrive after the zoom: then, once, the list fills.
  const fill = () => { if (list.length || !b.pastChanges) return; list = timeMarks(b, span, 500); if (list.length) paint(); };
  b.rerender.add(fill);
  ctx.onCleanup(() => { b.rerender.delete(fill); });
  // The arrows, the wheel and a tap move the focus: the middle follows.
  const follow = () => { const c = el.querySelector<HTMLElement>('.changes-center'); if (c) setHTML(c, center()); };
  ctx.onCleanup(scrollControls(el, { state: (k) => scrollState(b, k), count: () => list.length, pick: (_, i) => { st.focus = i; follow(); } }));
  for (const type of ['keyup', 'wheel', 'pointerup']) el.addEventListener(type, () => requestAnimationFrame(follow));
}
