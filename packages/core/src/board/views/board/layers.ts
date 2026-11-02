// Layers: one object, one system per layer, the one calling the most in
// front. While something calls, only what calls is drawn and the calm wait
// under the object. The list beside it names them all, by urgency.

import { LANE, backLayer, esc, face, layerIndex } from '../../../radial/index.ts';
import { tune } from '../../../tune.ts';
import type { Board } from '../../context.ts';
import { ring, setHTML, visualFor } from '../../draw.ts';
import { calmOpen, layersShown } from '../../settings.ts';
import { worst } from '../../state.ts';
import { calmFolds, calmToggle, front, urgencyOrder } from './shared.ts';

// The labels of the layers behind, spread out so they do not overlap.
const LABEL_AT = [300, 30, 330, 60, 280, 80];

// In 3D, like the orbit: each layer one step further back and the pointer tilts the object.
export const layersStage = () => `<div class="stage board-stage" data-zoom="calm"><div class="obj"><div class="bigbang">
  <div class="gravity-spot depth outer-perspective"></div></div></div>
  <div class="layer-index-slot"></div><div class="strip board-strip"></div></div>`;

// One layer per system, all of them by default (the gear or the shell can
// cap it; the rest are named under the object, each a button). The growth
// per layer shrinks so the outermost always fits, and the spacing is even
// or bunched behind or in front (tune.layerEase): each layer gets a
// fractional depth, which Orbit turns into its distance and its size.
// `layers` keeps each system's element between paints.
export function paintLayers(b: Board, body: HTMLElement, all: string[], layers: Map<string, HTMLElement>) {
  const { t } = b;
  const depth = body.querySelector<HTMLElement>('.depth')!;
  // Folded, only what calls is drawn (and the one picked by hand); the calm
  // wait under the object behind one button.
  const folded = calmFolds(b, all) && !calmOpen(b);
  const shown = folded ? all.filter((id) => worst(b, id) || id === b.boardPick) : all;
  const n = Math.max(1, Math.min(shown.length, layersShown(b)));
  const ids = shown.slice(0, n), rest = all.filter((id) => !ids.includes(id));
  const grow = n > 1 ? Math.min(tune.layerGrow, 0.96 / (n - 1)) : tune.layerGrow;
  const ease = Math.pow(2, tune.layerEase * 1.5);
  depth.style.setProperty('--o-depth-grow', grow.toFixed(3));
  for (const [id, layer] of layers) if (!ids.includes(id)) { layer.remove(); layers.delete(id); }
  ids.forEach((id, i) => {
    let layer = layers.get(id);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'gravity-spot layer';
      layer.dataset.system = id;
      depth.append(layer);
      layers.set(id, layer);
    }
    const d = n > 1 ? (n - 1) * Math.pow(i / (n - 1), ease) : 0;
    const f = front(b, id), scale = 1 + grow * d, level = worst(b, id), title = b.sys[id].title;
    // Orbit redraws the arcs on any attribute change, even to the same value:
    // only what changed is written.
    if (layer.dataset.depth !== String(i)) layer.dataset.depth = String(i);
    const dz = d.toFixed(3);
    if (layer.style.getPropertyValue('--o-depth') !== dz) layer.style.setProperty('--o-depth', dz);
    // The halo is drawn before Orbit scales the layer: divided by that scale, it reads the same on every layer.
    const halo = (d * tune.layerBlur / (scale * (1 - d * tune.layerStep / 900))).toFixed(2);
    if (layer.style.getPropertyValue('--halo') !== halo) layer.style.setProperty('--halo', halo);
    if (layer.dataset.level !== String(level)) layer.dataset.level = String(level);
    if (layer.classList.contains('layer-front') !== (i === 0)) layer.classList.toggle('layer-front', i === 0);
    if (layer.classList.contains('is-alert') !== level > 0) layer.classList.toggle('is-alert', level > 0);
    const stroke = i === 0 ? 6 : tune.layerStroke;
    setHTML(layer, ring(b, f.key, f.r, stroke / scale / LANE, false, !level) + (i === 0
      ? face({ glyph: f.ch.glyph, name: title, big: f.big, label: f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`,
        to: `sys-${id}`, props: { system: id }, aria: t.open(title), extra: visualFor(id, f.key) })
      : backLayer({ text: `${title} · ${f.big}`, at: LABEL_AT[(i - 1) % LABEL_AT.length], grow: scale, stroke, hit: 8,
        pick: { attr: 'data-bpick', value: id, aria: t.bringToFront(title) } })));
  });
  const stage = body.querySelector<HTMLElement>('.board-stage')!;
  // Beside the object, the layers front to back, each a button; the ones past the cap hollow.
  setHTML(stage.querySelector<HTMLElement>('.layer-index-slot')!, layerIndex(urgencyOrder(b, b.ids.filter((id) => all.includes(id))).map((id) => ({
    id, title: b.sys[id].title, big: front(b, id).big, level: worst(b, id), off: !ids.includes(id), front: id === ids[0] })), 'data-bpick'));
  const zoom = ids.some((id) => worst(b, id)) ? 'alert' : 'calm';
  if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
  // Under the object: the systems past the cap, each a button that brings it to the front. No feed of changes.
  const calm = all.filter((id) => !worst(b, id)), capped = rest.filter((id) => worst(b, id) || !folded);
  setHTML(stage.querySelector<HTMLElement>('.board-strip')!, (capped.length ? `<span class="behind">${t.behind(capped.length)}: ${capped.map((id) =>
    `<button class="more" data-bpick="${id}" aria-label="${esc(t.bringToFront(b.sys[id].title))}">${b.sys[id].title}</button>`).join(', ')}</span>` : '')
    + (calmFolds(b, all) ? calmToggle(b, calm.length) : ''));
}
