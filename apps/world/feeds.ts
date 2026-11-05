// The public feeds the world's calamities are read from, each as the things
// it yields. Pure: a feed is a URL and a parser from its JSON into things. The
// live source fetches them on their own clocks; the demo runs the same parsers
// over recorded answers.

// A thing a feed reports: a reading with its unit and whatever else the model
// wants to say about it. `changed` is when it was measured (ms since the epoch).
export type Thing = { id: string; name: string; state: string | number; unit: string; attrs: Record<string, unknown>; changed: number };
export type Things = Map<string, Thing>;
export type Where = { lat: number; lon: number; place: string };
// `json` is null when the feed answered with nothing (GDACS's 204 when no event matches).
// A feed may lead to more (`then`): after it answers, each of those is asked
// once, on its clock (the notice of each volcano above normal).
export type Feed = { id: string; name: string; url: string; every: number; parse: (json: unknown, where: Where, now: number) => Thing[]; then?: (json: unknown) => Feed[] };

const MIN = 60_000, DAY = 86_400_000;
const n = (x: unknown): number | null => { const v = typeof x === 'number' ? x : Number(x); return Number.isFinite(v) ? v : null; };
// Distance between two points on the earth, in km.
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Earthquakes: USGS, every M2.5+ of the past day ───

type UsgsQuake = { properties: { mag: number | null; place: string | null; time: number; url: string; alert: string | null; sig: number; tsunami: number }; geometry: { coordinates: [number, number, number] } };
export const quakes: Feed = {
  id: 'quakes', name: 'Earthquakes', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', every: 2 * MIN,
  parse: (json, where, now) => {
    const list = ((json as { features?: UsgsQuake[] } | null)?.features ?? []).filter((f) => f.properties.mag != null)
      .map((f) => ({ mag: f.properties.mag!, place: f.properties.place ?? '', time: f.properties.time, url: f.properties.url, alert: f.properties.alert, tsunami: !!f.properties.tsunami,
        km: Math.round(distanceKm(where.lat, where.lon, f.geometry.coordinates[1], f.geometry.coordinates[0])), depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
    if (!list.length) return [];
    const byMag = [...list].sort((a, b) => b.mag - a.mag), strongest = byMag[0];
    const near = [...list].sort((a, b) => a.km - b.km)[0];
    const latest = list.reduce((a, q) => q.time > a ? q.time : a, 0);
    return [
      { id: 'quakes.strongest', name: 'Strongest earthquake', state: strongest.mag, unit: 'M', attrs: { ...strongest }, changed: strongest.time },
      { id: 'quakes.near', name: 'Nearest earthquake', state: near.km, unit: 'km', attrs: { ...near, from: where }, changed: near.time },
      { id: 'quakes.count', name: 'Earthquakes in 24 hours', state: list.length, unit: '', attrs: { strong: list.filter((q) => q.mag >= 5).length, top: byMag.slice(0, 12), latest }, changed: Math.min(now, latest) },
    ];
  },
};

// ─── Cyclones, floods, wildfires and eruptions: GDACS ───

// The Global Disaster Alert and Coordination System (the UN and the European
// Commission) rates every event green, orange or red by its likely
// humanitarian impact: how strong it is and how many people live where it
// strikes. These are the hazards it rates that USGS does not already cover.
export type HazardKind = 'TC' | 'FL' | 'WF' | 'VO';
// One event of a hazard: where it is, how bad, since when, its page.
// `level` is the alert: 0 green (or a volcano's yellow), 1 orange, 2 red.
export type Hazard = {
  id: string; kind: HazardKind; name: string; country: string; level: 0 | 1 | 2; alert: string;
  severity: number; severityText: string; unit: string; lat: number; lon: number; from: number; to: number; km: number; url: string; source: string;
};
type GdacsFeature = {
  geometry?: { coordinates?: [number, number] };
  properties: { eventtype: string; eventid: number; episodeid: number; eventname?: string; name?: string; country?: string; alertlevel?: string; iscurrent?: string;
    fromdate: string; todate: string; severitydata?: { severity?: number; severitytext?: string; severityunit?: string }; url?: { report?: string } };
};
const GDACS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
const LEVEL: Record<string, 0 | 1 | 2> = { Green: 0, Orange: 1, Red: 2 };
// GDACS writes UTC without a zone.
const gdacsTime = (s: string) => Date.parse(/Z|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
// An eruption is a moment GDACS never keeps current: the ones of the past `days` count instead.
export const gdacs = (kind: HazardKind, name: string, every: number, days?: number): Feed => ({
  id: `gdacs:${kind}`, name, every, url: `${GDACS}?eventlist=${kind}&alertlevel=Green;Orange;Red`,
  parse: (json, where, now) => {
    const features = (json as { features?: GdacsFeature[] } | null)?.features ?? [];
    const events: Hazard[] = features
      .filter((f) => f.properties.eventtype === kind && (days ? gdacsTime(f.properties.todate) >= now - days * DAY : f.properties.iscurrent === 'true'))
      .flatMap((f): Hazard[] => {
        const lon = n(f.geometry?.coordinates?.[0]), lat = n(f.geometry?.coordinates?.[1]);
        if (lat == null || lon == null) return [];
        const p = f.properties, sev = p.severitydata ?? {}, said = (sev.severitytext ?? '').trim();
        return [{ id: `gdacs:${kind}:${p.eventid}`, kind, name: (p.name ?? p.eventname ?? '').replace(/\s+/g, ' ').trim(), country: p.country ?? '',
          level: LEVEL[p.alertlevel ?? ''] ?? 0, alert: p.alertlevel ?? 'Green', severity: n(sev.severity) ?? 0, severityText: /^Magnitude 0$/.test(said) ? '' : said, unit: sev.severityunit ?? '',
          lat, lon, from: gdacsTime(p.fromdate), to: gdacsTime(p.todate), km: Math.round(distanceKm(where.lat, where.lon, lat, lon)),
          url: p.url?.report ?? `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=${kind}`, source: 'GDACS' }];
      });
    return [{ id: `gdacs.${kind}`, name, state: events.length, unit: '', attrs: { events }, changed: events.reduce((a, e) => Math.max(a, e.to), 0) || now }];
  },
});

// ─── A cyclone's track: NASA's Earth Observatory Natural Event Tracker ───

// EONET follows the open storms from the warning centers, a point every six
// hours with the wind in knots: the path the cyclone took, which GDACS's list
// does not carry. Matched to GDACS's cyclones by name.
export type TrackPoint = { lat: number; lon: number; at: number; kts: number | null };
type EonetEvent = { id: string; title: string; link?: string; geometry?: { date: string; type: string; coordinates: [number, number]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[] };
// "Super Typhoon In-fa", "Tropical Cyclone Murasu", "IN-FA-26": the storm's own name, in a form both sides share.
export const stormKey = (name: string) => name.toLowerCase().replace(/^(super\s+)?(tropical\s+(cyclone|storm|depression)|typhoon|hurricane|cyclone)\s+/, '').replace(/-\d\d$/, '').replace(/[^a-z]/g, '');
export const tracks: Feed = {
  id: 'tracks', name: 'Storm tracks', url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=open', every: 30 * MIN,
  parse: (json, _w, now) => {
    const byStorm: Record<string, TrackPoint[]> = {};
    for (const e of (json as { events?: EonetEvent[] } | null)?.events ?? []) {
      const points = (e.geometry ?? []).filter((g) => g.type === 'Point').map((g) => ({ lat: g.coordinates[1], lon: g.coordinates[0], at: Date.parse(g.date), kts: n(g.magnitudeValue) }));
      if (points.length) byStorm[stormKey(e.title)] = points;
    }
    return [{ id: 'eonet.tracks', name: 'Storm tracks', state: Object.keys(byStorm).length, unit: '', attrs: { tracks: byStorm }, changed: now }];
  },
};

// ─── Volcanoes: the USGS Volcano Hazards Program ───

// The US observatories (Alaska, Hawaii, the Cascades, the Marianas) rate each
// volcano by the aviation color code and a ground alert level; this is the
// list of the ones above normal. It names the volcano, not where it is: the
// list of US volcanoes says that.
type Elevated = { volcano_name: string; vnum: string; color_code: string; alert_level: string; sent_unixtime: number; notice_url?: string; notice_data?: string; obs_fullname?: string; obs_abbr?: string };
export type Elevation = { vnum: string; name: string; color: string; alertLevel: string; at: number; url: string; observatory: string };
export const elevated: Feed = {
  id: 'hans', name: 'US volcanoes', url: 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes', every: 10 * MIN,
  parse: (json, _w, now) => {
    const list: Elevation[] = ((json as Elevated[] | null) ?? []).map((v) => ({ vnum: String(v.vnum), name: v.volcano_name, color: (v.color_code ?? '').toUpperCase(), alertLevel: (v.alert_level ?? '').toUpperCase(),
      at: (n(v.sent_unixtime) ?? now / 1000) * 1000, url: v.notice_url ?? 'https://volcanoes.usgs.gov/hans-public/', observatory: v.obs_fullname ?? v.obs_abbr ?? 'USGS' }));
    return [{ id: 'usgs.volcanoes', name: 'US volcanoes above normal', state: list.length, unit: '', attrs: { list }, changed: list.reduce((a, v) => Math.max(a, v.at), 0) || now }];
  },
  // The latest notice of each: what the observatory says the volcano is doing.
  then: (json) => ((json as Elevated[] | null) ?? []).filter((v) => v.notice_data).map((v) => notice(String(v.vnum), v.volcano_name, v.notice_data!)),
};

// A notice of an observatory (a daily or weekly update, an alert): what a
// volcano is doing, in a line (the synopsis) and in a paragraph (the summary).
// A notice may cover several volcanoes, a section each: this volcano's.
export type Notice = { kind: string; synopsis: string; summary: string; at: number; url: string; image: string };
type NoticeJson = { notice_type?: string; sent_unixtime?: number; notice_url?: string;
  notice_sections?: { vnum?: string | null; synopsis?: string; summary?: string; vImage?: string | null }[] };
// HTML to words: the tags out, the entities read, the spaces folded.
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
export const notice = (vnum: string, name: string, url: string): Feed => ({
  id: `notice:${vnum}`, name: `${name}'s notice`, url, every: 10 * MIN,
  parse: (json, _w, now) => {
    const j = json as NoticeJson | null, sections = j?.notice_sections ?? [];
    const sec = sections.find((x) => String(x.vnum ?? '') === vnum) ?? sections[0];
    if (!j || !sec) return [];
    // "HVO Kilauea ORANGE/WATCH - Lava flows continue…": the words after the dash.
    const synopsis = words(sec.synopsis ?? '').replace(/^.*?\b[A-Z]+\/[A-Z]+\s+-\s+/, '');
    const it: Notice = { kind: j.notice_type ?? 'Notice', synopsis, summary: words(sec.summary ?? '').replace(/^Overview:\s*/, ''),
      at: (n(j.sent_unixtime) ?? now / 1000) * 1000, url: j.notice_url ?? '', image: sec.vImage ?? '' };
    return [{ id: `usgs.notice:${vnum}`, name: `${name}'s notice`, state: it.kind, unit: '', attrs: { ...it }, changed: it.at }];
  },
});

// Where each US volcano is, and what it is: how high, how dangerous by the
// national early warning system (NVEWS: very low to very high threat), its
// picture and its page.
export type UsVolcanoInfo = { lat: number; lon: number; region: string; url: string; elevation: number | null; threat: string; image: string };
type UsVolcano = { vnum: string; volcano_name: string; latitude: number; longitude: number; region?: string; volcano_url?: string; elevation_meters?: number; nvews_threat?: string; volcano_image_url?: string };
export const usVolcanoes: Feed = {
  id: 'hans-where', name: 'Where the US volcanoes are', url: 'https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes', every: 24 * 60 * MIN,
  parse: (json, _w, now) => {
    const where: Record<string, UsVolcanoInfo> = {};
    for (const v of (json as UsVolcano[] | null) ?? []) {
      const lat = n(v.latitude), lon = n(v.longitude);
      if (lat != null && lon != null) where[String(v.vnum)] = { lat, lon, region: v.region ?? '', url: v.volcano_url ?? '', elevation: n(v.elevation_meters), threat: v.nvews_threat ?? '', image: v.volcano_image_url ?? '' };
    }
    return [{ id: 'usgs.volcano-where', name: 'Where the US volcanoes are', state: Object.keys(where).length, unit: '', attrs: { where }, changed: now }];
  },
};

// Every feed: the things for a place.
export const FEEDS: Feed[] = [
  quakes,
  gdacs('TC', 'Tropical cyclones', 10 * MIN),
  gdacs('FL', 'Floods', 30 * MIN),
  gdacs('WF', 'Wildfires', 30 * MIN),
  gdacs('VO', 'Eruptions', 30 * MIN, 30),
  tracks, elevated, usVolcanoes,
];
