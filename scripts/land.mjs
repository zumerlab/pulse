// Natural Earth's 1:110m land (public domain, via the world-atlas package, TopoJSON) as rings of
// tenths of a degree, decimated to what a 240 px disc can show, written as a TypeScript module.
import { readFileSync, writeFileSync } from 'node:fs';
const topo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; }); });
const ring = (arcRefs) => arcRefs.flatMap((i) => { const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i]; return a; });
const rings = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const poly of polys) rings.push(ring(poly[0]));          // the outer ring only; lakes are not coasts a disc shows
}
const MIN = Number(process.argv[4] ?? 0.45);
let kept = 0, total = 0;
const out = rings.map((r) => {
  total += r.length;
  const o = [];
  for (const [lon, lat] of r) {
    const last = o[o.length - 1];
    if (!last || Math.hypot(lon - last[0], lat - last[1]) >= MIN) o.push([lon, lat]);
  }
  if (o.length >= 4) { const [a, b] = [o[0], o[o.length - 1]]; if (a[0] !== b[0] || a[1] !== b[1]) o.push(a); }
  kept += o.length;
  return o;
}).filter((r) => r.length >= 4);
const text = out.map((r) => `[${r.map(([lon, lat]) => `${Math.round(lon * 10)},${Math.round(lat * 10)}`).join(',')}]`).join(',\n  ');
writeFileSync(process.argv[3], `// The land of the Earth at 1:110,000,000, from Natural Earth (public domain) through the
// world-atlas package, as rings of [longitude, latitude] in tenths of a degree, flat: each
// ring is lon, lat, lon, lat… Decimated to what a disc of 240 px can show (points closer
// than ${MIN}° to the last kept are dropped); lakes are left out, a disc shows coasts.
// Regenerate with scripts/land.mjs; do not edit by hand.
const RAW: number[][] = [
  ${text},
];
export const LAND: [number, number][][] = RAW.map((r) => { const ring: [number, number][] = []; for (let i = 0; i < r.length; i += 2) ring.push([r[i] / 10, r[i + 1] / 10]); return ring; });
`);
console.log(`rings ${out.length}, points ${kept} of ${total}, bytes ${readFileSync(process.argv[3]).length}`);
