// The public feeds the world is read from, each as the things it yields.
// Pure: a feed is a URL and a parser from its JSON into things (and rows of
// history where the feed carries its own past). The live source fetches them
// on their own clocks; the demo runs the same parsers over recorded answers.

import type { HistoryRow } from '@zumer/pulse';

// A thing a feed reports: a reading with its unit and whatever else the model
// wants to say about it. `changed` is when it was measured (ms since the epoch).
export type Thing = { id: string; name: string; state: string | number; unit: string; attrs: Record<string, unknown>; changed: number };
export type Things = Map<string, Thing>;
export type Parsed = { things: Thing[]; rows?: Record<string, HistoryRow[]> };
export type Where = { lat: number; lon: number; place: string };
export type Feed = { id: string; name: string; url: string; every: number; parse: (json: unknown, where: Where, now: number) => Parsed };

const MIN = 60_000;
const n = (x: unknown): number | null => { const v = typeof x === 'number' ? x : Number(x); return Number.isFinite(v) ? v : null; };
// SWPC's "YYYY-MM-DD HH:MM:SS.sss" is UTC without a zone.
const swpcTime = (s: string) => Date.parse(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));

// ─── The sun: NOAA's Space Weather Prediction Center ───

// The three scales now, yesterday and the three days ahead: G (geomagnetic),
// R (radio blackouts) and S (radiation), 0 to 5 each.
type Scales = Record<string, { DateStamp?: string; TimeStamp?: string; G?: { Scale?: string | null; Text?: string | null };
  R?: { Scale?: string | null; Text?: string | null; MinorProb?: string | null; MajorProb?: string | null }; S?: { Scale?: string | null; Text?: string | null; Prob?: string | null } }>;
export const scales: Feed = {
  id: 'scales', name: 'NOAA scales', url: 'https://services.swpc.noaa.gov/products/noaa-scales.json', every: 5 * MIN,
  parse: (json, _w, now) => {
    const s = json as Scales, cur = s['0'], next = s['1'];
    if (!cur) return { things: [] };
    const at = cur.DateStamp && cur.TimeStamp ? Date.parse(`${cur.DateStamp}T${cur.TimeStamp}Z`) : now;
    const scale = (x?: { Scale?: string | null }) => n(x?.Scale) ?? 0;
    return { things: [
      { id: 'sun.g', name: 'Geomagnetic scale', state: scale(cur.G), unit: '', attrs: { text: cur.G?.Text ?? '', tomorrow: scale(next?.G) }, changed: at },
      { id: 'sun.r', name: 'Radio blackout scale', state: scale(cur.R), unit: '', attrs: { text: cur.R?.Text ?? '', minorProb: n(next?.R?.MinorProb), majorProb: n(next?.R?.MajorProb) }, changed: at },
      { id: 'sun.s', name: 'Radiation storm scale', state: scale(cur.S), unit: '', attrs: { text: cur.S?.Text ?? '', prob: n(next?.S?.Prob) }, changed: at },
    ] };
  },
};

// The planetary K index every three hours, the last days: the header row first.
export const kp: Feed = {
  id: 'kp', name: 'Kp index', url: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', every: 15 * MIN,
  parse: (json) => {
    const rows = (json as string[][]).slice(1).map((r) => ({ at: swpcTime(r[0]), kp: n(r[1]) })).filter((r) => r.kp != null && Number.isFinite(r.at));
    const last = rows.at(-1);
    if (!last) return { things: [] };
    return { things: [{ id: 'sun.kp', name: 'Kp index', state: last.kp!, unit: '', attrs: { stations: null }, changed: last.at }],
      rows: { 'sun.kp': rows.map((r) => ({ s: String(r.kp), lu: r.at / 1000 })) } };
  },
};

// The solar wind at L1, one row a minute for a day: density, speed, temperature.
export const plasma: Feed = {
  id: 'plasma', name: 'Solar wind', url: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json', every: 5 * MIN,
  parse: (json) => {
    const rows = (json as string[][]).slice(1).map((r) => ({ at: swpcTime(r[0]), density: n(r[1]), speed: n(r[2]) })).filter((r) => r.speed != null && Number.isFinite(r.at));
    const last = rows.at(-1);
    if (!last) return { things: [] };
    return { things: [{ id: 'sun.wind', name: 'Solar wind', state: Math.round(last.speed!), unit: 'km/s', attrs: { density: last.density }, changed: last.at }],
      // One row in ten: the day ring wants hourly means, not 1,440 points.
      rows: { 'sun.wind': rows.filter((_, i) => i % 10 === 0).map((r) => ({ s: String(Math.round(r.speed!)), lu: r.at / 1000 })) } };
  },
};

