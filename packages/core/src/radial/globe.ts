// The disc as the Earth: an orthographic globe behind the face, turned to a
// center, with the coasts, a faint graticule and a dot per thing at its
// latitude and longitude. The map Pulse can have without leaving the circle:
// flights over the ocean, ships, the day's quakes, satellites. One SVG in
// the disc; the text sits over it. The coasts are coarse on purpose (a few
// hundred vertices read at 240 px); a host may hand finer ones.

import { LAND } from './land.ts';
import { esc } from './markup.ts';
import type { Tone } from './time.ts';

// A thing on the globe: where, what, and how it is. `size` scales the dot (0..1, a count, a magnitude);
// `course` (degrees clockwise from north) turns it into a mark pointing where it goes, on a street map.
export type GeoPlot = { lat: number; lon: number; label: string; id?: string; on?: boolean; tone?: Tone; size?: number; course?: number };
export type GlobeSpec = { center?: { lat: number; lon: number }; plots: GeoPlot[]; land?: [number, number][][] };

const R = 96, D = Math.PI / 180;

// The coasts: Natural Earth's land at 1:110m (public domain), in land.ts.
export { LAND } from './land.ts';

// A point on the globe seen from the center: where on the disc, and whether it faces us.
function project(lat: number, lon: number, c: { lat: number; lon: number }) {
  const φ = lat * D, λ = (lon - c.lon) * D, φ0 = c.lat * D;
  const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
  return { x: R * Math.cos(φ) * Math.sin(λ), y: -R * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)), front: cosc > 0.02 };
}
// A line over the globe: drawn where it faces us, lifted where it goes behind.
function path(points: [number, number][], c: { lat: number; lon: number }) {
  let d = '', pen = false;
  for (const [lon, lat] of points) {
    const p = project(lat, lon, c);
    if (!p.front) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function globe(g: GlobeSpec, aria?: string) {
  const plots = g.plots.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const c = g.center ?? (plots.length ? { lat: plots.reduce((a, p) => a + p.lat, 0) / plots.length, lon: plots.reduce((a, p) => a + p.lon, 0) / plots.length } : { lat: 20, lon: 0 });
  // The graticule: parallels every 30°, meridians every 30°, each sampled along its way.
  const grid: string[] = [];
  for (let lat = -60; lat <= 60; lat += 30) grid.push(path(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]), c));
  for (let lon = -180; lon < 180; lon += 30) grid.push(path(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]), c));
  const land = (g.land ?? LAND).map((ring) => path(ring, c)).filter(Boolean);
  const dots = plots.map((p) => {
    const q = project(p.lat, p.lon, c);
    if (!q.front) return '';
    const r = 2 + 3.5 * Math.min(1, Math.max(0, p.size ?? (p.tone ? 0.7 : 0.4)));
    const cls = `radar-dot${p.on === false ? ' is-off' : ''}${p.tone ? ` tone-${p.tone}` : ''}`;
    return `<circle class="${cls}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r.toFixed(1)}"${p.id ? ` data-plot="${esc(p.id)}"` : ''}><title>${esc(p.label)}</title></circle>`;
  }).join('');
  return `<svg class="face-globe" viewBox="-100 -100 200 200" role="img" aria-label="${esc(`${aria ? `${aria}: ` : ''}${plots.length} on the globe`)}">
    <circle class="globe-sea" r="${R}"></circle><path class="globe-grid" d="${grid.join('')}"></path><path class="globe-land" d="${land.join('')}"></path>${dots}</svg>`;
}
