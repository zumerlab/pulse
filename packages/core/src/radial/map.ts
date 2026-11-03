// The disc as a window on a flat map: the tiles that cover it at a zoom,
// clipped to the circle, and a dot per thing at its latitude and longitude.
// For the scale the globe cannot show: a city's trams, a swarm over a field,
// the traffic of a bay. One SVG in the disc, the tiles as images from a tile
// server (OpenStreetMap's by default, which asks for its credit and light
// use), the text over it on a scrim. A tile a unit: the disc shows 192 by
// 192 pixels of the map at that zoom. In a detail the same window is bigger
// (`radius`), at the viewer's zoom, and live: `turnMap` moves it in place and
// `mapControls` zooms it.

import { t } from '../i18n.ts';
import type { GeoPlot } from './globe.ts';
import { esc } from './markup.ts';

export type MapSpec = {
  center: { lat: number; lon: number };
  zoom: number;                   // the tile zoom: 11 a city, 14 a district, 16 a field
  plots: GeoPlot[];
  tiles?: string;                 // a URL template with {z}, {x}, {y}; OpenStreetMap's by default
  attribution?: string;           // the credit the tiles ask for, written at the bottom of the disc
};
// How a map is drawn: its radius in pixels of the map (96 in a face), the zoom
// when the viewer chose one, and the SVG's class.
export type MapOptions = { radius?: number; zoom?: number; cls?: string };
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const MAP_ZOOM_MIN = 2, MAP_ZOOM_MAX = 18;

const TILE = 256;
// Web Mercator: a place as pixels of the world at a zoom.
const pixel = (lat: number, lon: number, zoom: number) => {
  const n = TILE * 2 ** zoom, φ = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n };
};

// What a window shows: the tiles that cover it (each by its z/x/y, placed from
// the center), the dots inside the circle, the credit.
function windowOf(m: MapSpec, o: MapOptions) {
  const R = o.radius ?? 96, H = R + 4;
  const zoom = Math.max(0, Math.min(19, Math.round(o.zoom ?? m.zoom))), template = m.tiles ?? OSM_TILES;
  const c = pixel(m.center.lat, m.center.lon, zoom), count = 2 ** zoom, world = count * TILE;
  const tiles: { key: string; url: string; x: string; y: string }[] = [];
  for (let ty = Math.floor((c.y - H) / TILE); ty <= Math.floor((c.y + H) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor((c.x - H) / TILE); tx <= Math.floor((c.x + H) / TILE); tx++) {
      const wx = ((tx % count) + count) % count;      // the world wraps east to west
      tiles.push({ key: `${zoom}/${tx}/${ty}`, url: template.replace('{z}', String(zoom)).replace('{x}', String(wx)).replace('{y}', String(ty)),
        x: (tx * TILE - c.x).toFixed(1), y: (ty * TILE - c.y).toFixed(1) });
    }
  }
  const dots = m.plots.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => {
    // The dots wrap as the tiles do: a thing just across the antimeridian is next to the center, not a world away.
    const q = pixel(p.lat, p.lon, zoom), x = ((q.x - c.x + world * 1.5) % world) - world / 2, y = q.y - c.y;
    if (Math.hypot(x, y) > R - 3) return '';
    const r = 2.5 + 3 * Math.min(1, Math.max(0, p.size ?? (p.tone ? 0.7 : 0.4)));
    const cls = `radar-dot map-dot${p.on === false ? ' is-off' : ''}${p.tone ? ` tone-${p.tone}` : ''}`;
    return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"${p.id ? ` data-plot="${esc(p.id)}"` : ''}><title>${esc(p.label)}</title></circle>`;
  }).join('');
  return { R, H, zoom, tiles, dots, credit: m.attribution ?? (m.tiles ? '' : OSM_ATTRIBUTION) };
}
const tileOf = (x: { key: string; url: string; x: string; y: string }) =>
  `<image class="map-tile" data-tile="${x.key}" href="${esc(x.url)}" x="${x.x}" y="${x.y}" width="${TILE}" height="${TILE}" preserveAspectRatio="none"></image>`;
const ariaOf = (m: MapSpec, aria?: string) => `${aria ? `${aria}: ` : ''}${m.plots.length} on the map`;