// The interplanetary magnetic field: Bz south lets the wind's energy in.
export const mag: Feed = {
  id: 'mag', name: 'Magnetic field', url: 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json', every: 5 * MIN,
  parse: (json) => {
    const rows = (json as string[][]).slice(1).map((r) => ({ at: swpcTime(r[0]), bz: n(r[3]), bt: n(r[6]) })).filter((r) => r.bz != null && Number.isFinite(r.at));
    const last = rows.at(-1);
    if (!last) return { things: [] };
    return { things: [{ id: 'sun.bz', name: 'Bz', state: Math.round(last.bz! * 10) / 10, unit: 'nT', attrs: { bt: last.bt }, changed: last.at }] };
  },
};

// GOES X-ray flux, the last six hours, two bands interleaved: the long band
// (0.1 to 0.8 nm) is the one flares are classed by.
type Xray = { time_tag: string; flux: number; energy: string };
export const flareClass = (flux: number) => {
  const bands: [string, number][] = [['X', 1e-4], ['M', 1e-5], ['C', 1e-6], ['B', 1e-7], ['A', 1e-8]];
  for (const [letter, base] of bands) if (flux >= base) return `${letter}${(flux / base).toFixed(1)}`;
  return 'A0.1';
};
export const xrays: Feed = {
  id: 'xrays', name: 'X-rays', url: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json', every: 5 * MIN,
  parse: (json) => {
    const rows = (json as Xray[]).filter((r) => r.energy === '0.1-0.8nm' && n(r.flux) != null);
    const last = rows.at(-1);
    if (!last) return { things: [] };
    const peak = rows.reduce((a, r) => r.flux > a.flux ? r : a, last);
    return { things: [{ id: 'sun.xray', name: 'X-ray flux', state: last.flux, unit: 'W/m²', attrs: { class: flareClass(last.flux), peak: flareClass(peak.flux), peakAt: Date.parse(peak.time_tag) }, changed: Date.parse(last.time_tag) }] };
  },
};

// ─── The earth: USGS, every M2.5+ of the past day ───

