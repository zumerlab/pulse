import { listOf, num, type Alert, type GeoPlot, type Group, type MapSpec, type Plot, type Reading, type Seg } from '@zumer/pulse';
import type { Act, Aircraft, Fleet, SkySource } from './source.ts';
import { t } from './strings.ts';

// The sky read four ways. Emergencies: anyone squawking 7700, 7600 or 7500
// anywhere, on the globe, each a loud alert that opens on the network's map.
// Around a place: the traffic within the region on a radar, arrivals,
// departures, holds. Anomalies: what the stream alone can tell is odd, a fast
// descent low down, a signal lost in the air, low and slow far from any
// airport. The sky: OpenSky's count of the whole world, on the globe. On the
// groups axis, one object per aircraft of the region, by category.

export type Channel = { key: string; name: string; glyph: string; read: (s: SkySource) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  squawk: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  plane: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z',
  radar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12l6-6',
  down: 'M12 3v14 M12 17l-5-5 M12 17l5-5 M4 21h16',
  up: 'M12 21V7 M12 7l-5 5 M12 7l5 5 M4 3h16',
  hold: 'M12 3a9 9 0 1 0 9 9 M21 3v6h-6',
  descent: 'M3 6l7 7 3-3 8 8 M15 18h6v-6',
  lost: 'M2 9a15 15 0 0 1 20 0 M5 13a10 10 0 0 1 14 0 M8.5 16.5a5 5 0 0 1 7 0 M12 20h.01 M4 4l16 16',
  low: 'M3 18h18 M6 14l6-4 6 4 M12 10V4',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  speed: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  alt: 'M12 21V5 M12 5l-4 4 M12 5l4 4 M4 21h16',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const compass = (d: number) => t.compass[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
export const AC = 'ac:';
export const acId = (a: Aircraft) => AC + a.hex;
const got = (level: 1 | 2, big: string, label: string, why: string, acts: Act[] = [], verb = t.gotIt, key = label): Alert => ({ level, big, label, why, key, verb, acts });
const open = (s: SkySource, a: Aircraft): Act => ({ ids: [], kind: 'open', url: s.mapUrl(a.hex) });
const ft = (a: Aircraft) => (a.ground ? 'on the ground' : a.alt != null ? `${num(a.alt, 0)} ft` : 'altitude unknown');
// A rate with a real minus sign: "−5,200 ft/min".
const fpm = (rate: number) => `${rate < 0 ? '−' : '+'}${num(Math.abs(rate), 0)} ft/min`;
const where = (a: Aircraft) => (a.lat != null && a.lon != null ? `${num(Math.abs(a.lat), 1)}°${a.lat >= 0 ? 'N' : 'S'} ${num(Math.abs(a.lon), 1)}°${a.lon >= 0 ? 'E' : 'W'}` : 'position unknown');
const silent = (a: Aircraft, now = Date.now()) => (now - a.at) / 1000;
const airborne = (a: Aircraft) => !a.ground && a.alt != null && a.alt > 500;

// A few big airports, for "far from any airport"; a region's own are what matter and this covers the demo and the usual places.
export const AIRPORTS: [string, number, number][] = [
  ['EZE', -34.822, -58.536], ['AEP', -34.559, -58.416], ['MVD', -34.838, -56.031], ['COR', -31.324, -64.208], ['ROS', -32.904, -60.785], ['MDQ', -37.934, -57.573], ['BHI', -38.725, -62.169],
  ['GRU', -23.432, -46.469], ['GIG', -22.81, -43.251], ['SCL', -33.393, -70.786], ['LIM', -12.022, -77.114], ['BOG', 4.701, -74.147], ['MEX', 19.436, -99.072],
  ['JFK', 40.64, -73.779], ['ATL', 33.64, -84.428], ['ORD', 41.979, -87.905], ['LAX', 33.942, -118.408], ['DFW', 32.897, -97.038], ['MIA', 25.795, -80.287], ['YYZ', 43.677, -79.631],
  ['LHR', 51.47, -0.461], ['CDG', 49.01, 2.548], ['AMS', 52.31, 4.768], ['FRA', 50.037, 8.562], ['MAD', 40.472, -3.561], ['BCN', 41.297, 2.078], ['LIS', 38.774, -9.134], ['FCO', 41.8, 12.239], ['IST', 41.275, 28.752],
  ['DXB', 25.253, 55.365], ['DOH', 25.273, 51.608], ['JNB', -26.139, 28.246], ['CAI', 30.122, 31.406], ['DEL', 28.556, 77.1], ['BOM', 19.089, 72.868], ['SIN', 1.364, 103.991], ['HKG', 22.308, 113.918],
  ['PEK', 40.08, 116.585], ['PVG', 31.144, 121.808], ['HND', 35.549, 139.78], ['ICN', 37.46, 126.44], ['SYD', -33.946, 151.177], ['MEL', -37.673, 144.843], ['AKL', -37.008, 174.792],
];
export const distanceNm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) / 1.852;
};
const nearestAirportNm = (a: Aircraft) => (a.lat == null || a.lon == null ? null : Math.min(...AIRPORTS.map(([, lat, lon]) => distanceNm(a.lat!, a.lon!, lat, lon))));

