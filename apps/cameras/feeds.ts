// London's roads from Transport for London's open data, each feed a URL and a
// parser: the JamCams (some 900 traffic cameras, each a still that changes
// every few minutes), the disruptions on the roads (works, breakdowns,
// collisions, fires) and the status of the main corridors. All of them let a
// page read them, the stills included, and their Last-Modified with them.
// Powered by TfL Open Data.

export const TFL = 'https://api.tfl.gov.uk';
export const CAMERAS_URL = `${TFL}/Place/Type/JamCam`;
export const DISRUPTIONS_URL = `${TFL}/Road/all/Disruption`;
export const ROADS_URL = `${TFL}/Road`;

// `video` is a recorded clip (TfL's ten seconds); `stream`, a live one (Caltrans' HLS).
export type Camera = { id: string; name: string; lat: number; lon: number; available: boolean; image: string; video: string; view: string; stream?: string };
export type Disruption = {
  id: string; category: string; subCategory: string; severity: string; comments: string; update: string; location: string;
  lat: number; lon: number; start: number; end: number; modified: number; closure: boolean; corridors: string[];
};
export type Road = { id: string; name: string; status: string; description: string };

type J = Record<string, unknown>;
const obj = (x: unknown): J => (x && typeof x === 'object' ? (x as J) : {});
const arr = (x: unknown): J[] => (Array.isArray(x) ? x.map(obj) : []);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const time = (x: unknown) => { const t = typeof x === 'string' ? Date.parse(x) : NaN; return Number.isFinite(t) ? t : 0; };

// A camera: where, which way it looks, whether TfL says it works, and its still.
export function camerasOf(j: unknown): Camera[] {
  return arr(j).map((c) => {
    const p = Object.fromEntries(arr(c.additionalProperties).map((x) => [str(x.key), str(x.value)]));
    const lat = num(c.lat), lon = num(c.lon);
    return lat == null || lon == null || !p.imageUrl ? null : { id: str(c.id), name: str(c.commonName), lat, lon, available: p.available === 'true', image: p.imageUrl, video: p.videoUrl ?? '', view: p.view ?? '' };
  }).filter((c): c is Camera => !!c && !!c.id);
}

// A disruption: what, how bad, where (its point is "[lon,lat]"), since and until when.
export function disruptionsOf(j: unknown): Disruption[] {
  return arr(j).map((d) => {
    let lat = NaN, lon = NaN;
    try { [lon, lat] = JSON.parse(str(d.point)) as number[]; } catch { /* no point */ }
    return {
      id: str(d.id), category: str(d.category), subCategory: str(d.subCategory), severity: str(d.severity),
      comments: str(d.comments).trim(), update: str(d.currentUpdate).trim(), location: str(d.location),
      lat, lon, start: time(d.startDateTime), end: time(d.endDateTime), modified: time(d.lastModifiedTime),
      closure: d.hasClosures === true, corridors: Array.isArray(d.corridorIds) ? d.corridorIds.map(String) : [],
    };
  }).filter((d) => d.id && Number.isFinite(d.lat) && Number.isFinite(d.lon));
}

export const roadsOf = (j: unknown): Road[] =>
  arr(j).map((r) => ({ id: str(r.id), name: str(r.displayName) || str(r.id), status: str(r.statusSeverity), description: str(r.statusSeverityDescription) })).filter((r) => r.id);

// What happened, against what was planned: works and events are on the calendar, the rest are news.
const PLANNED = new Set(['Works', 'Planned events', 'Special and planned events', 'Events']);
export const unplanned = (d: Disruption) => !PLANNED.has(d.category);
// The severities TfL gives, worst first.
export const SEVERITY = ['Severe', 'Serious', 'Moderate', 'Minimal', 'No impact'];
export const rank = (d: Disruption) => { const i = SEVERITY.indexOf(d.severity); return i < 0 ? SEVERITY.length : i; };
// Within a severity, what happened to people and the road before what broke: a fire before a breakdown, a breakdown before a faulty signal.
const KINDS = ['Collisions', 'Hazards', 'Traffic Incidents', 'Breakdowns', 'Network delays', 'Asset issues'];
export const kindOf = (d: Disruption) => { const i = KINDS.indexOf(d.category); return i < 0 ? KINDS.length : i; };

export const metres = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const D = Math.PI / 180, a = Math.sin((lat2 - lat1) * D / 2) ** 2 + Math.cos(lat1 * D) * Math.cos(lat2 * D) * Math.sin((lon2 - lon1) * D / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
