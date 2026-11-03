// The disc as a window on a flat map: the tiles that cover it at a zoom,
// clipped to the circle, and a dot per thing at its latitude and longitude.
// For the scale the globe cannot show: a city's trams, a swarm over a field,
// the traffic of a bay. One SVG in the disc, the tiles as images from a tile
// server (OpenStreetMap's by default, which asks for its credit and light
// use), the text over it on a scrim. A tile a unit: the disc shows 192 by
// 192 pixels of the map at that zoom.

import type { GeoPlot } from './globe.ts';
import { esc } from './markup.ts';

export type MapSpec = {
  center: { lat: number; lon: number };
  zoom: number;                   // the tile zoom: 11 a city, 14 a district, 16 a field
  plots: GeoPlot[];
  tiles?: string;                 // a URL template with {z}, {x}, {y}; OpenStreetMap's by default
  attribution?: string;           // the credit the tiles ask for, written at the bottom of the disc
};
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const R = 96, TILE = 256;
// Web Mercator: a place as pixels of the world at a zoom.
const pixel = (lat: number, lon: number, zoom: number) => {
  const n = TILE * 2 ** zoom, φ = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n };
};

export function mapFace(m: MapSpec, aria?: string) {
  const zoom = Math.max(0, Math.min(19, Math.round(m.zoom))), tiles = m.tiles ?? OSM_TILES, credit = m.attribution ?? (m.tiles ? '' : OSM_ATTRIBUTION);
  const c = pixel(m.center.lat, m.center.lon, zoom), count = 2 ** zoom;
  const images: string[] = [];
  for (let ty = Math.floor((c.y - 100) / TILE); ty <= Math.floor((c.y + 100) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor((c.x - 100) / TILE); tx <= Math.floor((c.x + 100) / TILE); tx++) {
      const wx = ((tx % count) + count) % count;      // the world wraps east to west
      const url = tiles.replace('{z}', String(zoom)).replace('{x}', String(wx)).replace('{y}', String(ty));
      images.push(`<image class="map-tile" href="${esc(url)}" x="${(tx * TILE - c.x).toFixed(1)}" y="${(ty * TILE - c.y).toFixed(1)}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"></image>`);
    }
  }
  const dots = m.plots.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => {
    const q = pixel(p.lat, p.lon, zoom), x = q.x - c.x, y = q.y - c.y;
    if (Math.hypot(x, y) > R - 3) return '';
    const r = 2.5 + 3 * Math.min(1, Math.max(0, p.size ?? (p.tone ? 0.7 : 0.4)));
    const cls = `radar-dot map-dot${p.on === false ? ' is-off' : ''}${p.tone ? ` tone-${p.tone}` : ''}`;
    return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"${p.id ? ` data-plot="${esc(p.id)}"` : ''}><title>${esc(p.label)}</title></circle>`;
  }).join('');
  const id = `map-clip-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="face-map" viewBox="-100 -100 200 200" role="img" aria-label="${esc(`${aria ? `${aria}: ` : ''}${m.plots.length} on the map`)}" data-zoom="${zoom}">
    <defs><clipPath id="${id}"><circle r="${R}"></circle></clipPath></defs>
    <g clip-path="url(#${id})">${images.join('')}</g>${dots}${credit ? `<text class="map-credit" x="0" y="${R - 6}" text-anchor="middle">${esc(credit)}</text>` : ''}</svg>`;
}