// What the stream alone can tell is odd.
export const fastDescent = (a: Aircraft) => airborne(a) && a.rate != null && a.rate <= -4000 && a.alt! < 10_000;
export const lostSignal = (a: Aircraft, now = Date.now()) => airborne(a) && silent(a, now) > 60 && silent(a, now) < 600;
export const lowSlow = (a: Aircraft) => airborne(a) && a.alt! < 1500 && a.gs != null && a.gs < 120 && (nearestAirportNm(a) ?? 0) > 15;
// A hold: the track has turned more than three hundred degrees over the trail.
export const holding = (a: Aircraft) => {
  const tracks = a.trail.map((p) => p.track).filter((x): x is number => x != null);
  if (tracks.length < 4) return false;
  let turned = 0;
  for (let i = 1; i < tracks.length; i++) { let d = tracks[i] - tracks[i - 1]; if (d > 180) d -= 360; if (d < -180) d += 360; turned += d; }
  return Math.abs(turned) >= 300;
};
const oddness = (a: Aircraft): Plot['tone'] => (a.emergency || ['7700', '7500'].includes(a.squawk) ? 'critical' : fastDescent(a) || lostSignal(a) || lowSlow(a) || a.squawk === '7600' ? 'warn' : undefined);
const regional = (s: SkySource) => [...s.aircraft.values()].filter((a) => a.dst != null).sort((a, b) => a.dst! - b.dst!);
const line = (a: Aircraft) => `${a.flight}${a.type ? ` · ${a.type}` : ''} · ${ft(a)}${a.gs != null ? ` · ${num(a.gs, 0)} kn` : ''}`;
// An aircraft in a list or on a ring: tapping it opens its own object.
const seg = (s: SkySource, a: Aircraft, on: boolean, label = line(a)): Seg => ({ label, on, id: acId(a), act: open(s, a), to: acId(a) });
// The network whose map an aircraft opens on: "adsb.lol", "airplanes.live".
const site = (s: SkySource, a: Aircraft) => new URL(s.mapUrl(a.hex)).hostname.replace(/^globe\./, '');
// The aircraft on the street map with its trail, at the scale of its last three minutes: an airliner at cruise sees about a hundred kilometres, one taxiing sees the apron.
const mapOf = (a: Aircraft): MapSpec | undefined => {
  if (a.lat == null || a.lon == null) return undefined;
  const zoom = Math.max(7, Math.min(14, Math.round(Math.log2((135_000 * Math.cos((a.lat * Math.PI) / 180)) / Math.max(10, a.gs ?? 0)))));
  const trail = a.trail.map((p): GeoPlot => ({ lat: p.lat, lon: p.lon, label: `${a.flight} · ${p.alt != null ? `${num(p.alt, 0)} ft` : 'on the ground'}`, on: false, size: 0 }));
  return { center: { lat: a.lat, lon: a.lon }, zoom, plots: [...trail, { lat: a.lat, lon: a.lon, label: line(a), id: acId(a), size: 1, tone: oddness(a) }] };
};

