// Records a moment of a city's roads for the demo, trimmed to the fields the
// parsers read, and the stills of the cameras within 600 m of an unplanned
// incident (with when each last changed). London: TfL's cameras, disruptions
// and corridors. The Bay Area: Caltrans' cameras (with their streams, which
// the demo then plays live) and signs, and the CHP's incidents from QuickMap,
// kept to the Bay Area. Writes demo/recording-<city>.json and
// public/demo/<city>/<camera>.jpg. From the repository root:
//   node apps/cameras/demo/scripts/record.mjs [bayarea|london]
// Powered by TfL Open Data; Caltrans and the CHP, through QuickMap.

import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERAS_URL, camerasOf, DISRUPTIONS_URL, disruptionsOf, metres, ROADS_URL, unplanned } from '../../feeds.ts';
import { BAY, CA_CAMERAS_URL, CA_SIGNS_URL, caCamerasOf, chpOf } from '../../feeds-ca.ts';

const here = dirname(fileURLToPath(import.meta.url)), app = join(here, '..', '..');
const get = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const city = process.argv[2] === 'london' ? 'london' : 'bayarea';
const now = Date.now();
let recording, parsed, incidents;
if (city === 'london') {
  const [cams, dis, roads] = await Promise.all([get(CAMERAS_URL), get(DISRUPTIONS_URL), get(ROADS_URL)]);
  const cameras = cams.map((c) => ({ ...pick(c, ['id', 'commonName', 'lat', 'lon']), additionalProperties: c.additionalProperties.filter((p) => ['available', 'imageUrl', 'videoUrl', 'view'].includes(p.key)).map((p) => pick(p, ['key', 'value'])) }));
  const disruptions = dis.map((d) => pick(d, ['id', 'point', 'severity', 'category', 'subCategory', 'comments', 'currentUpdate', 'location', 'startDateTime', 'endDateTime', 'lastModifiedTime', 'hasClosures', 'corridorIds']));
  recording = { at: now, cameras, disruptions, roads: roads.map((r) => pick(r, ['id', 'displayName', 'statusSeverity', 'statusSeverityDescription'])) };
  parsed = camerasOf(cameras);
  incidents = disruptionsOf(disruptions).filter(unplanned);
} else {
  const [cams, signs, kml] = await Promise.all([get(CA_CAMERAS_URL), get(CA_SIGNS_URL), fetch('https://quickmap.dot.ca.gov/data/chp-only.kml').then((r) => r.text())]);
  // The CHP's placemarks in the Bay Area only (QuickMap's is statewide).
  const inBay = (p) => { const c = /<coordinates>\s*(-?[\d.]+),(-?[\d.]+)/.exec(p); return c && +c[2] >= BAY.south && +c[2] <= BAY.north && +c[1] >= BAY.west && +c[1] <= BAY.east; };
  const chp = `<kml><Document>${[...kml.matchAll(/<Placemark>[\s\S]*?<\/Placemark>/g)].map((m) => m[0]).filter(inBay).join('\n')}</Document></kml>`;
  const cameras = { data: cams.data.map(({ cctv: c }) => ({ cctv: { index: c.index, inService: c.inService, location: pick(c.location, ['locationName', 'nearbyPlace', 'latitude', 'longitude', 'direction']),
    imageData: { streamingVideoURL: c.imageData.streamingVideoURL, static: { currentImageURL: c.imageData.static.currentImageURL } } } })) };
  const cms = { data: signs.data.map(({ cms: c }) => ({ cms: { index: c.index, recordTimestamp: c.recordTimestamp, location: pick(c.location, ['locationName', 'nearbyPlace', 'latitude', 'longitude']), message: pick(c.message ?? {}, ['phase1', 'phase2']) } })) };
  recording = { at: now, cameras, signs: cms, chp };
  parsed = caCamerasOf(cameras);
  incidents = chpOf(chp).filter(unplanned);
}

// The cameras the app checks: the two nearest each unplanned incident within 600 m that are switched on, streaming ones first.
// A camera is dark (0) when its still does not answer or is Caltrans' "unavailable" card, or its stream answers with nothing.
const candidates = new Map();
for (const d of incidents) {
  parsed.map((c) => ({ c, m: metres(d.lat, d.lon, c.lat, c.lon) })).filter((x) => x.m <= 600 && x.c.available)
    .sort((a, b) => Number(!!b.c.stream) - Number(!!a.c.stream) || a.m - b.m).slice(0, 2).forEach((x) => candidates.set(x.c.id, x.c));
}
// And the streaming cameras nearest the worst incident (the Live channel's), the first five.
const SEV = ['Severe', 'Serious', 'Moderate', 'Minimal', 'No impact'], worst = [...incidents].sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity))[0];
if (worst) parsed.filter((c) => c.available && c.stream).sort((a, b) => metres(worst.lat, worst.lon, a.lat, a.lon) - metres(worst.lat, worst.lon, b.lat, b.lon)).slice(0, 5).forEach((c) => candidates.set(c.id, c));
// TfL's switched-off cameras near an incident too: the app shows them as off, so their stills are kept.
for (const d of incidents) {
  const off = parsed.map((c) => ({ c, m: metres(d.lat, d.lon, c.lat, c.lon) })).filter((x) => x.m <= 600 && !x.c.available).sort((a, b) => a.m - b.m)[0];
  if (off && ![...candidates.values()].some((c) => metres(d.lat, d.lon, c.lat, c.lon) <= 600)) candidates.set(off.c.id, off.c);
}
const dir = join(app, 'public', 'demo', city);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const stills = {};
for (const c of candidates.values()) {
  const r = await fetch(c.image).catch(() => null);
  if (!r?.ok) { stills[c.id] = 0; continue; }
  const bytes = Buffer.from(await r.arrayBuffer());
  const streams = !c.stream || (await fetch(c.stream).then((x) => x.ok, () => false));
  if ((c.id.startsWith('ca:') && bytes.length < 16_000) || !streams) { stills[c.id] = 0; continue; }
  const file = c.image.split('/').pop();
  writeFileSync(join(dir, file), bytes);
  stills[c.id] = { file, modified: Date.parse(r.headers.get('last-modified') ?? '') || 0 };
}
recording.stills = stills;
writeFileSync(join(app, 'demo', `recording-${city}.json`), `${JSON.stringify(recording)}\n`);
console.log(`${city}: ${parsed.length} cameras (${parsed.filter((c) => c.stream).length} streaming), ${incidents.length} unplanned incidents, ${Object.values(stills).filter(Boolean).length} stills, ${Object.values(stills).filter((x) => !x).length} dark`);
