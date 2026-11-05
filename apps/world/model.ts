import { num, type GeoPlot, type MapSpec, type Reading, type Seg } from '@zumer/pulse';
import { distanceKm, stormKey, type Elevation, type Hazard, type HazardKind, type Notice, type Things, type TrackPoint, type UsVolcanoInfo, type Where } from './feeds.ts';
import type { Act } from './source.ts';
import { t } from './strings.ts';

// Every channel is read from the things the feeds report: there is no
// hand-written state. An earthquake's alert is its magnitude or USGS's PAGER
// alert; a cyclone's, a flood's, a wildfire's and an eruption's is GDACS's
// own (orange and red), a US volcano's its observatory's color code; the
// nearest of each calls by how far it is from you. Nothing out there takes a
// command: an alert opens the event's page, or is marked seen.

export type Channel = { key: string; name: string; glyph: string; read: (s: Things) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  quake: 'M3 12h3l2-6 3 12 3-9 2 5 2-2h3',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  depth: 'M3 7h18 M12 7v12 M12 19l-4-4 M12 19l4-4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  cyclone: 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0 M15 4.6A8 8 0 0 0 4.2 10.5 M9 19.4a8 8 0 0 0 10.8-5.9',
  flood: 'M5 11V7l7-4 7 4v4 M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15 M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2-1.5 4.5-1.5S19 19 21 19',
  fire: 'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-1.5-2-1.5-3C7 10 6 12.5 6 15a6 6 0 0 0 6 6z',
  volcano: 'M3 20l6-9h6l6 9z M10 11l2-3 2 3 M12 6V3 M9 5L7.5 3 M15 5l1.5-2',
  gauge: 'M4 16a8 8 0 1 1 16 0 M12 16l4-5',
  peak: 'M3 20l7-12 4 6 2-3 5 9z M10 8l1.5 2.5',
  notice: 'M5 4h10l4 4v12H5z M15 4v4h4 M8 12h8 M8 16h6',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const open = (url: string): Act => ({ ids: [], kind: 'open', url });
// "3 h ago", "20 min ago", for a moment in the past.
export const agoText = (at: number, now = Date.now()) => {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  return min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};
// "9 days", "5 h", for how long something has lasted.
const lasted = (ms: number) => { const h = Math.max(0, ms) / 3_600_000; return h < 48 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} days`; };
const hour = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
// A tile zoom that holds `km` across the disc around a latitude.
const zoomFor = (lat: number, km: number) => Math.max(2, Math.min(10, Math.floor(Math.log2((140 * 156_543 * Math.cos((lat * Math.PI) / 180)) / Math.max(1_000, km * 1_000)))));
// You and a thing on one map: centered between the two, at the closest zoom that holds them both.
const youAnd = (at: { lat: number; lon: number }, km: number, from: Where, plot: GeoPlot): MapSpec => {
  const lon = Math.abs(at.lon - from.lon) > 180 ? at.lon - Math.sign(at.lon - from.lon) * 360 : at.lon;
  const center = { lat: (at.lat + from.lat) / 2, lon: ((((from.lon + lon) / 2) + 540) % 360) - 180 };
  return { center, zoom: zoomFor(center.lat, km), plots: [{ lat: from.lat, lon: from.lon, label: from.place, size: 0.2 }, plot] };
};

// ─── Earthquakes ───

type Quake = { mag: number; place: string; time: number; url: string; alert: string | null; tsunami: boolean; km: number; depth: number; lat: number; lon: number };
// A magnitude as seismologists write it, with its tenth: "M 5.0".
export const mag = (m: number) => m.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// How loudly a quake calls: M7 or an orange or red PAGER alert loudly, M6 or a yellow one softly.
const quakeLevel = (q: Quake) => (q.mag >= 7 || q.alert === 'red' || q.alert === 'orange' ? 2 : q.mag >= 6 || q.alert === 'yellow' ? 1 : 0);
// A quake in a list, its magnitude and its region, then where in it and when;
// tapping it opens its own object. USGS writes "98 km NE of Raoul Island, Kermadec Islands".
const quakeSeg = (q: Quake): Seg => {
  const cut = q.place.lastIndexOf(', '), region = (cut > 0 ? q.place.slice(cut + 2) : q.place).replace(/ region$/, ''), where = cut > 0 ? q.place.slice(0, cut) : '';
  return { label: `M ${mag(q.mag)} · ${region}`, detail: [where, agoText(q.time)].filter(Boolean).join(' · '), on: q.mag >= 5, level: quakeLevel(q) || undefined,
    id: `quake:${q.time}`, act: open(q.url), to: `quake:${q.time}` };
};
// A quake as a dot, sized by magnitude, the big ones in the alert's color.
const quakePlot = (q: Quake): GeoPlot => ({ lat: q.lat, lon: q.lon, label: `M ${mag(q.mag)} · ${q.place}`, id: `quake:${q.time}`, size: Math.max(0, (q.mag - 2.5) / 5), tone: q.mag >= 7 ? 'critical' : q.mag >= 6 ? 'warn' : undefined });
// The day's quakes on the globe, turned to the strongest.
const quakeGlobe = (top: Quake[], center: Quake) => ({ center: { lat: center.lat, lon: center.lon }, plots: top.map(quakePlot) });
// A quake on the street map around its epicenter, the day's others nearby too; a bigger one reaches farther, so the map shows more around it.
const quakeMap = (q: Quake, others: Quake[]): MapSpec => ({ center: { lat: q.lat, lon: q.lon }, zoom: q.mag >= 6 ? 5 : 6, plots: [...others.filter((o) => o.time !== q.time), q].map(quakePlot) });
// USGS's tsunami flag is set for a large quake at sea: not a warning, a sign to look at the tsunami centers.
const atSea = (q: Quake) => (q.tsunami ? ` · ${t.atSea}` : '');

export const quakes: System = { id: 'quakes', title: 'Earthquakes', channels: [
  { key: 'strongest', name: 'Strongest', glyph: g.quake, read: (s) => {
    const th = s.get('quakes.strongest'), count = s.get('quakes.count');
    if (!th || !isNum(th.state)) return null;
    const q = th.attrs as unknown as Quake, top = (count?.attrs.top as Quake[] | undefined) ?? [];
    const level = quakeLevel(q);
    return { kind: 'p', v: clamp(q.mag / 9), ids: count ? ['quakes.strongest', 'quakes.count'] : ['quakes.strongest'], big: `M ${mag(q.mag)}`,
      label: `${q.place} · ${agoText(q.time)}`, list: top.map(quakeSeg), map: quakeMap(q, top),
      alert: level ? { level, big: `M ${mag(q.mag)}`, label: q.place, key: `quake:${q.time}`, why: t.quakeWhy(mag(q.mag), q.place, agoText(q.time)) + atSea(q),
        verb: t.seeOn('USGS'), acts: [open(q.url)] } : undefined };
  } },
  { key: 'near', name: 'Nearest', glyph: g.pin, read: (s) => {
    const th = s.get('quakes.near');
    if (!th || !isNum(th.state)) return null;
    const q = th.attrs as unknown as Quake, from = th.attrs.from as Where | undefined;
    const level = q.km <= 150 && q.mag >= 5.5 ? 2 : q.km <= 300 && q.mag >= 4.5 ? 1 : 0;
    return { kind: 'p', v: clamp(1 - q.km / 3000), ids: ['quakes.near'], big: `${num(q.km, 0)} km`, label: `M ${mag(q.mag)} · ${q.place}`, map: from ? youAnd(q, q.km, from, quakePlot(q)) : quakeMap(q, []),
      alert: level ? { level, big: `M ${mag(q.mag)}`, label: `${num(q.km, 0)} km away`, key: `quake:${q.time}`, why: t.nearQuake(mag(q.mag), q.km, q.place), verb: t.seeOn('USGS'), acts: [open(q.url)] } : undefined };
  } },
  { key: 'activity', name: 'Last 24 hours', glyph: g.globe, read: (s) => {
    const th = s.get('quakes.count');
    if (!th || !isNum(th.state)) return null;
    const strong = (th.attrs.strong as number | undefined) ?? 0, top = (th.attrs.top as Quake[] | undefined) ?? [];
    return { kind: 'p', v: clamp(th.state / 150), ids: ['quakes.count'], big: `${th.state}`, label: `of M 2.5+ · ${strong} of M 5+`, list: top.map(quakeSeg), globe: top.length ? quakeGlobe(top, top[0]) : undefined };
  } },
] };

// One quake as an object of its own, opened from a list.
export const QUAKE = 'quake:';
// The quakes the feed keeps at hand: the day's strongest dozen, the strongest and the nearest.
const quakesIn = (s: Things): Quake[] => {
  const one = (id: string) => s.get(id)?.attrs as unknown as Quake | undefined;
  return [...((s.get('quakes.count')?.attrs.top as Quake[] | undefined) ?? []), one('quakes.strongest'), one('quakes.near')].filter((q): q is Quake => !!q);
};
export const quakeIn = (s: Things, id: string) => (id.startsWith(QUAKE) ? quakesIn(s).find((q) => `${QUAKE}${q.time}` === id) ?? null : null);
const depthOf = (km: number) => (km < 70 ? 'shallow' : km < 300 ? 'intermediate depth' : 'deep');

// Where it struck on the street map, how deep, how far from you, when; the epicenter's detail opens it on USGS.
export function quakeObject(s: Things, id: string, from: Where): System | null {
  const q = quakeIn(s, id);
  if (!q) return null;
  const read = (fn: (q: Quake, s: Things) => Reading) => (s: Things) => { const now = quakeIn(s, id); return now ? fn(now, s) : null; };
  return { id, title: `M ${mag(q.mag)} · ${q.place}`, channels: [
    { key: 'epicenter', name: 'Epicenter', glyph: g.quake, read: read((q, s) => ({ kind: 'p', v: clamp(q.mag / 9), ids: [id], big: `M ${mag(q.mag)}`,
      label: `${q.place}${atSea(q)}`, map: quakeMap(q, quakesIn(s)), link: { label: t.seeOn('USGS'), on: true, id, act: open(q.url) } })) },
    { key: 'depth', name: 'Depth', glyph: g.depth, read: read((q) => ({ kind: 'p', v: clamp(q.depth / 700), ids: [id], big: `${num(q.depth, 0)} km`, label: depthOf(q.depth) })) },
    { key: 'from', name: 'From you', glyph: g.pin, read: read((q) => ({ kind: 'p', v: clamp(1 - q.km / 3000), ids: [id], big: `${num(q.km, 0)} km`, label: `from ${from.place}`, map: youAnd(q, q.km, from, quakePlot(q)) })) },
    { key: 'when', name: 'When', glyph: g.clock, read: read((q) => ({ kind: 'p', v: clamp(1 - (Date.now() - q.time) / 86_400_000), ids: [id], big: agoText(q.time), label: `at ${hour(q.time)}` })) },
  ] };
}

// ─── Cyclones, floods, wildfires, volcanoes: each event a hazard ───

// The wind of a cyclone as the Saffir-Simpson category (sustained, km/h).
export const category = (kmh: number) => kmh < 63 ? 'Tropical depression' : kmh < 119 ? 'Tropical storm' : `Category ${kmh < 154 ? 1 : kmh < 178 ? 2 : kmh < 209 ? 3 : kmh < 252 ? 4 : 5}`;
const area = (ha: number) => (ha >= 10_000 ? `${num(ha / 1000, 0)}k ha` : `${num(ha, 0)} ha`);
const word = (alert: string) => alert.charAt(0).toUpperCase() + alert.slice(1).toLowerCase();
// "MURASU-26" → "Murasu": GDACS's names in capitals with the year.
const storm = (name: string) => name.replace(/^Tropical Cyclone\s+/i, '').replace(/-\d\d$/, '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

// What each hazard says: its name, its number, how far from you calls.
type Kind = {
  id: string; title: string; glyph: string; zoom: number;
  title1: (e: Hazard) => string;       // the event's own name
  big: (e: Hazard) => string;          // its measure: the wind, the area burnt, the alert
  label: (e: Hazard) => string;
  v: (e: Hazard) => number;            // the measure as a ring, 0 to 1
  rank: (e: Hazard) => number;         // within a level, which is worse
  near: [number, number];              // km: within the first calls loudly, the second softly
  why: (e: Hazard) => string;          // what the alert says
  none: string;
};
const KINDS: Record<HazardKind, Kind> = {
  TC: { id: 'cyclones', title: 'Cyclones', glyph: g.cyclone, zoom: 4, near: [300, 1000], none: 'no cyclone at sea',
    title1: (e) => `Cyclone ${storm(e.name)}`, big: (e) => `${num(e.severity, 0)} km/h`, label: (e) => `${category(e.severity)}${e.country ? ` · ${e.country}` : ''}`,
    v: (e) => clamp(e.severity / 280), rank: (e) => e.severity, why: (e) => t.cycloneWhy(`Cyclone ${storm(e.name)}`, e.country, e.alert, num(e.severity, 0), category(e.severity)) },
  FL: { id: 'floods', title: 'Floods', glyph: g.flood, zoom: 5, near: [50, 200], none: 'no flood rated',
    title1: (e) => e.name, big: (e) => word(e.alert), label: (e) => `${e.country} · ${lasted(e.to - e.from)}`,
    v: (e) => (e.level + 1) / 3, rank: (e) => e.to - e.from, why: (e) => t.floodWhy(e.name, e.alert, lasted(e.to - e.from)) },
  WF: { id: 'fires', title: 'Wildfires', glyph: g.fire, zoom: 7, near: [25, 100], none: 'no wildfire rated',
    title1: (e) => e.name, big: (e) => area(e.severity), label: (e) => `${e.country} · ${lasted(e.to - e.from)}`,
    v: (e) => clamp(Math.log10(Math.max(1, e.severity)) / 6), rank: (e) => e.severity, why: (e) => t.fireWhy(e.name, e.alert, area(e.severity), lasted(e.to - e.from)) },
  VO: { id: 'volcanoes', title: 'Volcanoes', glyph: g.volcano, zoom: 8, near: [30, 150], none: 'no volcano above normal',
    title1: (e) => e.name.replace(/^Eruption\s+/i, ''), big: (e) => word(e.alert.split(' ')[0]), label: (e) => `${e.country} · ${e.source === 'GDACS' ? `erupted ${agoText(e.to)}` : e.severityText}`,
    v: (e) => clamp((e.severity + 1) / 4), rank: (e) => e.severity * 1e13 + e.to,
    why: (e) => (e.source === 'GDACS' ? t.eruptionWhy(e.name, e.country, e.alert, agoText(e.to)) : t.volcanoWhy(e.name, e.source, e.alert.split(' ')[0], e.alert.split(' ')[1] ?? '')) },
};
export const KIND_OF: Record<string, HazardKind> = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.id, k as HazardKind]));

// A US volcano above normal as a hazard: its color code is its alert (yellow
// calm, orange soft, red loud), its alert level the words, where it is from
// the list of US volcanoes.
const COLOR: Record<string, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
const volcanoOf = (v: Elevation, at: UsVolcanoInfo | undefined, from: Where): Hazard | null => at ? ({
  id: `usgs:VO:${v.vnum}`, kind: 'VO', name: v.name, country: at.region || 'United States', level: v.color === 'RED' ? 2 : v.color === 'ORANGE' ? 1 : 0,
  alert: `${v.color} ${v.alertLevel}`, severity: COLOR[v.color] ?? 0, severityText: `alert level ${v.alertLevel.toLowerCase()}`, unit: '', lat: at.lat, lon: at.lon,
  from: v.at, to: v.at, km: Math.round(distanceKm(from.lat, from.lon, at.lat, at.lon)), url: v.url, source: v.observatory,
}) : null;

// The events of a hazard now: GDACS's, and for volcanoes the US observatories' too.
export function hazardsIn(s: Things, kind: HazardKind, from: Where): Hazard[] | null {
  const own = s.get(`gdacs.${kind}`)?.attrs.events as Hazard[] | undefined;
  if (kind !== 'VO') return own ?? null;
  const us = s.get('usgs.volcanoes')?.attrs.list as Elevation[] | undefined, where = s.get('usgs.volcano-where')?.attrs.where as Record<string, UsVolcanoInfo> | undefined;
  if (!own && !us) return null;
  // Both: GDACS rates eruptions anywhere, the US observatories their own volcanoes (its yellow, orange, red as GDACS's green, orange, red).
  return [...(us ?? []).map((v) => volcanoOf(v, where?.[v.vnum], from)).filter((v): v is Hazard => !!v), ...(own ?? []).map((e) => ({ ...e, severity: e.level + 1 }))];
}
const worse = (k: Kind) => (a: Hazard, b: Hazard) => b.level - a.level || k.rank(b) - k.rank(a) || b.to - a.to;
// Every event the feeds keep: what an id names.
export const hazardIn = (s: Things, id: string, from: Where) => {
  const kind = id.split(':')[1] as HazardKind;
  return KINDS[kind] ? hazardsIn(s, kind, from)?.find((e) => e.id === id) ?? null : null;
};
// The event's own name, as its hazard writes it.
export const titleOf = (e: Hazard) => KINDS[e.kind].title1(e);
const tone = (e: Hazard) => (e.level === 2 ? 'critical' as const : e.level === 1 ? 'warn' as const : undefined);
// A cyclone's path, from EONET by its name: the points it passed, oldest first.
const trackOf = (s: Things, e: Hazard): TrackPoint[] => (e.kind === 'TC' ? ((s.get('eonet.tracks')?.attrs.tracks as Record<string, TrackPoint[]> | undefined)?.[stormKey(e.name)] ?? []) : []);
const plotOf = (k: Kind, e: Hazard): GeoPlot => ({ lat: e.lat, lon: e.lon, label: `${k.title1(e)} · ${k.big(e)}`, id: e.id, size: 0.25 + e.level * 0.3, tone: tone(e) });
// The event on the street map, the others of its kind around it; a cyclone with the path it took.
const hazardMap = (k: Kind, e: Hazard, all: Hazard[], track: TrackPoint[]): MapSpec => {
  const path: GeoPlot[] = track.slice(0, -1).map((p) => ({ lat: p.lat, lon: p.lon, label: `${day(p.at)} ${hour(p.at)}${p.kts != null ? ` · ${num(p.kts * 1.852, 0)} km/h` : ''}`, size: 0 }));
  // With a path, the map holds all of it: centered on the middle of where the storm has been.
  const lats = [e.lat, ...track.map((p) => p.lat)], lons = [e.lon, ...track.map((p) => (Math.abs(p.lon - e.lon) > 180 ? p.lon - Math.sign(p.lon - e.lon) * 360 : p.lon))];
  const center = track.length ? { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: ((((Math.min(...lons) + Math.max(...lons)) / 2) + 540) % 360) - 180 } : { lat: e.lat, lon: e.lon };
  const span = track.reduce((m, p) => Math.max(m, distanceKm(center.lat, center.lon, p.lat, p.lon)), distanceKm(center.lat, center.lon, e.lat, e.lon));
  return { center, zoom: track.length ? Math.min(k.zoom, zoomFor(center.lat, span * 2.3)) : k.zoom, plots: [...path, ...all.filter((o) => o.id !== e.id).map((o) => plotOf(k, o)), plotOf(k, e)] };
};
// An event in a list: its name, then its measure and where; the orange and red call.
const segOf = (k: Kind, e: Hazard): Seg => ({ label: k.title1(e), detail: `${k.big(e)} · ${k.label(e)}`, on: true, level: e.level || undefined, id: e.id, act: open(e.url), to: e.id });
const seeIt = (e: Hazard) => t.seeOn(e.source === 'GDACS' ? 'GDACS' : 'USGS');

function hazardSystem(kind: HazardKind, from: Where): System {
  const k = KINDS[kind];
  const events = (s: Things) => { const all = hazardsIn(s, kind, from); return all && [...all].sort(worse(k)); };
  return { id: k.id, title: k.title, channels: [
    { key: 'worst', name: 'Worst', glyph: k.glyph, read: (s) => {
      const all = events(s), e = all?.[0];
      if (!all || !e) return null;
      // The face is about one event: it opens that event's object (the list of them all is Active's).
      return { kind: 'p', v: k.v(e), ids: [e.id], big: k.big(e), label: `${k.title1(e)} · ${k.label(e)}`, to: e.id, map: hazardMap(k, e, all, trackOf(s, e)),
        alert: e.level ? { level: e.level, big: k.big(e), label: k.title1(e), key: `${e.id}:${e.level}`, why: k.why(e), verb: seeIt(e), acts: [open(e.url)] } : undefined };
    } },
    { key: 'near', name: 'Nearest', glyph: g.pin, read: (s) => {
      const all = events(s), e = all && [...all].sort((a, b) => a.km - b.km)[0];
      if (!e) return null;
      const level = e.km <= k.near[0] ? 2 : e.km <= k.near[1] ? 1 : 0;
      return { kind: 'p', v: clamp(1 - e.km / 5000), ids: [e.id], big: `${num(e.km, 0)} km`, label: k.title1(e), to: e.id, map: youAnd(e, e.km, from, plotOf(k, e)),
        alert: level ? { level, big: `${num(e.km, 0)} km`, label: k.title1(e), key: `near:${e.id}:${level}`, why: t.nearHazard(k.title1(e), e.km, from.place), verb: seeIt(e), acts: [open(e.url)] } : undefined };
    } },
    { key: 'active', name: 'Active', glyph: g.globe, read: (s) => {
      const all = events(s);
      if (!all) return null;
      const orange = all.filter((e) => e.level === 1).length, red = all.filter((e) => e.level === 2).length;
      return { kind: 'p', v: clamp(all.length / 50), ids: [kind === 'VO' ? 'usgs.volcanoes' : `gdacs.${kind}`], big: `${all.length}`,
        label: all.length ? t.levels(red, orange) : k.none, list: all.map((o) => segOf(k, o)),
        globe: all.length ? { center: { lat: all[0].lat, lon: all[0].lon }, plots: all.map((e) => plotOf(k, e)) } : undefined };
    } },
  ] };
}

// One event as an object of its own, opened from a list: where it is (a
// cyclone with its path), how bad, how far from you, since when. A US
// volcano says more of itself (usVolcanoObject).
export function hazardObject(s: Things, id: string, from: Where): System | null {
  const e = hazardIn(s, id, from);
  if (!e) return null;
  if (id.startsWith('usgs:VO:')) return usVolcanoObject(s, id, from);
  const k = KINDS[e.kind];
  const read = (fn: (e: Hazard, s: Things) => Reading) => (s: Things) => { const now = hazardIn(s, id, from); return now ? fn(now, s) : null; };
  return { id, title: k.title1(e), channels: [
    { key: 'where', name: 'Where', glyph: k.glyph, read: read((e, s) => ({ kind: 'p', v: k.v(e), ids: [id], big: k.big(e), label: e.country || k.title1(e),
      map: hazardMap(k, e, hazardsIn(s, e.kind, from) ?? [], trackOf(s, e)), link: { label: seeIt(e), on: true, id, act: open(e.url) } })) },
    { key: 'alert', name: 'Alert', glyph: g.gauge, read: read((e) => ({ kind: 'p', v: (e.level + 1) / 3, ids: [id], big: word(e.alert.split(' ')[0]),
      label: e.severityText || `${e.source} alert` })) },
    { key: 'from', name: 'From you', glyph: g.pin, read: read((e) => ({ kind: 'p', v: clamp(1 - e.km / 5000), ids: [id], big: `${num(e.km, 0)} km`, label: `from ${from.place}`, map: youAnd(e, e.km, from, plotOf(k, e)) })) },
    { key: 'when', name: e.from === e.to ? 'When' : 'Since', glyph: g.clock, read: read((e) => e.from === e.to
      ? { kind: 'p', v: clamp(1 - (Date.now() - e.from) / (30 * 86_400_000)), ids: [id], big: agoText(e.from), label: `on ${day(e.from)}` }
      : { kind: 'p', v: clamp((e.to - e.from) / (30 * 86_400_000)), ids: [id], big: lasted(e.to - e.from), label: `since ${day(e.from)} · updated ${agoText(e.to)}` }) },
  ] };
}

// ─── A US volcano: what its observatory says of it ───

// The ground alert levels of the US observatories, in order: a choice ring with the one in force marked.
const GROUND = ['NORMAL', 'ADVISORY', 'WATCH', 'WARNING'];
const threatOf = (threat: string) => threat.replace(/ Threat$/i, '').toLowerCase();
// What the feeds know of a US volcano: where it is and what it is, and its latest notice.
const usInfo = (s: Things, vnum: string) => ({
  info: (s.get('usgs.volcano-where')?.attrs.where as Record<string, UsVolcanoInfo> | undefined)?.[vnum],
  notice: s.get(`usgs.notice:${vnum}`)?.attrs as Notice | undefined,
  rated: (s.get('usgs.volcanoes')?.attrs.list as Elevation[] | undefined)?.find((v) => v.vnum === vnum),
});
// A volcano on its own: what it is doing (its picture, the notice's line), its
// alert level among the four, its summit and how dangerous it is, where it is,
// how far from you, and when the observatory last wrote.
export function usVolcanoObject(s: Things, id: string, from: Where): System | null {
  const vnum = id.slice('usgs:VO:'.length), first = hazardIn(s, id, from);
  if (!first) return null;
  type Now = { e: Hazard; info?: UsVolcanoInfo; notice?: Notice; rated?: Elevation };
  const read = (fn: (n: Now) => Reading | null) => (st: Things) => { const e = hazardIn(st, id, from); return e ? fn({ e, ...usInfo(st, vnum) }) : null; };
  const k = KINDS.VO;
  return { id, title: first.name, channels: [
    { key: 'activity', name: 'Activity', glyph: g.volcano, read: read(({ e, info, notice, rated }) => {
      const image = notice?.image || info?.image;
      return { kind: 'p', v: k.v(e), ids: [id], big: word(e.alert.split(' ')[0]), label: notice?.synopsis || e.severityText,
        image: image ? { src: image, alt: t.volcanoPicture(e.name), id } : undefined,
        link: { label: t.readNotice, on: true, id, act: open(notice?.url || rated?.url || e.url) } };
    }) },
    { key: 'level', name: 'Alert level', glyph: g.gauge, read: read(({ e, rated }) => {
      const level = rated?.alertLevel ?? '', at = GROUND.indexOf(level);
      return { kind: 'c', segs: GROUND.map((x) => ({ label: word(x), on: x === level, id })), ids: [id], big: level ? word(level) : '—',
        label: `aviation ${(rated?.color ?? '').toLowerCase()} · ${e.source}`, v: at >= 0 ? (at + 1) / GROUND.length : 0 };
    }) },
    { key: 'summit', name: 'Summit', glyph: g.peak, read: read(({ e, info }) => info?.elevation == null ? null : ({ kind: 'p', v: clamp(Math.abs(info.elevation) / 5000), ids: [id],
      big: info.elevation < 0 ? t.belowSea(num(-info.elevation, 0)) : `${num(info.elevation, 0)} m`,
      label: [info.threat && t.threat(threatOf(info.threat)), e.country].filter(Boolean).join(' · ') })) },
    { key: 'where', name: 'Where', glyph: g.pin, read: read(({ e, info }) => ({ kind: 'p', v: k.v(e), ids: [id], big: e.country, label: `${num(Math.abs(e.lat), 2)}°${e.lat < 0 ? 'S' : 'N'} ${num(Math.abs(e.lon), 2)}°${e.lon < 0 ? 'W' : 'E'}`,
      map: { center: { lat: e.lat, lon: e.lon }, zoom: 10, plots: [plotOf(k, e)] }, link: info?.url ? { label: t.seeOn('USGS'), on: true, id, act: open(info.url) } : undefined })) },
    { key: 'from', name: 'From you', glyph: g.pin, read: read(({ e }) => ({ kind: 'p', v: clamp(1 - e.km / 5000), ids: [id], big: `${num(e.km, 0)} km`, label: `from ${from.place}`, map: youAnd(e, e.km, from, plotOf(k, e)) })) },
    { key: 'notice', name: 'Last notice', glyph: g.notice, read: read(({ e, notice }) => {
      const at = notice?.at ?? e.to;
      return { kind: 'p', v: clamp(1 - (Date.now() - at) / (7 * 86_400_000)), ids: [id], big: agoText(at), label: `${notice?.kind ?? 'Notice'} · ${day(at)} ${hour(at)}` };
    }) },
  ] };
}

export const systemsFor = (from: Where): System[] => [quakes, hazardSystem('TC', from), hazardSystem('FL', from), hazardSystem('WF', from), hazardSystem('VO', from)];
