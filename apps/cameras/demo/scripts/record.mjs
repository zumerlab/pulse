// Records a moment of London's roads for the demo: TfL's cameras, disruptions
// and corridors, trimmed to the fields the parsers read, and the stills of the
// cameras within 600 m of an unplanned incident (with when each last
// changed). Writes demo/recording.json and public/demo/<camera>.jpg. From the
// repository root:
//   node apps/cameras/demo/scripts/record.mjs
// Powered by TfL Open Data; the stills are TfL's JamCams.

import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERAS_URL, camerasOf, DISRUPTIONS_URL, disruptionsOf, metres, ROADS_URL, unplanned } from '../../feeds.ts';

const here = dirname(fileURLToPath(import.meta.url)), app = join(here, '..', '..');
const get = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const now = Date.now();
const [cams, dis, roads] = await Promise.all([get(CAMERAS_URL), get(DISRUPTIONS_URL), get(ROADS_URL)]);
const cameras = cams.map((c) => ({ ...pick(c, ['id', 'commonName', 'lat', 'lon']), additionalProperties: c.additionalProperties.filter((p) => ['available', 'imageUrl', 'videoUrl', 'view'].includes(p.key)).map((p) => pick(p, ['key', 'value'])) }));
const disruptions = dis.map((d) => pick(d, ['id', 'point', 'severity', 'category', 'subCategory', 'comments', 'currentUpdate', 'location', 'startDateTime', 'endDateTime', 'lastModifiedTime', 'hasClosures', 'corridorIds']));

// The cameras that watch an unplanned incident, as the app picks them: the nearest working one within 600 m, else the nearest that is off.
const parsed = camerasOf(cameras), watched = new Map();
for (const d of disruptionsOf(disruptions).filter(unplanned)) {
  const near = parsed.map((c) => ({ c, m: metres(d.lat, d.lon, c.lat, c.lon) })).filter((x) => x.m <= 600).sort((a, b) => Number(b.c.available) - Number(a.c.available) || a.m - b.m)[0];
  if (near) watched.set(near.c.id, near.c);
}
const dir = join(app, 'public', 'demo');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const stills = {};
for (const c of watched.values()) {
  const r = await fetch(c.image);
  if (!r.ok) { stills[c.id] = 0; continue; }
  const file = c.image.split('/').pop();
  writeFileSync(join(dir, file), Buffer.from(await r.arrayBuffer()));
  stills[c.id] = { file, modified: Date.parse(r.headers.get('last-modified') ?? '') || 0 };
}
writeFileSync(join(app, 'demo', 'recording.json'), `${JSON.stringify({ at: now, cameras, disruptions, roads: roads.map((r) => pick(r, ['id', 'displayName', 'statusSeverity', 'statusSeverityDescription'])), stills })}\n`);
console.log(`${cameras.length} cameras, ${disruptions.length} disruptions (${disruptionsOf(disruptions).filter(unplanned).length} unplanned), ${roads.length} corridors, ${Object.keys(stills).length} stills`);
