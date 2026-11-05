// The San Francisco Bay Area's freeways, each feed a URL and a parser into the
// same shapes as London's: Caltrans District 4's cameras (a still every few
// minutes and, for about a quarter of them, a live stream, HLS), the incidents
// the California Highway Patrol is working (its CAD feed as Caltrans QuickMap
// publishes it, statewide; kept to the Bay Area here) and what the changeable
// message signs over the freeways say. Caltrans lets a page read its feeds;
// QuickMap does not, so the dev server asks it (`vite.config.ts`, /net/chp/).
// Only traffic: the CHP's other calls (a missing person's alert) are left out,
// and so are its officers' notes; an incident is its kind, its place and its time.

import type { Camera, Disruption } from './feeds.ts';

export const CA_CAMERAS_URL = 'https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json';
export const CA_SIGNS_URL = 'https://cwwp2.dot.ca.gov/data/d4/cms/cmsStatusD04.json';
export const CHP_URL = '/net/chp/data/chp-only.kml';
// District 4, roughly: from Gilroy to Cloverdale, from the coast to the Delta, short of Sacramento and Stockton.
export const BAY = { south: 36.9, north: 38.9, west: -123.6, east: -121.55 };
export const inBay = (lat: number, lon: number) => lat >= BAY.south && lat <= BAY.north && lon >= BAY.west && lon <= BAY.east;

export type Sign = { id: string; name: string; place: string; lat: number; lon: number; lines: string[]; at: number };

type J = Record<string, unknown>;
const obj = (x: unknown): J => (x && typeof x === 'object' ? (x as J) : {});
const arr = (x: unknown): J[] => (Array.isArray(x) ? x.map(obj) : []);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const coord = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n !== 0 ? n : null; };

// "TV102 -- I-580 : West of SR-24" → "I-580 west of SR-24".
const cameraName = (s: string) => s.replace(/^TV\w*\s*-+\s*/i, '').replace(/\s*:\s*/, ' ').replace(/\s+/g, ' ').trim();
export function caCamerasOf(j: unknown): Camera[] {
  return arr(obj(j).data).map((x): Camera | null => {
    const c = obj(x.cctv), loc = obj(c.location), img = obj(c.imageData), still = obj(img.static);
    const lat = coord(loc.latitude), lon = coord(loc.longitude), image = str(still.currentImageURL);
    if (lat == null || lon == null || !image) return null;
    return { id: `ca:${str(c.index)}`, name: cameraName(str(loc.locationName)) || str(loc.nearbyPlace), lat, lon, available: c.inService === 'true', image, video: '',
      view: str(loc.direction), stream: str(img.streamingVideoURL) || undefined };
  }).filter((c): c is Camera => !!c);
}

