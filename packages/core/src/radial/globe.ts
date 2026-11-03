// The disc as the Earth: an orthographic globe behind the face, turned to a
// center, with the coasts, a faint graticule and a dot per thing at its
// latitude and longitude. The map Pulse can have without leaving the circle:
// flights over the ocean, ships, the day's quakes, satellites. One SVG in
// the disc; the text sits over it. The coasts are coarse on purpose (a few
// hundred vertices read at 240 px); a host may hand finer ones.

import { esc } from './markup.ts';
import type { Tone } from './time.ts';

// A thing on the globe: where, what, and how it is. `size` scales the dot (0..1, a count, a magnitude).
export type GeoPlot = { lat: number; lon: number; label: string; id?: string; on?: boolean; tone?: Tone; size?: number };
export type GlobeSpec = { center?: { lat: number; lon: number }; plots: GeoPlot[]; land?: [number, number][][] };

const R = 96, D = Math.PI / 180;

// The coasts as rings of [longitude, latitude], coarse: the continents and the big islands.
export const LAND: [number, number][][] = [
  // North America
  [[-168, 66], [-165, 60], [-153, 57], [-140, 60], [-130, 55], [-125, 49], [-124, 40], [-117, 32], [-110, 23], [-105, 20], [-97, 16], [-92, 15], [-87, 13], [-83, 9], [-78, 8], [-77, 8.5], [-82, 10], [-84, 13], [-88, 16], [-87, 21], [-90, 21], [-97, 26], [-91, 29], [-84, 30], [-81, 25], [-80, 32], [-76, 35], [-70, 42], [-66, 45], [-60, 46], [-64, 49], [-56, 51], [-60, 55], [-64, 60], [-78, 62], [-85, 66], [-95, 68], [-110, 68], [-128, 70], [-141, 70], [-156, 71], [-165, 69], [-168, 66]],
  // Greenland
  [[-50, 60], [-43, 60], [-40, 65], [-22, 70], [-18, 76], [-30, 83], [-60, 82], [-70, 77], [-55, 70], [-50, 60]],
  // South America
  [[-77, 8], [-72, 11], [-62, 10], [-52, 4], [-50, 0], [-44, -2], [-35, -5], [-35, -8], [-39, -13], [-40, -20], [-48, -25], [-52, -32], [-57, -38], [-62, -39], [-65, -45], [-68, -50], [-66, -55], [-72, -53], [-75, -48], [-73, -40], [-71, -30], [-70, -18], [-76, -12], [-81, -5], [-80, 0], [-78, 5], [-77, 8]],
  // Africa
  [[-17, 15], [-17, 21], [-13, 27], [-6, 35], [10, 37], [20, 32], [32, 31], [34, 28], [43, 12], [51, 11], [48, 5], [41, -2], [40, -10], [35, -20], [33, -26], [28, -33], [20, -34], [18, -32], [15, -25], [12, -18], [12, -5], [9, 4], [3, 6], [-4, 5], [-8, 5], [-13, 8], [-17, 15]],
  // Eurasia
  [[-9, 37], [-9, 43], [-2, 43], [-5, 48], [-2, 49], [2, 51], [5, 53], [9, 54], [8, 57], [11, 59], [5, 62], [14, 68], [22, 70], [30, 70], [40, 66], [44, 69], [60, 69], [70, 73], [80, 72], [100, 77], [110, 74], [130, 71], [150, 70], [170, 69], [178, 64], [163, 61], [156, 52], [141, 53], [135, 44], [130, 42], [122, 40], [118, 38], [122, 32], [120, 26], [112, 21], [108, 12], [104, 10], [100, 13], [98, 8], [100, 2], [104, 1], [103, 5], [100, 10], [93, 19], [88, 22], [80, 15], [77, 8], [73, 20], [67, 24], [57, 25], [52, 24], [56, 27], [48, 30], [51, 26], [56, 25], [59, 22], [53, 17], [45, 13], [43, 17], [39, 21], [35, 28], [35, 33], [36, 37], [30, 37], [27, 38], [26, 40], [22, 38], [20, 40], [19, 42], [13, 44], [14, 41], [16, 38], [10, 44], [8, 44], [3, 43], [0, 40], [-2, 37], [-6, 36], [-9, 37]],
  // Australia
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [143, -39], [140, -35], [132, -32], [124, -33], [117, -35], [115, -30], [114, -22]],
  // Antarctica
  [[-60, -64], [-60, -75], [-30, -78], [0, -70], [30, -70], [70, -68], [100, -66], [140, -66], [170, -72], [-160, -78], [-120, -74], [-90, -73], [-60, -64]],
  // Britain, Iceland, Japan, Madagascar, Borneo, Sumatra, New Guinea, New Zealand, Cuba, the Philippines
  [[-5, 50], [1, 51], [2, 53], [-2, 56], [-3, 58], [-6, 57], [-5, 55], [-5, 50]],
  [[-22, 64], [-14, 65], [-16, 66], [-22, 66], [-22, 64]],
  [[130, 31], [135, 34], [140, 36], [141, 40], [141, 43], [145, 44], [142, 42], [139, 38], [131, 34], [130, 31]],
  [[44, -25], [50, -16], [49, -12], [44, -18], [44, -25]],
  [[109, 0], [117, 7], [119, 1], [115, -3], [110, -3], [109, 0]],
  [[95, 5], [106, -6], [104, -2], [98, 3], [95, 5]],
  [[131, -1], [141, -3], [150, -10], [142, -9], [135, -4], [131, -1]],
  [[173, -35], [178, -38], [174, -41], [166, -46], [170, -43], [173, -35]],
  [[-85, 22], [-74, 20], [-78, 22], [-85, 22]],
  [[120, 18], [123, 13], [126, 7], [122, 7], [119, 14], [120, 18]],
];

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
