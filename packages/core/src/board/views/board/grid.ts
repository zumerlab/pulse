// Grid: a mini ring per system, what calls first, the calm folded into one
// quiet tile while something calls. Reads fast.

import { esc, icon } from '../../../radial/index.ts';
import type { Board } from '../../context.ts';
import { ring, setHTML, visualFor } from '../../draw.ts';
import { calmOpen } from '../../settings.ts';
import { order, uiOf, worst } from '../../state.ts';
import { boardLanes, calmFolds, urgencyOrder } from './shared.ts';

function tile(b: Board, id: string) {
  const sys = b.sys[id], key = order(b, id)[0];
  if (!key) return '';
  const { ch, r } = b.readings[id].get(key)!;
  const level = worst(b, id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${b.t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(b, key, r, boardLanes(level), false, !r.alert)}</span></span>${visualFor(id, key)}
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !uiOf(b, id).seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

// The calm, folded: one quiet tile with a dot for each (or, open, the button that folds them again).
function calmTile(b: Board, n: number) {
  const { t } = b;
  return calmOpen(b)
    ? `<button class="tile calm-fold is-open" data-calm aria-expanded="true"><span class="calm-ring"></span><span class="tile-title">${t.foldCalm}</span></button>`
    : `<button class="tile calm-fold" data-calm aria-expanded="false" aria-label="${esc(t.showTheCalm(n))}"><span class="calm-ring">${
      '<i></i>'.repeat(Math.min(n, 8))}</span><span class="tile-title">${t.calmN(n)}</span></button>`;
}

export function paintGrid(b: Board, body: HTMLElement, ids: string[]) {
  const queue = urgencyOrder(b, b.ids.filter((id) => ids.includes(id)));
  const calm = queue.filter((id) => !worst(b, id));
  const folds = calmFolds(b, queue);
  setHTML(body, `<div class="tiles">${(folds && !calmOpen(b) ? queue.filter((id) => worst(b, id)) : queue).map((id) => tile(b, id)).join('')}${
    folds ? calmTile(b, calm.length) : ''}</div>`);
}
