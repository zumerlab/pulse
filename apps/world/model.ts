import { num, type Alert, type Reading, type Seg } from '@zumer/pulse';
import type { Component, Incident, Service, Thing, Things } from './feeds.ts';
import type { Act } from './source.ts';
import { t } from './strings.ts';

// Every channel is read from the things the feeds report: there is no
// hand-written state. The sun's alerts are NOAA's own scales; the earth's are
// magnitudes; the sky's are thresholds anyone would set; a service's is its
// status page's indicator. Nothing out there takes a command: an alert is
// marked seen, or opens the incident.

export type Channel = { key: string; name: string; glyph: string; read: (s: Things) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4l1.4-1.4 M17 7l1.4-1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  wind: 'M3 8h11a3 3 0 1 0-3-3 M3 12h15a3 3 0 1 1-3 3 M3 16h8a2 2 0 1 1-2 2',
  flare: 'M13 3L5 14h6l-1 7 8-11h-6z',
  radiation: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M12 3a9 9 0 0 1 7.8 4.5l-4.3 2.5 M4.2 7.5A9 9 0 0 1 12 3v5 M12 21a9 9 0 0 1-7.8-4.5l4.3-2.5 M19.8 16.5A9 9 0 0 1 12 21v-5',
  quake: 'M3 12h3l2-6 3 12 3-9 2 5 2-2h3',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M15.5 8.5l-2 5-5 2 2-5z',
  rain: 'M7 15a5 5 0 0 1 1-9.9A6 6 0 0 1 19 7a4 4 0 0 1 0 8 M8 18l-1 3 M12 18l-1 3 M16 18l-1 3',
  uv: 'M12 3v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 7l1.4-1.4 M12 8a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4 M4 16h16 M6 20h12',
  air: 'M4 10h9a2.5 2.5 0 1 0-2.5-2.5 M4 14h13a2.5 2.5 0 1 1-2.5 2.5 M4 18h6',
  cloud: 'M7 18a5 5 0 0 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const n = (x: unknown) => (typeof x === 'number' ? x : Number(x));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const attr = <T = unknown>(th: Thing, k: string) => th.attrs[k] as T | undefined;
// The alert's key is its label: the value in `big` drifts (the solar wind, a temperature), the alert stays the same.
const got = (level: 1 | 2, big: string, label: string, why: string): Alert => ({ level, big, label, why, key: label, verb: t.gotIt, acts: [] });
const open = (url: string): Act => ({ ids: [], kind: 'open', url });
// "3 h ago", "20 min ago", for a moment in the past.
export const agoText = (at: number, now = Date.now()) => {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  return min < 60 ? `${min} min ago` : min < 48 * 60 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} d ago`;
};
export const compass = (deg: number) => t.compass[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
const hour = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// A NOAA scale (0 to 5) as an alert: 1 and 2 call softly, 3 and up loudly.
const scaleAlert = (level: number, names: string[], whys: string[], label: string): Alert | undefined =>
  level >= 3 ? got(2, names[level].split(' ')[0], label, whys[level]) : level >= 1 ? got(1, names[level].split(' ')[0], label, whys[level]) : undefined;

export const sun: System = { id: 'sun', title: 'Sun', channels: [
  { key: 'storm', name: 'Geomagnetic', glyph: g.sun, read: (s) => {
    const kp = s.get('sun.kp'), scale = s.get('sun.g');
    if (!kp || !isNum(kp.state)) return null;
    const G = scale && isNum(scale.state) ? scale.state : kp.state >= 5 ? Math.min(5, Math.floor(kp.state) - 4) : 0;
    return { kind: 'p', v: clamp(kp.state / 9), ids: scale ? ['sun.kp', 'sun.g'] : ['sun.kp'], big: `Kp ${num(kp.state, 1)}`, history: 'sun.kp',
      label: G ? t.gScale[G] : scale && n(attr(scale, 'tomorrow')) >= 1 ? `${t.quiet} · ${t.gScale[n(attr(scale, 'tomorrow'))]} expected` : `${t.quiet} · no storm`,
      alert: scaleAlert(G, t.gScale, t.gWhy, 'geomagnetic') };
  } },
  { key: 'wind', name: 'Solar wind', glyph: g.wind, read: (s) => {
    const w = s.get('sun.wind'), bz = s.get('sun.bz');
    if (!w || !isNum(w.state)) return null;
    const speed = w.state, density = attr<number>(w, 'density'), south = bz && isNum(bz.state) ? bz.state : null;
    return { kind: 'p', v: clamp((speed - 250) / 550), ids: bz ? ['sun.wind', 'sun.bz'] : ['sun.wind'], big: `${num(speed, 0)} km/s`, history: 'sun.wind',
      label: `${density != null ? `${num(density, 1)} p/cm³` : 'at L1'}${south != null ? ` · Bz ${num(south, 1)} nT` : ''}`,
      alert: speed >= 600 ? got(1, `${num(speed, 0)} km/s`, 'solar wind', t.fastWind(Math.round(speed)))
        : south != null && south <= -10 ? got(1, `Bz ${num(south, 0)}`, 'southward', t.bzSouth(Math.round(south))) : undefined };
  } },
  { key: 'flares', name: 'X-rays', glyph: g.flare, read: (s) => {
    const x = s.get('sun.xray'), scale = s.get('sun.r');
    if (!x || !isNum(x.state)) return null;
    const R = scale && isNum(scale.state) ? scale.state : 0, cls = String(attr(x, 'class') ?? '');
    const minor = scale ? attr<number | null>(scale, 'minorProb') : null;
    return { kind: 'p', v: clamp((Math.log10(Math.max(x.state, 1e-9)) + 8) / 5), ids: scale ? ['sun.xray', 'sun.r'] : ['sun.xray'], big: cls,
      label: R ? t.rScale[R] : `${t.quiet} · peak ${String(attr(x, 'peak') ?? cls)} in 6 h${minor != null ? ` · R1+ ${minor}% tomorrow` : ''}`,
      alert: scaleAlert(R, t.rScale, t.rWhy, 'radio blackout') };
  } },
  { key: 'radiation', name: 'Radiation', glyph: g.radiation, read: (s) => {
    const scale = s.get('sun.s');
    if (!scale || !isNum(scale.state)) return null;
    const S = scale.state, prob = attr<number | null>(scale, 'prob');
    return { kind: 'p', v: clamp(S / 5), ids: ['sun.s'], big: S ? `S${S}` : 'S0', label: S ? t.sScale[S] : `${t.quiet}${prob != null ? ` · S1+ ${prob}% tomorrow` : ''}`,
      alert: scaleAlert(S, t.sScale, t.sWhy, 'radiation storm') };
  } },
] };

type Quake = { mag: number; place: string; time: number; url: string; alert: string | null; tsunami: boolean; km: number; depth: number };
const quakeSeg = (q: Quake): Seg => ({ label: `M ${num(q.mag, 1)} · ${q.place} · ${agoText(q.time)}`, on: q.mag >= 5, id: `quake:${q.time}`, act: open(q.url) });

export const earth: System = { id: 'earth', title: 'Earth', channels: [
  { key: 'strongest', name: 'Strongest', glyph: g.quake, read: (s) => {
    const th = s.get('earth.strongest'), count = s.get('earth.count');
    if (!th || !isNum(th.state)) return null;
    const q = th.attrs as unknown as Quake, top = (count ? attr<Quake[]>(count, 'top') : undefined) ?? [];
    const level = q.mag >= 7 || q.alert === 'red' || q.alert === 'orange' ? 2 : q.mag >= 6 || q.alert === 'yellow' ? 1 : 0;
    return { kind: 'p', v: clamp(q.mag / 9), ids: count ? ['earth.strongest', 'earth.count'] : ['earth.strongest'], big: `M ${num(q.mag, 1)}`,
      label: `${q.place} · ${agoText(q.time)}`, list: top.map(quakeSeg),
      alert: level ? { level, big: `M ${num(q.mag, 1)}`, label: q.place, key: `quake:${q.time}`, why: t.quakeWhy(num(q.mag, 1), q.place, agoText(q.time)) + (q.tsunami ? ' · tsunami watch' : ''),
        verb: 'See it on USGS', acts: [open(q.url)] } : undefined };
  } },
  { key: 'near', name: 'Nearest', glyph: g.pin, read: (s) => {
    const th = s.get('earth.near');
    if (!th || !isNum(th.state)) return null;
    const q = th.attrs as unknown as Quake;
    const level = q.km <= 150 && q.mag >= 5.5 ? 2 : q.km <= 300 && q.mag >= 4.5 ? 1 : 0;
    return { kind: 'p', v: clamp(1 - q.km / 3000), ids: ['earth.near'], big: `${num(q.km, 0)} km`, label: `M ${num(q.mag, 1)} · ${q.place}`,
      alert: level ? { level, big: `M ${num(q.mag, 1)}`, label: `${num(q.km, 0)} km away`, key: `quake:${q.time}`, why: t.nearQuake(num(q.mag, 1), q.km, q.place), verb: 'See it on USGS', acts: [open(q.url)] } : undefined };
  } },
  { key: 'activity', name: 'Last 24 hours', glyph: g.globe, read: (s) => {
    const th = s.get('earth.count');
    if (!th || !isNum(th.state)) return null;
    const strong = attr<number>(th, 'strong') ?? 0, top = attr<Quake[]>(th, 'top') ?? [];
    return { kind: 'p', v: clamp(th.state / 150), ids: ['earth.count'], big: `${th.state}`, label: `of M 2.5+ · ${strong} of M 5+`, list: top.map(quakeSeg) };
  } },
] };

export const sky: System = { id: 'sky', title: 'Sky', channels: [
  { key: 'temp', name: 'Temperature', glyph: g.thermo, read: (s) => {
    const th = s.get('sky.temp');
    if (!th || !isNum(th.state)) return null;
    const tC = th.state, feels = attr<number>(th, 'feels'), min = attr<number>(th, 'min'), max = attr<number>(th, 'max');
    return { kind: 'p', v: clamp((tC + 15) / 55), ids: ['sky.temp'], big: `${num(tC, 0)}°`, history: 'sky.temp',
      label: `${feels != null ? `feels ${num(feels, 0)}°` : `humidity ${attr(th, 'humidity')}%`}${min != null && max != null ? ` · ${num(min, 0)}° to ${num(max, 0)}° today` : ''}`,
      alert: tC <= 0 ? got(1, `${num(tC, 0)}°`, 'freezing', t.freezing(num(tC, 0))) : tC >= 35 ? got(1, `${num(tC, 0)}°`, 'heat', t.heat(num(tC, 0))) : undefined };
  } },
  { key: 'wind', name: 'Wind', glyph: g.compass, read: (s) => {
    const th = s.get('sky.wind');
    if (!th || !isNum(th.state)) return null;
    const speed = th.state, dir = attr<number>(th, 'direction'), gusts = attr<number>(th, 'gusts');
    return { kind: 'p', v: clamp(speed / 80), ids: ['sky.wind'], big: `${num(speed, 0)} km/h`, bearing: dir,
      label: `${dir != null ? `from the ${compass(dir)}` : 'wind'}${gusts != null ? ` · gusts ${num(gusts, 0)}` : ''}`,
      alert: gusts != null && gusts >= 90 ? got(2, `${num(gusts, 0)} km/h`, 'gusts', t.gusts(num(gusts, 0)))
        : gusts != null && gusts >= 60 ? got(1, `${num(gusts, 0)} km/h`, 'gusts', t.gusts(num(gusts, 0))) : undefined };
  } },
  { key: 'rain', name: 'Rain', glyph: g.rain, read: (s) => {
    const th = s.get('sky.rain');
    if (!th || !isNum(th.state)) return null;
    const prob = th.state, mm = attr<number>(th, 'mm') ?? 0, falling = attr<number>(th, 'now') ?? 0;
    return { kind: 'p', v: clamp(prob / 100), ids: ['sky.rain'], big: falling > 0 ? `${num(falling, 1)} mm` : `${num(prob, 0)}%`,
      label: falling > 0 ? 'raining now' : `in the next 6 hours · ${num(mm, 1)} mm`,
      alert: prob >= 80 && mm >= 5 ? got(1, `${num(prob, 0)}%`, 'rain', t.rainComing(prob, num(mm, 1))) : undefined };
  } },
  { key: 'uv', name: 'UV index', glyph: g.uv, read: (s) => {
    const th = s.get('sky.uv');
    if (!th || !isNum(th.state)) return null;
    const uv = th.state, max = attr<number>(th, 'max'), peakAt = attr<number>(th, 'peakAt');
    return { kind: 'p', v: clamp(uv / 11), ids: ['sky.uv'], big: `UV ${num(uv, 1)}`,
      label: `${t.uvLevel(uv)}${max != null ? ` · peak ${num(max, 1)}${peakAt ? ` at ${hour(peakAt)}` : ''}` : ''}`,
      alert: uv >= 8 ? got(1, `UV ${num(uv, 0)}`, t.uvLevel(uv), t.uvHigh(num(uv, 0))) : undefined };
  } },
  { key: 'air', name: 'Air', glyph: g.air, read: (s) => {
    const th = s.get('sky.air');
    if (!th || !isNum(th.state)) return null;
    const aqi = th.state, pm = attr<number>(th, 'pm25');
    return { kind: 'p', v: clamp(aqi / 100), ids: ['sky.air'], big: `AQI ${num(aqi, 0)}`, label: `${t.aqiLevel(aqi)}${pm != null ? ` · PM2.5 ${num(pm, 0)} µg/m³` : ''}`,
      alert: aqi >= 80 ? got(2, `AQI ${num(aqi, 0)}`, t.aqiLevel(aqi), t.airPoor(Math.round(aqi), t.aqiLevel(aqi)))
        : aqi >= 60 ? got(1, `AQI ${num(aqi, 0)}`, t.aqiLevel(aqi), t.airPoor(Math.round(aqi), t.aqiLevel(aqi))) : undefined };
  } },
] };

// One channel per status page: its components as segments (the degraded ones
// first and painted), its incidents as the alert.
export const servicesSystem = (services: Service[]): System => ({ id: 'services', title: 'Services', channels: services.map((svc) => ({
  key: svc.slug, name: svc.name, glyph: g.cloud, read: (s) => {
    const th = s.get(`service.${svc.slug}`);
    if (!th) return null;
    const indicator = String(th.state), comps = attr<Component[]>(th, 'components') ?? [], incidents = attr<Incident[]>(th, 'incidents') ?? [];
    const bad = comps.filter((c) => c.status !== 'operational');
    const ordered = [...bad, ...comps.filter((c) => c.status === 'operational')].slice(0, 8);
    const segs: Seg[] = ordered.map((c) => ({ label: `${c.name}${c.status !== 'operational' ? ` · ${t.componentStatus[c.status] ?? c.status}` : ''}`, on: c.status === 'operational', id: `${th.id}#${c.name}` }));
    const level = indicator === 'major' || indicator === 'critical' ? 2 : indicator === 'minor' || bad.length ? 1 : 0;
    const inc = incidents[0];
    const why = inc ? `${inc.name}${inc.body ? `: ${inc.body.length > 160 ? `${inc.body.slice(0, 157)}…` : inc.body}` : ''}` : `${bad.map((c) => c.name).join(', ')} ${bad.length === 1 ? 'is' : 'are'} ${bad.length === 1 ? t.componentStatus[bad[0].status] ?? bad[0].status : 'not operational'}`;
    return { kind: 's', segs, ids: [th.id], big: t.indicator[indicator] ?? String(attr(th, 'description') ?? indicator),
      label: inc ? `${inc.name} · ${inc.status}` : `${comps.length} ${comps.length === 1 ? 'component' : 'components'} operational`,
      alert: level ? { level, big: t.indicator[indicator] ?? 'Degraded', label: inc?.name ?? svc.name, key: inc ? `incident:${inc.url}` : `components:${bad.map((c) => c.name).join(',')}`, fail: bad.map((c) => ordered.indexOf(c)).filter((i) => i >= 0), why,
        verb: inc ? t.openIncident : t.gotIt, acts: inc ? [open(inc.url)] : [] } : undefined };
  },
})) });

export const systemsFor = (services: Service[]): System[] => [sun, earth, sky, servicesSystem(services)];
