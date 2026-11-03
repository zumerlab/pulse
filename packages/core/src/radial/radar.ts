// Things around a point, as a radar: range rings, the center is here (home,
// the boat, you), a dot per thing at its bearing and its range. Drones
// around home, ships around the vessel, the day's quakes around you. It
// sits behind the face's text; the text keeps the words, the radar the
// shape. One SVG in the disc.

import { esc } from './markup.ts';
import { polar } from './arc.ts';
import type { Tone } from './time.ts';

// A thing around the center: where (degrees clockwise from the top, and how
// far as a share of the radar, 0 at the center, 1 at the rim), what, and
// how it is (off: dim; a tone: the alert's color).
export type Plot = { bearing: number; range: number; label: string; id?: string; on?: boolean; tone?: Tone };

const R = 96;
export function radar(plots: Plot[], aria?: string) {
  const rings = [1 / 3, 2 / 3, 1].map((k) => `<circle class="radar-ring" r="${(R * k).toFixed(1)}"></circle>`).join('');
  const dots = plots.map((p) => {
    const [x, y] = polar(p.bearing, Math.min(1, Math.max(0, p.range)) * (R - 4));
    const cls = `radar-dot${p.on === false ? ' is-off' : ''}${p.tone ? ` tone-${p.tone}` : ''}`;
    return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.tone ? 4.5 : 3.5}"${p.id ? ` data-plot="${esc(p.id)}"` : ''}><title>${esc(p.label)}</title></circle>`;
  }).join('');
  return `<svg class="face-radar" viewBox="-100 -100 200 200" role="img" aria-label="${esc(`${aria ? `${aria}: ` : ''}${plots.length} around`)}">${rings}<circle class="radar-home" r="2.5"></circle>${dots}</svg>`;
}