// A sign's message, its three lines of each phase, blank lines out.
export function signsOf(j: unknown): Sign[] {
  return arr(obj(j).data).map((x) => {
    const c = obj(x.cms), loc = obj(c.location), m = obj(c.message), ts = obj(c.recordTimestamp);
    const lines = [obj(m.phase1), obj(m.phase2)].flatMap((p, i) => [1, 2, 3].map((n) => str(p[`phase${i + 1}Line${n}`]).replace(/\s+/g, ' ').trim())).filter(Boolean);
    const lat = coord(loc.latitude), lon = coord(loc.longitude);
    if (lat == null || lon == null) return null;
    return { id: `sign:${str(c.index)}`, name: str(loc.locationName).replace(/^CM\s*\d+\s*-\s*/i, '').trim(), place: str(loc.nearbyPlace), lat, lon, lines: [...new Set(lines)],
      at: Date.parse(`${str(ts.recordDate)}T${str(ts.recordTime)}-08:00`) || 0 };
  }).filter((s): s is Sign => !!s);
}
// A sign that tells of something happening now (a crash, a stall, lanes blocked), not of travel times, a campaign or a closure on the calendar.
export const signCalls = (s: Sign) => {
  const text = s.lines.join(' ');
  return /\b(CRASH|COLLISION|ACCIDENT|INCIDENT|STALL(ED)?|BLOCKED|FIRE|SIGALERT|DEBRIS)\b/.test(text) && !/MOVE OVER|SLOW DOWN FOR|REPORT|CALL 911|\b(MON|TUE|WED|THU|FRI|SAT|SUN|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/.test(text);
};

// The CHP's codes as words, with TfL's categories and severities so the model reads both alike.
// Each: its category, its severity, the word for the face and what more it says.
const CODES: [RegExp, string, string, string, string][] = [
  [/^1179\b/, 'Collisions', 'Serious', 'Collision', 'ambulance on its way'],
  [/^1180\b/, 'Collisions', 'Serious', 'Collision', 'major injuries'],
  [/^1181\b/, 'Collisions', 'Moderate', 'Collision', 'minor injuries'],
  [/^1183\b/, 'Collisions', 'Moderate', 'Collision', 'injuries unknown'],
  [/^1182\b/, 'Collisions', 'Minimal', 'Collision', 'no injuries'],
  [/^20001\b/, 'Collisions', 'Moderate', 'Hit and run', 'with injuries'],
  [/^20002\b/, 'Collisions', 'Minimal', 'Hit and run', 'no injuries'],
  [/^FIRE\b/i, 'Hazards', 'Moderate', 'Fire', 'reported'],
  [/^CLOSURE\b/i, 'Hazards', 'Moderate', 'Road closed', 'closed by the CHP'],
  [/^1125A\b/, 'Hazards', 'Minimal', 'Animal', 'on the road'],
  [/^ANIMAL\b/i, 'Hazards', 'Minimal', 'Animal', 'on the road'],
  [/^1125\b/, 'Hazards', 'Minimal', 'Hazard', 'on the road'],
  [/^1013\b/, 'Network delays', 'Minimal', 'Conditions', 'road or weather'],
  [/^(MZP|CZP|ESCORT)\b/i, 'Works', 'Minimal', 'Works', 'assisting the crews'],
];
// "Nov 5 2026 1:09PM", Pacific time.
const pacific = (s: string) => {
  const m = /^(\w{3}) (\d{1,2}) (\d{4}) (\d{1,2}):(\d{2})(AM|PM)$/.exec(s.trim());
  if (!m) return 0;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
  const h = (Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0), guess = Date.UTC(Number(m[3]), month, Number(m[2]), h, Number(m[5]));
  // The offset of Los Angeles on that day: what its clock says at the guess, against the guess.
  const there = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime();
  const here = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return guess + (here - there);
};
const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// The CHP's incidents from QuickMap's KML: a placemark each, its title the code and its words, its first line the time and the place.
export function chpOf(kml: string): Disruption[] {
  const out: Disruption[] = [];
  for (const [, p] of kml.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
    const id = /CHP Incident (\w+)/.exec(p)?.[1], title = unescape(/iw-title">([^<]*)/.exec(p)?.[1] ?? '');
    const c = /<coordinates>\s*(-?[\d.]+),(-?[\d.]+)/.exec(p);
    if (!id || !title || !c) continue;
    const lon = Number(c[1]), lat = Number(c[2]);
    if (!inBay(lat, lon)) continue;
    const code = CODES.find(([re]) => re.test(title));
    if (!code) continue;                                   // not traffic: left out
    const line = /iw-text">([^<]*)<br>\s*([^<]*)<\/p>/.exec(p);
    const at = pacific(unescape(line?.[1] ?? '')), place = unescape(line?.[2] ?? '');
    out.push({ id: `chp:${id}`, category: code[1], subCategory: code[3], severity: code[2], comments: place, update: code[4], location: place,
      lat, lon, start: at, end: 0, modified: at, closure: /full-closure/.test(p) || code[3] === 'Road closed', corridors: [] });
  }
  return out;
}