export function mapFace(m: MapSpec, aria?: string, o: MapOptions = {}) {
  const w = windowOf(m, o), id = `map-clip-${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="${o.cls ?? 'face-map'}" viewBox="${-w.H} ${-w.H} ${2 * w.H} ${2 * w.H}" role="img" aria-label="${esc(ariaOf(m, aria))}" data-zoom="${w.zoom}">
    <defs><clipPath id="${id}"><circle r="${w.R}"></circle></clipPath></defs>
    <g class="map-tiles" clip-path="url(#${id})">${w.tiles.map(tileOf).join('')}</g><g class="map-dots">${w.dots}</g>${
    w.credit ? `<text class="map-credit" x="0" y="${w.R - 6}" text-anchor="middle">${esc(w.credit)}</text>` : ''}</svg>`;
}

// The map moved in place: the tiles it keeps stay (no flicker, no new
// request), the ones it needs join, the rest go; the dots are drawn again.
export function turnMap(svg: SVGSVGElement, m: MapSpec, o: MapOptions = {}) {
  const w = windowOf(m, o), g = svg.querySelector('.map-tiles')!;
  const have = new Map([...g.querySelectorAll<SVGImageElement>('image[data-tile]')].map((el) => [el.dataset.tile!, el]));
  for (const x of w.tiles) {
    const el = have.get(x.key);
    if (el) { el.setAttribute('x', x.x); el.setAttribute('y', x.y); have.delete(x.key); }
    else g.insertAdjacentHTML('beforeend', tileOf(x));
  }
  for (const el of have.values()) el.remove();
  svg.querySelector('.map-dots')!.innerHTML = w.dots;
  svg.dataset.zoom = String(w.zoom);
}

// The map big, in a detail: the window (it keeps the pinch and the wheel,
// `data-zooms`), and a plus and a minus on its edge.
export function mapDetail(m: MapSpec, name: string, o: MapOptions) {
  return `<figure class="detail-map">
    <div class="map-frame" data-zooms tabindex="0" aria-label="${esc(t.mapZoomHint(name))}">${mapFace(m, name, { ...o, cls: 'map-big' })}</div>
    <figcaption><button class="map-zoom" type="button" data-map-zoom="1" aria-label="${esc(t.zoomInMap)}">+</button>
      <button class="map-zoom" type="button" data-map-zoom="-1" aria-label="${esc(t.zoomOutMap)}">−</button></figcaption></figure>`;
}

// Zooming a detail's map: the wheel and the trackpad's pinch over it, two
// fingers spreading or closing on it (Zumly never sees them: they are its
// pinch back), the buttons, and + and − on the focused map. `step` takes a
// zoom in (1) or out (−1). Returns the cleanup.
export function mapControls(root: HTMLElement, step: (by: 1 | -1) => void) {
  const inMap = (target: EventTarget | null) => !!(target as Element | null)?.closest?.('[data-zooms]');
  let acc = 0, until = 0;
  const onWheel = (e: WheelEvent) => {
    if (!inMap(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() < until) return;
    acc += e.deltaY * (e.ctrlKey ? 4 : 1);   // a pinch comes in small steps
    if (Math.abs(acc) < 60) return;
    step(acc < 0 ? 1 : -1);
    acc = 0;
    until = Date.now() + 200;
  };
  const fingers = new Map<number, { x: number; y: number }>();
  let base = 0;
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !inMap(e.target)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) base = spread();
  };
  const onMove = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size !== 2 || !base) return;
    const ratio = spread() / base;
    if (ratio > 1.4 || ratio < 0.7) { step(ratio > 1 ? 1 : -1); base = spread(); }
  };
  const onUp = (e: PointerEvent) => { fingers.delete(e.pointerId); if (fingers.size < 2) base = 0; };
  const keep = (e: TouchEvent) => { if (inMap(e.target)) e.stopPropagation(); };
  const onClick = (e: MouseEvent) => {
    const by = (e.target as Element).closest<HTMLElement>('[data-map-zoom]')?.dataset.mapZoom;
    if (by) step(by === '1' ? 1 : -1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!inMap(e.target)) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); step(1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); step(-1); }
  };
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  for (const type of ['touchstart', 'touchmove', 'touchend'] as const) root.addEventListener(type, keep, { passive: true });
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerup', onUp);
    root.removeEventListener('pointercancel', onUp);
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const) root.removeEventListener(type, keep);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
  };
}