export const emergencies: System = { id: 'emergencies', title: 'Emergencies', channels: [
  { key: 'squawks', name: 'Squawking', glyph: g.squawk, read: (s) => {
    const list = [...s.emergencies].map((hex) => s.aircraft.get(hex)).filter((a): a is Aircraft => !!a)
      .sort((a, b) => (a.squawk === '7700' || a.squawk === '7500' ? 0 : 1) - (b.squawk === '7700' || b.squawk === '7500' ? 0 : 1));
    const plots: GeoPlot[] = list.filter((a) => a.lat != null && a.lon != null).map((a) => ({ lat: a.lat!, lon: a.lon!, label: `${a.flight} · ${a.squawk}`, id: acId(a), size: 1, tone: a.squawk === '7600' ? 'warn' : 'critical' }));
    if (!list.length) return { kind: 'p', v: 0, ids: ['emergencies'], big: 'None', label: 'squawking 7700, 7600 or 7500 anywhere', globe: { center: { lat: s.region.lat, lon: s.region.lon }, plots: [] } };
    const worst = list[0], what = t.squawk[worst.squawk] ?? t.emergencies[worst.emergency] ?? worst.squawk;
    const segs = list.map((a) => seg(s, a, false, `${a.flight} · ${a.squawk} ${t.squawk[a.squawk] ?? ''} · ${ft(a)}`));
    return { kind: 's', segs, ids: ['emergencies', ...list.map(acId)], list: segs, big: `${list.length} squawking`, label: listOf(list.slice(0, 3).map((a) => `${a.flight} ${a.squawk}`)),
      globe: { center: { lat: worst.lat ?? 20, lon: worst.lon ?? 0 }, plots },
      alert: { level: worst.squawk === '7600' ? 1 : 2, big: worst.squawk, label: what, key: `squawk:${list.map((a) => a.hex).join(',')}`, fail: list.map((_, i) => i),
        why: t.squawkWhy(worst.flight, worst.type, what, ft(worst), where(worst)) + (list.length > 1 ? ` · ${list.length - 1} more` : ''), verb: t.seeOnMap, acts: [open(s, worst)] } };
  } },
] };

export const around = (s: SkySource): System => ({ id: 'region', title: s.region.name, channels: [
  { key: 'traffic', name: 'Traffic', glyph: g.radar, read: (src) => {
    const list = regional(src);
    if (!list.length) return null;
    const up = list.filter(airborne), nearest = up[0] ?? list[0];
    const plots: Plot[] = list.filter((a) => a.dir != null).map((a) => ({ bearing: a.dir!, range: a.dst! / src.region.nm, label: line(a), id: acId(a), on: airborne(a), tone: oddness(a) }));
    return { kind: 'p', v: clamp(up.length / 120), ids: list.map(acId), big: `${up.length}`, label: `in the air within ${src.region.nm} nm · ${list.length - up.length} on the ground`, plots,
      list: list.map((a) => seg(src, a, airborne(a), `${line(a)} · ${num(a.dst ?? 0, 0)} nm ${a.dir != null ? compass(a.dir) : ''}`)), name: nearest ? undefined : undefined };
  } },
  { key: 'arrivals', name: 'Arriving', glyph: g.down, read: (src) => {
    const list = regional(src).filter((a) => airborne(a) && a.alt! < 10_000 && a.rate != null && a.rate < -300);
    const all = regional(src);
    if (!all.length) return null;
    return { kind: 'p', v: clamp(list.length / 30), ids: list.length ? list.map(acId) : [acId(all[0])], big: `${list.length}`, label: 'descending under 10,000 ft', list: list.map((a) => seg(src, a, true)) };
  } },
  { key: 'departures', name: 'Departing', glyph: g.up, read: (src) => {
    const list = regional(src).filter((a) => airborne(a) && a.alt! < 10_000 && a.rate != null && a.rate > 300);
    const all = regional(src);
    if (!all.length) return null;
    return { kind: 'p', v: clamp(list.length / 30), ids: list.length ? list.map(acId) : [acId(all[0])], big: `${list.length}`, label: 'climbing under 10,000 ft', list: list.map((a) => seg(src, a, true)) };
  } },
  { key: 'holds', name: 'Holding', glyph: g.hold, read: (src) => {
    const list = regional(src).filter((a) => airborne(a) && holding(a));
    const all = regional(src);
    if (!all.length) return null;
    return { kind: 'p', v: clamp(list.length / 10), ids: list.length ? list.map(acId) : [acId(all[0])], big: `${list.length}`, label: list.length ? `in a hold · ${listOf(list.slice(0, 3).map((a) => a.flight))}` : 'in a hold', list: list.map((a) => seg(src, a, true)) };
  } },
] });

