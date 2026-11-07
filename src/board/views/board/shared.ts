// What the four ways of looking at the board share: the order by urgency,
// the calm folded, the reading that represents a system, a ring's weight.

import { MINI_LANES } from '../../../radial/index.ts';
import type { Board } from '../../context.ts';
import { calmOpen } from '../../settings.ts';
import { order, uiOf, worst } from '../../state.ts';

// The weight of a system's ring on the board follows its level: what is fine a
// thin line, what calls heavier, the most serious the heaviest. Sizes never change.
export const boardLanes = (level: number) => MINI_LANES * ([0.6, 1, 1.35][level] ?? 1);

// Systems by urgency, the most serious first, the usual order within a level;
// a choice made by hand never moves them (the queue of the orbit, the grid,
// the list and the index beside the layers).
export function urgencyOrder(b: Board, ids: string[]) {
  return ids.map((id, i) => ({ id, i, w: worst(b, id) })).sort((x, y) => y.w - x.w || x.i - y.i).map((x) => x.id);
}
// While something calls and something is fine, the fine ones fold.
export const calmFolds = (b: Board, ids: string[]) => ids.some((id) => worst(b, id)) && ids.some((id) => !worst(b, id));
// The fold under the layers and the list: how many are calm, and the way to open or fold them.
export const calmToggle = (b: Board, n: number) => `<button class="calm-toggle" data-calm aria-expanded="${calmOpen(b)}">${calmOpen(b) ? b.t.foldCalm : `${b.t.calmN(n)} · ${b.t.showCalm}`}</button>`;

// The reading that represents a system: its front channel.
export function front(b: Board, id: string) {
  const key = order(b, id)[0], { ch, r } = b.readings[id].get(key)!;
  const a = r.alert && !uiOf(b, id).seen.has(key) ? r.alert : null;
  return { key, ch, r, a, big: a ? a.big : r.big, label: a ? a.label : r.label };
}
