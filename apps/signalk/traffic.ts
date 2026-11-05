import { num, type Alert, type GeoPlot, type Plot, type Reading, type Seg } from '@zumer/pulse';
import type { Act, Target, VesselSource } from './source.ts';
import { t } from './strings.ts';

// The vessels around, as a skipper reads them on a chartplotter: not where
// each one is now but how close it will pass and when, the closest point of
// approach (CPA) and the time to it (TCPA), from both courses and speeds. A
// ship three miles off on a collision course calls; a fishing boat a few
// cables away and opening does not. The radar is relative to the boat (it
// sits in the center, its own course and six minutes of way ahead of it);
// the chart is the same traffic on the street map, to drag around.

export type Channel = { key: string; name: string; glyph: string; read: (s: VesselSource) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  radar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12l6-6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  near: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7l3 7-3-1.5L9 14z',
  ship: 'M4 15l2 5h12l2-5z M6 15V9h12v6 M9 9V5h6v4 M12 5V3',
  speed: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
};

export const NM = 1852, RANGE = 5 * NM;
export const AIS = 'ais:';
const kn = (ms: number) => ms * 1.943844;
const deg = (rad: number) => (((rad * 180) / Math.PI) % 360 + 360) % 360;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const compass = (d: number) => t.compass[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
const nm = (m: number) => `${num(m / NM, m < 2 * NM ? 2 : 1)} nm`;
const mins = (s: number) => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
// "MSC ALICIA" → "MSC Alicia": AIS names come in capitals; a word with no vowel (MSC, MV, NYK) or a roman numeral stays.
export const shipName = (name: string) => name.replace(/\p{L}+/gu, (w) => !/[AEIOUY]/i.test(w) || /^[IVX]+$/.test(w) ? w : w[0] + w.slice(1).toLowerCase());

// A watch a skipper would keep: within half a mile in twenty minutes calls; within
// a quarter in ten, loudly. A vessel already this close calls too.
const WATCH = { cpa: NM / 2, tcpa: 20 * 60, closeCpa: NM / 4, closeTcpa: 10 * 60 };
// Six minutes of way, the vector a chartplotter draws ahead of each vessel.
const VECTOR_S = 6 * 60;

type Here = { lat: number; lon: number; cog?: number; sog?: number };
// Where a vessel is from the boat (metres east and north), how far, which way.
export function fromBoat(pos: { latitude: number; longitude: number }, o: { lat: number; lon: number }) {
  const r = Math.PI / 180, dLat = (o.lat - pos.latitude) * r, dLon = (o.lon - pos.longitude) * r * Math.cos(pos.latitude * r);
  return { m: Math.hypot(dLat, dLon) * 6_371_000, bearing: ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360, e: dLon * 6_371_000, n: dLat * 6_371_000 };
}
const velocity = (cog?: number, sog?: number) => cog == null || sog == null ? { e: 0, n: 0 } : { e: sog * Math.sin(cog), n: sog * Math.cos(cog) };

// A vessel as the watch reads it: where (from the boat), and the closest it
// will pass and when; `level` is the call (0 calm, 1 soft, 2 loud), `closing`
// whether it is still to come.
export type Contact = Target & { m: number; bearing: number; cpa: number; tcpa: number; closing: boolean; level: 0 | 1 | 2 };
export function contactOf(here: Here, o: Target): Contact {
  const at = fromBoat({ latitude: here.lat, longitude: here.lon }, o);
  const own = velocity(here.cog, here.sog), its = velocity(o.cog, o.sog);
  const v = { e: its.e - own.e, n: its.n - own.n }, v2 = v.e * v.e + v.n * v.n;
  const tcpa = v2 > 1e-6 ? -(at.e * v.e + at.n * v.n) / v2 : 0;
  const closing = tcpa > 0;
  const cpa = closing ? Math.hypot(at.e + v.e * tcpa, at.n + v.n * tcpa) : at.m;
  const level = at.m < WATCH.closeCpa || (closing && cpa < WATCH.closeCpa && tcpa < WATCH.closeTcpa) ? 2
    : closing && cpa < WATCH.cpa && tcpa < WATCH.tcpa ? 1 : 0;
  return { ...o, m: at.m, bearing: at.bearing, cpa, tcpa: closing ? tcpa : 0, closing, level };
}
export const hereOf = (s: VesselSource): Here | null => {
  const pos = s.values.get('navigation.position')?.value as { latitude?: number; longitude?: number } | undefined;
  if (typeof pos?.latitude !== 'number' || typeof pos?.longitude !== 'number') return null;
  const num = (path: string) => { const v = s.values.get(path)?.value; return typeof v === 'number' && Number.isFinite(v) ? v : undefined; };
  return { lat: pos.latitude, lon: pos.longitude, cog: num('navigation.courseOverGroundTrue'), sog: num('navigation.speedOverGround') };
};
// The vessels within the radar's range, the one that calls the most first, then the soonest, then the nearest.
export function contacts(s: VesselSource): { here: Here; all: Contact[] } | null {
  const here = hereOf(s);
  if (!here || !s.others.size) return null;
  const all = [...s.others.values()].map((o) => contactOf(here, o)).filter((c) => c.m <= RANGE)
    .sort((a, b) => b.level - a.level || (a.level ? a.tcpa - b.tcpa : 0) || a.m - b.m);
  return { here, all };
}

// How a contact passes, in words: "passes 0.25 nm in 14 min", "opening", "already 0.2 nm off".
const passOf = (c: Contact) => c.closing ? t.passes(nm(c.cpa), mins(c.tcpa)) : t.opening;
const whereOf = (c: Contact) => `${nm(c.m)} ${compass(c.bearing)}${c.sog != null ? ` · ${num(kn(c.sog), 0)} kn` : ''}`;
const toneOf = (level: number) => level === 2 ? 'critical' as const : level === 1 ? 'warn' as const : undefined;
const callOf = (c: Contact): Alert | undefined => c.level ? {
  level: c.level, big: nm(c.closing ? c.cpa : c.m), label: shipName(c.name), key: `cpa:${c.id}`, verb: t.gotIt, acts: [],
  why: c.closing ? t.cpaWhy(shipName(c.name), nm(c.cpa), mins(c.tcpa), nm(c.m), compass(c.bearing), c.sog != null ? num(kn(c.sog), 0) : null) : t.closeWhy(shipName(c.name), nm(c.m), compass(c.bearing)),
} : undefined;
// The rings of the radar: a mile, two and a half, five.
const RINGS = [{ at: 1 / 5, label: '1 nm' }, { at: 1 / 2, label: '2.5' }, { at: 1, label: '5 nm' }];
const plotOf = (c: Contact): Plot => ({ bearing: c.bearing, range: c.m / RANGE, label: `${shipName(c.name)} · ${whereOf(c)} · ${passOf(c)}`, id: AIS + c.id,
  tone: toneOf(c.level), course: c.cog != null ? deg(c.cog) : undefined, vector: c.sog != null ? (c.sog * VECTOR_S) / RANGE : undefined });
const radarOf = (here: Here) => ({ rings: RINGS, course: here.cog != null ? deg(here.cog) : undefined, vector: here.sog != null ? (here.sog * VECTOR_S) / RANGE : undefined });
const rowOf = (c: Contact): Seg => ({ label: shipName(c.name), detail: `${passOf(c)} · ${whereOf(c)}`, on: true, level: c.level || undefined, id: AIS + c.id, to: AIS + c.id });
const geoOf = (c: { lat: number; lon: number; cog?: number }, label: string, id?: string, level = 0): GeoPlot => ({ lat: c.lat, lon: c.lon, label, id, tone: toneOf(level), course: c.cog != null ? deg(c.cog) : undefined, size: 0.6 });

// ─── The traffic, as a system ───

export const traffic: System = { id: 'traffic', title: 'Traffic', channels: [
  // The closest approach: the radar of what is around, the one that will pass closest named.
  { key: 'watch', name: 'Closest approach', glyph: g.radar, read: (s) => {
    const c = contacts(s);
    if (!c?.all.length) return null;
    const { here, all } = c, closing = all.filter((x) => x.closing).sort((a, b) => a.cpa - b.cpa), first = all[0], next = closing[0];
    const calm = !first.level;
    return { kind: 'p', v: next ? clamp(1 - next.cpa / NM) : 0, ids: all.map((x) => AIS + x.id),
      big: calm ? t.clear : nm(first.closing ? first.cpa : first.m),
      label: calm ? (next ? t.closestPass(shipName(next.name), nm(next.cpa), mins(next.tcpa)) : t.noneClosing(all.length)) : `${shipName(first.name)} · ${first.closing ? `in ${mins(first.tcpa)}` : 'now'}`,
      plots: all.map(plotOf), radar: radarOf(here), list: all.map(rowOf), alert: callOf(first) };
  } },
  // The same traffic on the street map, the boat among it.
  { key: 'chart', name: 'On the chart', glyph: g.map, read: (s) => {
    const c = contacts(s);
    if (!c?.all.length) return null;
    const { here, all } = c, nearest = [...all].sort((a, b) => a.m - b.m)[0];
    return { kind: 'p', v: clamp(all.length / 12), ids: all.map((x) => AIS + x.id), big: t.vessels(all.length), label: `within 5 nm · nearest ${shipName(nearest.name)} ${nm(nearest.m)} ${compass(nearest.bearing)}`,
      map: { center: { lat: here.lat, lon: here.lon }, zoom: 11, plots: [...all.map((x) => geoOf(x, `${shipName(x.name)} · ${passOf(x)}`, AIS + x.id, x.level)), geoOf(here, s.name || t.thisBoat)] },
      list: all.map(rowOf) };
  } },
  // The nearest now, the arrow on the ring pointing at it.
  { key: 'nearest', name: 'Nearest', glyph: g.near, read: (s) => {
    const c = contacts(s);
    if (!c?.all.length) return null;
    const n = [...c.all].sort((a, b) => a.m - b.m)[0];
    return { kind: 'p', v: clamp(1 - n.m / RANGE), ids: [AIS + n.id], big: nm(n.m), bearing: n.bearing, label: `${shipName(n.name)} · ${compass(n.bearing)} · ${passOf(n)}` };
  } },
] };

// ─── One vessel as an object of its own, opened from a row or a mark ───

const typeOf = (o: Target) => o.type ?? t.vessel;
export function vesselObject(s: VesselSource, id: string) {
  const key = id.slice(AIS.length);
  if (!s.others.has(key)) return null;
  const read = (fn: (c: Contact, here: Here) => Reading | null) => (src: VesselSource) => {
    const here = hereOf(src), o = src.others.get(key);
    return here && o ? fn(contactOf(here, o), here) : null;
  };
  const o = s.others.get(key)!;
  return { id, title: shipName(o.name), channels: [
    { key: 'pass', name: 'Closest approach', glyph: g.radar, read: read((c, here) => ({ kind: 'p', v: c.closing ? clamp(1 - c.cpa / NM) : 0, ids: [id],
      big: c.closing ? nm(c.cpa) : t.opening, label: c.closing ? `in ${mins(c.tcpa)} · now ${nm(c.m)} ${compass(c.bearing)}` : `now ${nm(c.m)} ${compass(c.bearing)}`,
      plots: [plotOf(c)], radar: radarOf(here), alert: callOf(c) })) },
    { key: 'where', name: 'Where', glyph: g.map, read: read((c, here) => ({ kind: 'p', v: clamp(1 - c.m / RANGE), ids: [id], big: `${nm(c.m)} ${compass(c.bearing)}`,
      label: `bearing ${num(c.bearing, 0)}° from ${s.name || t.thisBoat}`, bearing: c.bearing,
      map: { center: { lat: (c.lat + here.lat) / 2, lon: (c.lon + here.lon) / 2 }, zoom: c.m > 3 * NM ? 11 : c.m > NM ? 12 : 13,
        plots: [geoOf(c, shipName(c.name), id, c.level), geoOf(here, s.name || t.thisBoat)] } })) },
    { key: 'motion', name: 'Motion', glyph: g.speed, read: read((c) => c.sog == null ? null : ({ kind: 'p', v: clamp(kn(c.sog) / 30), ids: [id], big: `${num(kn(c.sog), 1)} kn`,
      bearing: c.cog != null ? deg(c.cog) : undefined, label: `${c.cog != null ? `course ${num(deg(c.cog), 0)}°` : 'course unknown'}${c.state ? ` · ${c.state}` : ''}` })) },
    { key: 'vessel', name: 'Vessel', glyph: g.ship, read: read((c) => ({ kind: 'p', v: c.length ? clamp(c.length / 300) : 0, ids: [id], big: typeOf(c),
      label: [c.mmsi && `MMSI ${c.mmsi}`, c.length && `${num(c.length, 0)} m`, c.destination && `to ${c.destination}`].filter(Boolean).join(' · ') || t.noDetails,
      link: c.mmsi ? { label: t.seeOn('MarineTraffic'), on: true, id, act: { ids: [id], kind: 'open', url: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${c.mmsi}` } as unknown as Act } : undefined })) },
  ] };
}
