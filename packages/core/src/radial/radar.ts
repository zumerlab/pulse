// Things around a point, as a radar: range rings, the center is here (home,
// the boat, you), a dot per thing at its bearing and its range. Drones
// around home, ships around the vessel, the day's quakes around you. It
// sits behind the face's text; the text keeps the words, the radar the
// shape. One SVG in the disc.
//
// A thing that moves can say where it goes (`course`): it is drawn as a
// pointed mark turned that way, with a line ahead of it as long as the way
// it makes in the time the host chose (`vector`: six minutes of a ship).
// The center moves too when the radar says so (a boat under way), and the
// rings can say how far they are ("1 nm"). Every mark is keyed by its thing,
// so a repaint moves it (it glides, see the CSS) instead of drawing it again.

import { esc } from './markup.ts';
import { polar } from './arc.ts';
import type { Tone } from './time.ts';

// A thing around the center: where (degrees clockwise from the top, and how
// far as a share of the radar, 0 at the center, 1 at the rim), what, and
// how it is (off: dim; a tone: the alert's color); where it goes, and how
// far ahead (a share of the radar), when it moves.
export type Plot = { bearing: number; range: number; label: string; id?: string; on?: boolean; tone?: Tone; course?: number; vector?: number };
// How a radar reads: its rings, each at a share of the radius with what it
// measures ("1 nm"), and the center's own course and vector when it moves.
export type RadarSpec = { rings?: { at: number; label: string }[]; course?: number; vector?: number };

const R = 96;
// A pointed mark: the tip ahead, a notch behind, turned to its course; the vector goes out from the tip.
const SHAPE = 'M0 -6.5 L4.6 5 L0 2.4 L-4.6 5 Z';
export function mark(cls: string, x: number, y: number, course: number, vector: number | undefined, id?: string, label?: string, scale = 1) {
  const len = vector ? Math.max(0, Math.min(1.2, vector)) * (R - 4) : 0;
  return `<g class="radar-mark ${cls}"${id ? ` data-plot="${esc(id)}"` : ''} style="transform:translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${course.toFixed(0)}deg)${scale !== 1 ? ` scale(${scale.toFixed(2)})` : ''}">${
    label ? `<title>${esc(label)}</title>` : ''}${len > 7 ? `<line class="radar-vector" x1="0" y1="-7" x2="0" y2="${(-len).toFixed(1)}"></line>` : ''}<path d="${SHAPE}"></path></g>`;
}

export function radar(plots: Plot[], aria?: string, spec: RadarSpec = {}) {
  const named = spec.rings ?? [1 / 3, 2 / 3, 1].map((at) => ({ at, label: '' }));
  const rings = named.map(({ at, label }) => {
    const r = R * Math.min(1, Math.max(0.05, at)), [lx, ly] = polar(38, r);
    return `<circle class="radar-ring" r="${r.toFixed(1)}"></circle>${label ? `<text class="radar-range" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(label)}</text>` : ''}`;
  }).join('');
  const home = spec.course != null ? mark('radar-self', 0, 0, spec.course, spec.vector) : '<circle class="radar-home" r="2.5"></circle>';
  const dots = plots.map((p) => {
    const [x, y] = polar(p.bearing, Math.min(1, Math.max(0, p.range)) * (R - 4));
    const tone = `${p.on === false ? ' is-off' : ''}${p.tone ? ` tone-${p.tone}` : ''}`;
    if (p.course != null) return mark(`radar-dot${tone}`, x, y, p.course, p.vector, p.id, p.label);
    return `<circle class="radar-dot${tone}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.tone ? 4.5 : 3.5}"${p.id ? ` data-plot="${esc(p.id)}"` : ''}><title>${esc(p.label)}</title></circle>`;
  }).join('');
  return `<svg class="face-radar" viewBox="-100 -100 200 200" role="img" aria-label="${esc(`${aria ? `${aria}: ` : ''}${plots.length} around`)}">${rings}${home}${dots}</svg>`;
}