type Quake = { properties: { mag: number | null; place: string | null; time: number; url: string; alert: string | null; sig: number; tsunami: number }; geometry: { coordinates: [number, number, number] } };
// Distance between two points on the earth, in km.
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
export const quakes: Feed = {
  id: 'quakes', name: 'Earthquakes', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', every: 2 * MIN,
  parse: (json, where, now) => {
    const list = ((json as { features?: Quake[] }).features ?? []).filter((f) => f.properties.mag != null)
      .map((f) => ({ mag: f.properties.mag!, place: f.properties.place ?? '', time: f.properties.time, url: f.properties.url, alert: f.properties.alert, tsunami: !!f.properties.tsunami,
        km: Math.round(distanceKm(where.lat, where.lon, f.geometry.coordinates[1], f.geometry.coordinates[0])), depth: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
    if (!list.length) return { things: [] };
    const byMag = [...list].sort((a, b) => b.mag - a.mag), strongest = byMag[0];
    const near = [...list].sort((a, b) => a.km - b.km)[0];
    const latest = list.reduce((a, q) => q.time > a ? q.time : a, 0);
    return { things: [
      { id: 'earth.strongest', name: 'Strongest earthquake', state: strongest.mag, unit: 'M', attrs: { ...strongest }, changed: strongest.time },
      { id: 'earth.near', name: 'Nearest earthquake', state: near.km, unit: 'km', attrs: { ...near }, changed: near.time },
      { id: 'earth.count', name: 'Earthquakes in 24 hours', state: list.length, unit: '', attrs: { strong: list.filter((q) => q.mag >= 5).length, top: byMag.slice(0, 12), latest }, changed: Math.min(now, latest) },
    ] };
  },
};

// ─── The sky over you: Open-Meteo ───

type Forecast = {
  current?: { time: string; temperature_2m?: number; relative_humidity_2m?: number; apparent_temperature?: number; precipitation?: number; weather_code?: number;
    wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number; uv_index?: number };
  hourly?: { time: string[]; temperature_2m?: (number | null)[]; precipitation_probability?: (number | null)[]; precipitation?: (number | null)[]; uv_index?: (number | null)[] };
  daily?: { time: string[]; uv_index_max?: (number | null)[]; temperature_2m_min?: (number | null)[]; temperature_2m_max?: (number | null)[] };
  utc_offset_seconds?: number;
};
export const weatherUrl = (w: Where) => `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}`
  + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index'
  + '&hourly=temperature_2m,precipitation_probability,precipitation,uv_index&daily=uv_index_max,temperature_2m_min,temperature_2m_max'
  + '&past_hours=24&forecast_hours=12&forecast_days=1&timezone=auto';
export const weather = (w: Where): Feed => ({
  id: 'weather', name: 'Weather', url: weatherUrl(w), every: 10 * MIN,
  parse: (json, _w, now) => {
    const f = json as Forecast, c = f.current;
    if (!c) return { things: [] };
    const off = (f.utc_offset_seconds ?? 0) * 1000;
    // Open-Meteo's times are local to the place, without a zone: shift them back to UTC.
    const at = (s: string) => Date.parse(`${s}:00Z`) - off;
    const measured = at(c.time);
    const hours = f.hourly?.time ?? [];
    const ahead = hours.map((h, i) => ({ at: at(h), i })).filter((h) => h.at >= measured && h.at < measured + 6 * 3_600_000);
    const prob = Math.max(0, ...ahead.map((h) => f.hourly?.precipitation_probability?.[h.i] ?? 0));
    const mm = ahead.reduce((a, h) => a + (f.hourly?.precipitation?.[h.i] ?? 0), 0);
    const uvToday = hours.map((h, i) => ({ at: at(h), uv: f.hourly?.uv_index?.[i] ?? 0 }));
    const peak = uvToday.reduce((a, h) => h.uv > a.uv ? h : a, { at: measured, uv: 0 });
    const temps = hours.map((h, i) => ({ s: String(f.hourly?.temperature_2m?.[i] ?? ''), lu: at(h) / 1000 })).filter((r) => r.s !== '' && r.lu <= now / 1000);
    const things: Thing[] = [];
    if (c.temperature_2m != null) things.push({ id: 'sky.temp', name: 'Temperature', state: c.temperature_2m, unit: '°C',
      attrs: { feels: c.apparent_temperature, humidity: c.relative_humidity_2m, code: c.weather_code, min: f.daily?.temperature_2m_min?.[0], max: f.daily?.temperature_2m_max?.[0] }, changed: measured });
    if (c.wind_speed_10m != null) things.push({ id: 'sky.wind', name: 'Wind', state: c.wind_speed_10m, unit: 'km/h', attrs: { direction: c.wind_direction_10m, gusts: c.wind_gusts_10m }, changed: measured });
    things.push({ id: 'sky.rain', name: 'Rain', state: Math.round(prob), unit: '%', attrs: { mm: Math.round(mm * 10) / 10, now: c.precipitation ?? 0 }, changed: measured });
    if (c.uv_index != null) things.push({ id: 'sky.uv', name: 'UV index', state: c.uv_index, unit: '', attrs: { max: f.daily?.uv_index_max?.[0] ?? peak.uv, peakAt: peak.at + off }, changed: measured });
    return { things, rows: { 'sky.temp': temps } };
  },
});

type Air = { current?: { time: string; european_aqi?: number; us_aqi?: number; pm2_5?: number; pm10?: number; ozone?: number }; utc_offset_seconds?: number };
export const airUrl = (w: Where) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${w.lat}&longitude=${w.lon}&current=european_aqi,us_aqi,pm2_5,pm10,ozone&timezone=auto`;
export const air = (w: Where): Feed => ({
  id: 'air', name: 'Air quality', url: airUrl(w), every: 30 * MIN,
  parse: (json) => {
    const a = json as Air, c = a.current;
    if (!c || c.european_aqi == null) return { things: [] };
    const measured = Date.parse(`${c.time}:00Z`) - (a.utc_offset_seconds ?? 0) * 1000;
    return { things: [{ id: 'sky.air', name: 'Air quality', state: c.european_aqi, unit: 'AQI', attrs: { us: c.us_aqi, pm25: c.pm2_5, pm10: c.pm10, ozone: c.ozone }, changed: measured }] };
  },
});

// ─── The services you depend on: Statuspage's public summary ───

// The status pages known by a short name; any other host works as `?services=status.example.com`.
export const STATUS_PAGES: Record<string, { name: string; host: string }> = {
  github: { name: 'GitHub', host: 'www.githubstatus.com' },
  cloudflare: { name: 'Cloudflare', host: 'www.cloudflarestatus.com' },
  openai: { name: 'OpenAI', host: 'status.openai.com' },
  npm: { name: 'npm', host: 'status.npmjs.org' },
  vercel: { name: 'Vercel', host: 'www.vercel-status.com' },
  atlassian: { name: 'Atlassian', host: 'status.atlassian.com' },
  digitalocean: { name: 'DigitalOcean', host: 'status.digitalocean.com' },
  figma: { name: 'Figma', host: 'status.figma.com' },
  discord: { name: 'Discord', host: 'discordstatus.com' },
  reddit: { name: 'Reddit', host: 'www.redditstatus.com' },
  twilio: { name: 'Twilio', host: 'status.twilio.com' },
  dropbox: { name: 'Dropbox', host: 'status.dropbox.com' },
  zoom: { name: 'Zoom', host: 'status.zoom.us' },
};
export const DEFAULT_SERVICES = ['github', 'cloudflare', 'openai', 'npm', 'vercel'];
export type Service = { slug: string; name: string; host: string };
export const serviceOf = (key: string): Service => {
  const known = STATUS_PAGES[key.toLowerCase()];
  if (known) return { slug: key.toLowerCase(), ...known };
  const host = key.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return { slug: host.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), name: host.replace(/^(www|status)\./, '').replace(/status\.?/, '').replace(/\.[a-z]+$/, '') || host, host };
};

type Summary = {
  page?: { name?: string; url?: string; updated_at?: string };
  status?: { indicator?: string; description?: string };
  components?: { id: string; name: string; status: string; group_id?: string | null; group?: boolean; showcase?: boolean; only_show_if_degraded?: boolean; position?: number; updated_at?: string }[];
  incidents?: { id: string; name: string; status: string; impact: string; shortlink?: string; created_at: string; updated_at: string; incident_updates?: { body: string; status: string; created_at: string }[] }[];
  scheduled_maintenances?: { id: string; name: string; status: string; shortlink?: string; scheduled_for?: string }[];
};
export type Component = { name: string; status: string; at: number };
export type Incident = { name: string; status: string; impact: string; url: string; at: number; body: string };
export const status = (s: Service): Feed => ({
  id: `status:${s.slug}`, name: s.name, url: `https://${s.host}/api/v2/summary.json`, every: 2 * MIN,
  parse: (json, _w, now) => {
    const sum = json as Summary;
    if (!sum.status) return { things: [] };
    // The components that stand for the service: the ones outside groups (a
    // group's children repeat it), the degraded ones first.
    const comps: Component[] = (sum.components ?? []).filter((c) => !c.group && !c.group_id && !c.only_show_if_degraded)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c) => ({ name: c.name, status: c.status, at: Date.parse(c.updated_at ?? '') || now }));
    const incidents: Incident[] = (sum.incidents ?? []).map((i) => {
      const last = i.incident_updates?.[0];
      return { name: i.name, status: i.status, impact: i.impact, url: i.shortlink ?? sum.page?.url ?? `https://${s.host}`, at: Date.parse(i.updated_at) || now, body: last?.body ?? '' };
    });
    const maintenance = (sum.scheduled_maintenances ?? []).filter((m) => m.status === 'in_progress').length;
    const changed = Math.max(Date.parse(sum.page?.updated_at ?? '') || 0, ...incidents.map((i) => i.at)) || now;
    return { things: [{ id: `service.${s.slug}`, name: s.name, state: sum.status.indicator ?? 'none', unit: '',
      attrs: { description: sum.status.description ?? '', url: sum.page?.url ?? `https://${s.host}`, components: comps, incidents, maintenance }, changed }] };
  },
});

// Every feed for a place and a list of services.
export const feedsFor = (where: Where, services: Service[]): Feed[] => [scales, kp, plasma, mag, xrays, quakes, weather(where), air(where), ...services.map(status)];