export const anomalies: System = { id: 'anomalies', title: 'Anomalies', channels: [
  { key: 'descents', name: 'Fast descents', glyph: g.descent, read: (s) => {
    const all = regional(s);
    if (!all.length) return null;
    const list = all.filter(fastDescent).sort((a, b) => a.rate! - b.rate!);
    const segs = list.map((a) => seg(s, a, false, `${a.flight} · ${fpm(a.rate!)} at ${num(a.alt!, 0)} ft`));
    return { kind: 's', segs, ids: list.length ? list.map(acId) : [acId(all[0])], list: segs, big: list.length ? `${list.length}` : 'None', label: 'over 4,000 ft/min below 10,000 ft',
      alert: list.length ? got(2, fpm(list[0].rate!), 'fast descent', t.descentWhy(list[0].flight, Math.abs(Math.round(list[0].rate!)), Math.round(list[0].alt!)), [open(s, list[0])], t.seeOnMap, `descent:${list[0].hex}`) : undefined };
  } },
  { key: 'lost', name: 'Lost signal', glyph: g.lost, read: (s) => {
    const all = regional(s);
    if (!all.length) return null;
    const list = all.filter((a) => lostSignal(a)).sort((a, b) => silent(b) - silent(a));
    const segs = list.map((a) => seg(s, a, false, `${a.flight} · ${num(silent(a), 0)} s · last at ${num(a.alt!, 0)} ft`));
    return { kind: 's', segs, ids: list.length ? list.map(acId) : [acId(all[0])], list: segs, big: list.length ? `${list.length}` : 'None', label: 'quiet for over a minute while in the air',
      alert: list.length ? got(1, `${num(silent(list[0]), 0)} s`, 'lost signal', t.lostWhy(list[0].flight, Math.round(silent(list[0])), Math.round(list[0].alt!)), [open(s, list[0])], t.seeOnMap, `lost:${list[0].hex}`) : undefined };
  } },
  { key: 'lowslow', name: 'Low and slow', glyph: g.low, read: (s) => {
    const all = regional(s);
    if (!all.length) return null;
    const list = all.filter(lowSlow);
    const segs = list.map((a) => seg(s, a, false, `${a.flight} · ${num(a.alt!, 0)} ft · ${num(a.gs!, 0)} kn · ${num(nearestAirportNm(a) ?? 0, 0)} nm from an airport`));
    return { kind: 's', segs, ids: list.length ? list.map(acId) : [acId(all[0])], list: segs, big: list.length ? `${list.length}` : 'None', label: 'under 1,500 ft and 120 kn, far from any airport',
      alert: list.length ? got(1, `${num(list[0].alt!, 0)} ft`, 'low and slow', t.lowSlowWhy(list[0].flight, Math.round(list[0].alt!), Math.round(list[0].gs!), Math.round(nearestAirportNm(list[0]) ?? 0)), [open(s, list[0])], t.seeOnMap, `lowslow:${list[0].hex}`) : undefined };
  } },
] };

export const sky: System = { id: 'sky', title: 'The sky', channels: [
  { key: 'airborne', name: 'In the air', glyph: g.globe, read: (s) => {
    if (!s.sky) return null;
    const ago = Math.round((Date.now() - s.sky.at) / 60_000);
    const most = Math.max(1, ...s.sky.bins.map((b) => b.n));
    const plots: GeoPlot[] = s.sky.bins.map((b) => ({ lat: b.lat, lon: b.lon, label: `${b.n} aircraft`, size: Math.sqrt(b.n / most), on: b.n >= most / 10 }));
    return { kind: 'p', v: clamp(s.sky.airborne / 15_000), ids: ['sky'], big: s.sky.airborne.toLocaleString(), label: `aircraft in the air worldwide · ${ago < 1 ? 'just now' : `${ago} min ago`}`, globe: { center: { lat: 25, lon: s.region.lon }, plots } };
  } },
  { key: 'countries', name: 'Registered in', glyph: g.flag, read: (s) => {
    if (!s.sky?.countries.length) return null;
    const [top, n] = s.sky.countries[0];
    const segs: Seg[] = s.sky.countries.map(([c, k]) => ({ label: `${c} · ${k.toLocaleString()}`, on: true, id: 'sky' }));
    return { kind: 'p', v: clamp(n / s.sky.airborne), ids: ['sky'], big: top, label: `${n.toLocaleString()} of ${s.sky.airborne.toLocaleString()} · then ${listOf(s.sky.countries.slice(1, 3).map(([c]) => c))}`, list: segs };
  } },
] };

export const systemsOf = (s: SkySource): System[] => [emergencies, around(s), anomalies, sky];

// ─── One object per aircraft of the region: the groups axis ───

const CATEGORIES: Record<string, string> = { A1: 'Light', A2: 'Small', A3: 'Large', A4: 'Heavy (B757)', A5: 'Heavy', A6: 'High performance', A7: 'Rotorcraft', B1: 'Glider', B2: 'Lighter than air', B4: 'Ultralight', B6: 'Drone', C1: 'Vehicle', C2: 'Vehicle' };
export function groupsOf(s: SkySource): Group[] {
  const byCat = new Map<string, Aircraft[]>();
  for (const a of regional(s)) { const c = CATEGORIES[a.category] ?? (a.category || t.noGroup); byCat.set(c, [...(byCat.get(c) ?? []), a]); }
  return [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).map(([title, list]) => ({ title, items: list.map((a) => ({ id: a.hex, name: `${a.flight}${a.type ? ` · ${a.type}` : ''}` })) }));
}

