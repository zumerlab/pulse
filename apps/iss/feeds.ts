// The feeds around the telemetry, each a URL and a parser: where the station
// is and where it goes (wheretheiss.at, from its orbital elements), who is
// aboard and what is docked (Launch Library 2's station and expedition), and
// the launches coming up anywhere (Launch Library 2). All of them let a page
// read them. Launch Library allows fifteen questions an hour without a key,
// so the source asks it seldom.

export const WHERE_API = 'https://api.wheretheiss.at/v1/satellites/25544';
export const LL2 = 'https://ll.thespacedevs.com/2.3.0';
export const STATION_URL = `${LL2}/space_stations/4/`;
export const expeditionUrl = (id: number) => `${LL2}/expeditions/${id}/`;
// `detailed`: the only mode that lists a launch's webcasts (`vid_urls`); it costs the same question.
export const LAUNCHES_URL = `${LL2}/launches/upcoming/?limit=12&mode=detailed&hide_recent_previous=true`;
// NASA's live page: the station's own views (the HD Earth cameras, the interior) and its spacewalks.
export const NASA_LIVE = 'https://www.nasa.gov/live/';
// The track ahead: a point every eight minutes for an orbit and a half (wheretheiss takes ten at a time).
export const trackUrl = (now: number) => `${WHERE_API}/positions?timestamps=${Array.from({ length: 10 }, (_, i) => Math.round(now / 1000) + (i + 1) * 480).join(',')}&units=kilometers`;

// Where the station is: the point under it, its height and speed, and whether it is in the sun.
export type Position = { lat: number; lon: number; alt: number; speed: number; daylight: boolean; footprint: number; at: number };
export type TrackPoint = { lat: number; lon: number; at: number; daylight: boolean };
export type Crew = { name: string; role: string; agency: string; country: string; since: number };
export type Docked = { port: string; vehicle: string; since: number };
export type Station = { expedition: string; expeditionId: number | null; started: number; crew: Crew[]; docked: Docked[]; ports: string[]; aboard: number; spacewalk: { name: string; since: number } | null; at: number };
export type Launch = {
  id: string; name: string; rocket: string; mission: string; provider: string; status: string; statusId: number;
  net: number; windowEnd: number; precision: string; pad: string; place: string; lat: number | null; lon: number | null;
  orbit: string; toStation: boolean; webcast: string; webcastLive: boolean; info: string; probability: number | null; weather: string;
};

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : null);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const time = (x: unknown) => { const t = typeof x === 'string' ? Date.parse(x) : NaN; return Number.isFinite(t) ? t : 0; };
type J = Record<string, unknown>;
const obj = (x: unknown): J => (x && typeof x === 'object' ? (x as J) : {});
const arr = (x: unknown): J[] => (Array.isArray(x) ? x.map(obj) : []);

export function positionOf(j: unknown): Position | null {
  const p = obj(j), lat = num(p.latitude), lon = num(p.longitude);
  if (lat == null || lon == null) return null;
  return { lat, lon, alt: num(p.altitude) ?? 0, speed: num(p.velocity) ?? 0, daylight: p.visibility === 'daylight', footprint: num(p.footprint) ?? 0, at: (num(p.timestamp) ?? 0) * 1000 };
}
export const trackOf = (j: unknown): TrackPoint[] => (Array.isArray(j) ? j.map(positionOf).filter((p): p is Position => !!p).map((p) => ({ lat: p.lat, lon: p.lon, at: p.at, daylight: p.daylight })) : []);

// The station: its expedition, the ports and what holds them. The crew comes with the expedition, asked apart.
export function stationOf(j: unknown, now: number): Station | null {
  const s = obj(j);
  if (!s.name) return null;
  const exp = arr(s.active_expeditions)[0] ?? {};
  const docked: Docked[] = [], ports: string[] = [];
  for (const d of arr(s.docking_location)) {
    ports.push(str(d.name));
    const c = obj(d.currently_docked);
    if (!c.docking) continue;
    const chaser = obj(c.flight_vehicle_chaser), payload = obj(c.payload_flight_chaser);
    const vehicle = str(obj(chaser.spacecraft).name) || str(obj(payload.payload).name) || str(obj(c.space_station_chaser).name) || 'a vehicle';
    docked.push({ port: str(d.name), vehicle, since: time(c.docking) });
  }
  return { expedition: str(exp.name), expeditionId: num(exp.id), started: time(exp.start), crew: [], docked: docked.sort((a, b) => a.since - b.since), ports, aboard: num(s.onboard_crew) ?? 0, spacewalk: null, at: now };
}
// The expedition: its crew, and a spacewalk under way (one with a start and no end).
export function expeditionOf(j: unknown, now: number): Pick<Station, 'crew' | 'spacewalk'> {
  const e = obj(j);
  const crew = arr(e.crew).map((c): Crew => {
    const a = obj(c.astronaut);
    return { name: str(a.name), role: str(obj(c.role).role), agency: str(obj(a.agency).abbrev), country: str(arr(a.nationality)[0]?.alpha_2_code), since: time(a.last_flight) };
  }).filter((c) => c.name);
  const walk = arr(e.spacewalks).find((w) => time(w.start) && time(w.start) <= now && !w.end);
  return { crew, spacewalk: walk ? { name: str(walk.name), since: time(walk.start) } : null };
}

// A launch: what flies, when, from where, how sure, and whether it goes to the station.
export function launchesOf(j: unknown): Launch[] {
  return arr(obj(j).results).map((l): Launch => {
    const mission = obj(l.mission), pad = obj(l.pad), place = obj(pad.location), rocket = obj(obj(l.rocket).configuration), status = obj(l.status);
    const orbit = [str(obj(mission.orbit).abbrev), str(obj(mission.orbit).name)].find((x) => x && x !== 'N/A' && x !== 'Unknown') ?? '';
    const text = `${str(l.name)} ${str(mission.name)} ${str(mission.description)}`;
    // The webcast to open: one live now before the rest, then by the list's own priority (lower first).
    const webcast = arr(l.vid_urls).filter((v) => str(v.url)).sort((a, b) => Number(!!b.live) - Number(!!a.live) || (num(a.priority) ?? 99) - (num(b.priority) ?? 99))[0];
    return {
      id: str(l.id), name: str(l.name), rocket: str(rocket.full_name) || str(rocket.name), mission: str(mission.name), provider: str(obj(l.launch_service_provider).name),
      status: str(status.name), statusId: num(status.id) ?? 0, net: time(l.net), windowEnd: time(l.window_end), precision: str(obj(l.net_precision).name),
      pad: str(pad.name), place: str(place.name), lat: num(pad.latitude), lon: num(pad.longitude), orbit,
      toStation: /\b(ISS|International Space Station)\b/.test(text) || /\bCRS-\d|\bProgress MS|\bSoyuz MS|\bCrew-\d|\bAx-\d|\bCygnus|\bHTV/.test(text),
      webcast: str(webcast?.url), webcastLive: l.webcast_live === true || webcast?.live === true, info: str(l.url), probability: num(l.probability), weather: str(l.weather_concerns),
    };
  }).filter((l) => l.id && l.net);
}
