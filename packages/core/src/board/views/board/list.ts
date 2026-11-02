// List: the systems as a queue on two rings (queueRings), what calls inside
// by urgency and the calm folded outside. The center holds the one in focus:
// the most serious, unless the viewer picked another.

import { esc, queueRings, type ListItem } from '../../../radial/index.ts';
import type { Board } from '../../context.ts';
import { ring, setHTML } from '../../draw.ts';
import { calmOpen } from '../../settings.ts';
import { worst } from '../../state.ts';
import { boardLanes, calmFolds, calmToggle, front, urgencyOrder } from './shared.ts';

export const listStage = () => `<div class="stage list-stage queue-stage"><div class="one"></div><div class="queue-foot"></div></div>`;

function listItem(b: Board, id: string): ListItem {
  const f = front(b, id);
  return { id, title: b.sys[id].title, ring: ring(b, f.key, f.r, boardLanes(worst(b, id)), false, !f.r.alert), glyph: f.ch.glyph, big: f.big,
    label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`, level: worst(b, id) };
}

export function paintList(b: Board, body: HTMLElement, ids: string[]) {
  const queue = urgencyOrder(b, ids), first = queue[0];
  const focus = b.listFocus && queue.includes(b.listFocus) ? b.listFocus : first;
  setHTML(body.querySelector<HTMLElement>('.queue-stage .one')!, queueRings(queue.map((id) => listItem(b, id)), { focus, open: calmOpen(b) }));
  // Under the object: back to what matters when a calm one is in the center, and the fold once open.
  const back = focus && !worst(b, focus) && first && worst(b, first)
    ? `<button class="queue-back" data-qfocus="${first}"><span class="queue-back-dot"></span>${esc(b.t.needsYou(b.sys[first].title))}</button>` : '';
  setHTML(body.querySelector<HTMLElement>('.queue-foot')!, back + (calmFolds(b, queue) && calmOpen(b) ? calmToggle(b, queue.filter((id) => !worst(b, id)).length) : ''));
}