const acChannels: { key: string; name: string; glyph: string; read: (s: SkySource, a: Aircraft) => Reading | null }[] = [
  { key: 'region/flight', name: 'Flight', glyph: g.plane, read: (s, a) => {
    const id = acId(a), odd = a.emergency || ['7700', '7600', '7500'].includes(a.squawk);
    return { kind: 'p', v: clamp((a.alt ?? 0) / 45_000), ids: [id], big: ft(a), bearing: a.track ?? undefined, map: mapOf(a),
      link: { label: t.seeOn(site(s, a)), on: true, id, act: open(s, a) },
      label: `${a.type || a.category || 'aircraft'}${a.reg ? ` ${a.reg}` : ''} · ${a.rate != null && Math.abs(a.rate) > 300 ? `${a.rate > 0 ? 'climbing' : 'descending'} ${num(Math.abs(a.rate), 0)} ft/min` : 'level'}`,
      alert: odd ? { level: a.squawk === '7600' ? 1 : 2, big: a.squawk || a.emergency, label: t.squawk[a.squawk] ?? t.emergencies[a.emergency] ?? 'emergency', key: `squawk:${a.hex}`, why: t.squawkWhy(a.flight, a.type, t.squawk[a.squawk] ?? t.emergencies[a.emergency] ?? a.squawk, ft(a), where(a)), verb: t.seeOnMap, acts: [open(s, a)] }
        : fastDescent(a) ? got(2, fpm(a.rate!), 'fast descent', t.descentWhy(a.flight, Math.abs(Math.round(a.rate!)), Math.round(a.alt!)), [open(s, a)], t.seeOnMap)
        : lostSignal(a) ? got(1, `${num(silent(a), 0)} s`, 'lost signal', t.lostWhy(a.flight, Math.round(silent(a)), Math.round(a.alt!)), [open(s, a)], t.seeOnMap)
        : lowSlow(a) ? got(1, `${num(a.alt!, 0)} ft`, 'low and slow', t.lowSlowWhy(a.flight, Math.round(a.alt!), Math.round(a.gs!), Math.round(nearestAirportNm(a) ?? 0)), [open(s, a)], t.seeOnMap) : undefined };
  } },
  { key: 'region/speed', name: 'Speed', glyph: g.speed, read: (_s, a) => {
    if (a.gs == null) return null;
    return { kind: 'p', v: clamp(a.gs / 600), ids: [acId(a)], big: `${num(a.gs, 0)} kn`, bearing: a.track ?? undefined, label: a.track != null ? `track ${num(a.track, 0)}° ${compass(a.track)}` : 'over the ground' };
  } },
  { key: 'region/where', name: 'From here', glyph: g.radar, read: (s, a) => {
    if (a.dst == null || a.dir == null) return null;
    return { kind: 'p', v: clamp(a.dst / s.region.nm), ids: [acId(a)], big: `${num(a.dst, 0)} nm`, label: `${compass(a.dir)} of ${s.region.name}`, bearing: a.dir,
      plots: [{ bearing: a.dir, range: a.dst / s.region.nm, label: a.flight, id: acId(a), on: airborne(a), tone: oddness(a) }] };
  } },
  { key: 'region/squawk', name: 'Squawk', glyph: g.squawk, read: (_s, a) => {
    if (!a.squawk) return null;
    const what = t.squawk[a.squawk];
    return { kind: 'p', v: what ? 1 : 0, ids: [acId(a)], big: a.squawk, label: what ?? (a.squawk === '1200' || a.squawk === '7000' ? 'VFR' : 'assigned') };
  } },
];

// One aircraft as an object: these channels, each read again from the source by its hex.
const aircraftSystem = (a: Aircraft, channels = acChannels): System => ({
  id: acId(a), title: `${a.flight}${a.type ? ` · ${a.type}` : ''}`,
  channels: channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (src: SkySource) => { const now = src.aircraft.get(a.hex); return now ? ch.read(src, now) : null; } })),
});
export function aircraftSystems(s: SkySource, chosen: string[], hidden: (system: string, channel: string) => boolean): System[] {
  return regional(s).map((a) => aircraftSystem(a, acChannels.filter((ch) => { const [sys, key] = ch.key.split('/'); return chosen.includes(sys) && !hidden(sys, key); })));
}
// The object of one aircraft a list names, every channel it has: the region's, and the ones squawking far away too.
export const aircraftObject = (s: SkySource, id: string): System | null => {
  const a = id.startsWith(AC) ? s.aircraft.get(id.slice(AC.length)) : undefined;
  return a ? aircraftSystem(a) : null;
};
export type { Fleet };
