import { num, type Alert, type Reading, type Seg } from '@zumer/pulse';
import type { Act, Notification, VesselSource } from './source.ts';
import { t } from './strings.ts';

// Every channel is read from the vessel's paths: there are no hand-written
// states. A path the boat does not report leaves its channel out (no engine,
// no tanks). An alert is the server's own notification on the path when it
// raises one (its zones, an anchor watch); otherwise a threshold any skipper
// would set. The autopilot is the one thing the boat is told: a state and a
// target, PUT to their paths.

export type Channel = { key: string; name: string; glyph: string; read: (s: VesselSource) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  speed: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M15.5 8.5l-2 5-5 2 2-5z',
  depth: 'M3 6c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0 M12 9v10 M12 19l-3-3 M12 19l3-3',
  wind: 'M3 8h11a3 3 0 1 0-3-3 M3 12h15a3 3 0 1 1-3 3 M3 16h8a2 2 0 1 1-2 2',
  gauge: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l-3-5',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  battery: 'M3 8h15v8H3z M18 10h2v4h-2z M6 11v2',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  sun: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4l1.4-1.4 M17 7l1.4-1.4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  fuel: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16 M3 21h14 M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0v-7l-3-3 M7 7h6v4H7z',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  waste: 'M4 7h16 M6 7l1 13h10l1-13 M9 4h6v3H9z M10 11v6 M14 11v6',
  engine: 'M4 10h3V7h4l2 3h5v8h-5l-2 3H7v-3H4z M4 13h-2v2h2 M19 12h2',
  oil: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z M9 14a3 3 0 0 0 3 3',
  wheel: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 3v4 M12 17v4 M3 12h4 M17 12h4 M5.6 5.6l2.9 2.9 M15.5 15.5l2.9 2.9 M5.6 18.4l2.9-2.9 M15.5 8.5l2.9-2.9',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v3 M12 18v3 M3 12h3 M18 12h3',
  rudder: 'M12 3v12 M8 15h8l-2 6h-4z M12 3l4 4 M12 3L8 7',
  anchor: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 7v14 M5 13a7 7 0 0 0 14 0 M3 13h4 M17 13h4',
};

// Signal K is SI: the words a skipper reads are knots, degrees, °C, hPa, litres, bar, rpm.
export const kn = (ms: number) => ms * 1.943844;
export const deg = (rad: number) => (((rad * 180) / Math.PI) % 360 + 360) % 360;
export const relDeg = (rad: number) => { const d = ((rad * 180) / Math.PI) % 360; return d > 180 ? d - 360 : d < -180 ? d + 360 : d; };
export const rad = (d: number) => (d * Math.PI) / 180;
export const celsius = (k: number) => k - 273.15;
export const hpa = (pa: number) => pa / 100;
export const bar = (pa: number) => pa / 100_000;
export const litres = (m3: number) => m3 * 1000;
export const rpm = (hz: number) => hz * 60;
export const lph = (m3s: number) => m3s * 3_600_000;
export const compass = (d: number) => t.compass[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const numAt = (s: VesselSource, path: string): number | null => { const v = s.values.get(path)?.value; return typeof v === 'number' && Number.isFinite(v) ? v : null; };
const strAt = (s: VesselSource, path: string): string | null => { const v = s.values.get(path)?.value; return typeof v === 'string' ? v : null; };
const first = (s: VesselSource, prefix: string, leaf: string) => [...s.values.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(leaf)).sort()[0];
const nameOf = (s: VesselSource, path: string, fallback: string) => s.meta.get(path)?.displayName ?? s.meta.get(path.replace(/\.[^.]+$/, ''))?.displayName ?? fallback;
const put = (path: string, value: unknown): Act => ({ ids: [path], kind: 'put', path, value });
const got = (level: 1 | 2, big: string, label: string, why: string): Alert => ({ level, big, label, why, verb: t.gotIt, acts: [] });

// The server's notification on a path as the channel's alert: alert and warn
// call softly, alarm and emergency loudly; normal is no alert.
const LEVEL: Record<string, 1 | 2 | undefined> = { alert: 1, warn: 1, alarm: 2, emergency: 2 };
export const noteAt = (s: VesselSource, path: string): Notification | null => {
  const v = s.values.get(`notifications.${path}`)?.value as Notification | null | undefined;
  return v && typeof v === 'object' && typeof v.state === 'string' ? v : null;
};
const noteAlert = (s: VesselSource, path: string, big: string, label: string): Alert | undefined => {
  const n = noteAt(s, path), level = n && LEVEL[n.state];
  return level ? got(level, big, label, n!.message ?? label) : undefined;
};

export const navigation: System = { id: 'navigation', title: 'Navigation', channels: [
  { key: 'speed', name: 'Speed', glyph: g.speed, read: (s) => {
    const sog = numAt(s, 'navigation.speedOverGround');
    if (sog == null) return null;
    const cog = numAt(s, 'navigation.courseOverGroundTrue'), stw = numAt(s, 'navigation.speedThroughWater');
    return { kind: 'p', v: clamp(kn(sog) / 15), ids: cog != null ? ['navigation.speedOverGround', 'navigation.courseOverGroundTrue'] : ['navigation.speedOverGround'],
      big: `${num(kn(sog), 1)} kn`, bearing: cog != null ? deg(cog) : undefined, history: 'navigation.speedOverGround',
      label: `${cog != null ? `course ${num(deg(cog), 0)}°` : 'over ground'}${stw != null ? ` · ${num(kn(stw), 1)} kn through water` : ''}`,
      alert: noteAlert(s, 'navigation.speedOverGround', `${num(kn(sog), 1)} kn`, 'speed') };
  } },
  { key: 'heading', name: 'Heading', glyph: g.compass, read: (s) => {
    const mag = numAt(s, 'navigation.headingMagnetic'), tru = numAt(s, 'navigation.headingTrue');
    const h = mag ?? tru;
    if (h == null) return null;
    const cog = numAt(s, 'navigation.courseOverGroundTrue');
    return { kind: 'p', v: 0, ids: [mag != null ? 'navigation.headingMagnetic' : 'navigation.headingTrue'], big: `${num(deg(h), 0)}°`, bearing: deg(h),
      label: `${mag != null ? 'magnetic' : 'true'}${cog != null ? ` · course ${num(deg(cog), 0)}°` : ''}` };
  } },
  { key: 'depth', name: 'Depth', glyph: g.depth, read: (s) => {
    const path = ['environment.depth.belowTransducer', 'environment.depth.belowKeel', 'environment.depth.belowSurface'].find((p) => numAt(s, p) != null);
    if (!path) return null;
    const d = numAt(s, path)!;
    const where = path.endsWith('Keel') ? 'below the keel' : path.endsWith('Surface') ? 'below the surface' : 'below the transducer';
    return { kind: 'p', v: clamp(d / 20), ids: [path], big: `${num(d, 1)} m`, label: where, history: path,
      alert: noteAlert(s, path, `${num(d, 1)} m`, 'depth') ?? (d <= 1.5 ? got(2, `${num(d, 1)} m`, 'shallow', t.shallow(num(d, 1))) : d <= 3 ? got(1, `${num(d, 1)} m`, 'shallow', t.shallow(num(d, 1))) : undefined) };
  } },
] };

export const wind: System = { id: 'wind', title: 'Wind', channels: [
  { key: 'apparent', name: 'Apparent wind', glyph: g.wind, read: (s) => {
    const speed = numAt(s, 'environment.wind.speedApparent'), angle = numAt(s, 'environment.wind.angleApparent');
    if (speed == null) return null;
    const k = kn(speed), a = angle != null ? relDeg(angle) : null;
    return { kind: 'p', v: clamp(k / 40), ids: angle != null ? ['environment.wind.speedApparent', 'environment.wind.angleApparent'] : ['environment.wind.speedApparent'],
      big: `${num(k, 1)} kn`, bearing: a ?? undefined, history: 'environment.wind.speedApparent',
      label: a != null ? `${num(Math.abs(a), 0)}° ${a < 0 ? t.port : t.starboard}` : 'apparent',
      alert: noteAlert(s, 'environment.wind.speedApparent', `${num(k, 0)} kn`, 'wind') ?? (k >= 40 ? got(2, `${num(k, 0)} kn`, 'wind', t.strongWind(num(k, 0))) : k >= 30 ? got(1, `${num(k, 0)} kn`, 'wind', t.strongWind(num(k, 0))) : undefined) };
  } },
  { key: 'true', name: 'True wind', glyph: g.wind, read: (s) => {
    const speed = numAt(s, 'environment.wind.speedTrue') ?? numAt(s, 'environment.wind.speedOverGround');
    if (speed == null) return null;
    const dir = numAt(s, 'environment.wind.directionTrue'), angle = numAt(s, 'environment.wind.angleTrueWater');
    const ids = ['environment.wind.speedTrue', dir != null ? 'environment.wind.directionTrue' : angle != null ? 'environment.wind.angleTrueWater' : ''].filter(Boolean);
    return { kind: 'p', v: clamp(kn(speed) / 40), ids, big: `${num(kn(speed), 1)} kn`, bearing: dir != null ? deg(dir) : angle != null ? relDeg(angle) : undefined,
      label: dir != null ? `from the ${compass(deg(dir))}` : angle != null ? `${num(Math.abs(relDeg(angle)), 0)}° ${relDeg(angle) < 0 ? t.port : t.starboard}` : 'true' };
  } },
  { key: 'pressure', name: 'Barometer', glyph: g.gauge, read: (s) => {
    const p = numAt(s, 'environment.outside.pressure');
    if (p == null) return null;
    return { kind: 'p', v: clamp((hpa(p) - 950) / 100), ids: ['environment.outside.pressure'], big: `${num(hpa(p), 0)} hPa`, label: 'outside', history: 'environment.outside.pressure',
      alert: noteAlert(s, 'environment.outside.pressure', `${num(hpa(p), 0)} hPa`, 'barometer') };
  } },
  { key: 'temperature', name: 'Temperature', glyph: g.thermo, read: (s) => {
    const water = numAt(s, 'environment.water.temperature'), air = numAt(s, 'environment.outside.temperature');
    if (water == null && air == null) return null;
    const main = water ?? air!;
    return { kind: 'p', v: clamp((celsius(main) + 5) / 40), ids: [water != null ? 'environment.water.temperature' : '', air != null ? 'environment.outside.temperature' : ''].filter(Boolean),
      big: `${num(celsius(main), 0)}°`, label: water != null ? `water${air != null ? ` · air ${num(celsius(air), 0)}°` : ''}` : 'air', history: water != null ? 'environment.water.temperature' : 'environment.outside.temperature' };
  } },
] };

export const electrical: System = { id: 'electrical', title: 'Electrical', channels: [
  { key: 'house', name: 'House battery', glyph: g.battery, read: (s) => {
    const base = numAt(s, 'electrical.batteries.house.capacity.stateOfCharge') != null ? 'electrical.batteries.house' : first(s, 'electrical.batteries.', '.capacity.stateOfCharge')?.replace(/\.capacity\.stateOfCharge$/, '');
    if (!base) return null;
    const soc = numAt(s, `${base}.capacity.stateOfCharge`)!, v = numAt(s, `${base}.voltage`), a = numAt(s, `${base}.current`), left = numAt(s, `${base}.capacity.timeRemaining`);
    const pct = soc * 100, charging = a != null && a > 0.5;
    return { kind: 'p', v: clamp(soc), ids: [`${base}.capacity.stateOfCharge`, v != null ? `${base}.voltage` : '', a != null ? `${base}.current` : ''].filter(Boolean), big: `${num(pct, 0)}%`, history: `${base}.capacity.stateOfCharge`,
      name: nameOf(s, `${base}.capacity.stateOfCharge`, 'House battery'),
      label: `${v != null ? `${num(v, 1)} V` : ''}${a != null ? ` · ${num(Math.abs(a), 1)} A ${charging ? 'charging' : 'draining'}` : ''}${!charging && left != null ? ` · ${num(left / 3600, 1)} h left` : ''}`.replace(/^ · /, ''),
      alert: noteAlert(s, `${base}.capacity.stateOfCharge`, `${num(pct, 0)}%`, 'battery') ?? (pct <= 15 ? got(2, `${num(pct, 0)}%`, 'battery', t.batteryLow(num(pct, 0))) : pct <= 30 ? got(1, `${num(pct, 0)}%`, 'battery', t.batteryLow(num(pct, 0))) : undefined) };
  } },
  { key: 'start', name: 'Engine battery', glyph: g.bolt, read: (s) => {
    const base = ['electrical.batteries.start', 'electrical.batteries.engine'].find((b) => numAt(s, `${b}.voltage`) != null);
    if (!base) return null;
    const v = numAt(s, `${base}.voltage`)!, a = numAt(s, `${base}.current`);
    return { kind: 'p', v: clamp((v - 11) / 3.5), ids: [`${base}.voltage`], big: `${num(v, 1)} V`, label: a != null ? `${num(a, 1)} A` : 'engine battery', history: `${base}.voltage`,
      alert: noteAlert(s, `${base}.voltage`, `${num(v, 1)} V`, 'engine battery') ?? (v < 12 ? got(1, `${num(v, 1)} V`, 'engine battery', t.batteryWeak(num(v, 1))) : undefined) };
  } },
  { key: 'solar', name: 'Solar', glyph: g.sun, read: (s) => {
    const paths = [...s.values.keys()].filter((p) => /^electrical\.solar\.[^.]+\.panelPower$/.test(p));
    if (!paths.length) return null;
    const w = paths.reduce((a, p) => a + (numAt(s, p) ?? 0), 0);
    return { kind: 'p', v: clamp(w / 400), ids: paths, big: `${num(w, 0)} W`, label: paths.length === 1 ? 'from the panels' : `from ${paths.length} arrays`, history: paths[0] };
  } },
] };

const tank = (key: string, type: string, name: string, glyph: string, full: boolean): Channel => ({ key, name, glyph, read: (s) => {
  const level = first(s, `tanks.${type}.`, '.currentLevel');
  if (!level) return null;
  const base = level.replace(/\.currentLevel$/, ''), ratio = numAt(s, level)!, cap = numAt(s, `${base}.capacity`);
  const pct = ratio * 100, label = nameOf(s, level, name);
  const alert = noteAlert(s, level, `${num(pct, 0)}%`, label.toLowerCase())
    ?? (full ? (pct >= 95 ? got(2, `${num(pct, 0)}%`, 'full', t.tankFull(label, num(pct, 0))) : pct >= 80 ? got(1, `${num(pct, 0)}%`, 'nearly full', t.tankFull(label, num(pct, 0))) : undefined)
      : (pct <= 10 ? got(2, `${num(pct, 0)}%`, 'low', t.tankLow(label, num(pct, 0))) : pct <= 20 ? got(1, `${num(pct, 0)}%`, 'low', t.tankLow(label, num(pct, 0))) : undefined));
  return { kind: 'p', v: clamp(ratio), ids: [level], big: `${num(pct, 0)}%`, name: label, history: level,
    label: cap != null ? `${num(litres(ratio * cap), 0)} of ${num(litres(cap), 0)} L` : full ? 'full' : 'left', alert };
} });
export const tanks: System = { id: 'tanks', title: 'Tanks', channels: [
  tank('fuel', 'fuel', 'Fuel', g.fuel, false), tank('water', 'freshWater', 'Fresh water', g.drop, false), tank('waste', 'blackWater', 'Holding tank', g.waste, true),
] };

const engineBase = (s: VesselSource) => first(s, 'propulsion.', '.revolutions')?.replace(/\.revolutions$/, '');
export const engine: System = { id: 'engine', title: 'Engine', channels: [
  { key: 'rpm', name: 'Engine', glyph: g.engine, read: (s) => {
    const base = engineBase(s);
    if (!base) return null;
    const r = rpm(numAt(s, `${base}.revolutions`)!), rate = numAt(s, `${base}.fuel.rate`);
    return { kind: 'p', v: clamp(r / 4000), ids: [`${base}.revolutions`], big: r ? `${num(r, 0)} rpm` : 'Off', history: `${base}.revolutions`,
      label: r ? `${rate != null ? `${num(lph(rate), 1)} L/h` : 'running'}` : 'stopped', alert: noteAlert(s, `${base}.revolutions`, `${num(r, 0)} rpm`, 'engine') };
  } },
  { key: 'coolant', name: 'Coolant', glyph: g.thermo, read: (s) => {
    const base = engineBase(s), temp = base ? numAt(s, `${base}.temperature`) : null;
    if (!base || temp == null) return null;
    const c = celsius(temp), running = rpm(numAt(s, `${base}.revolutions`) ?? 0) > 0;
    return { kind: 'p', v: clamp(c / 120), ids: [`${base}.temperature`], big: `${num(c, 0)}°C`, label: running ? 'coolant' : 'coolant, engine off', history: `${base}.temperature`,
      alert: noteAlert(s, `${base}.temperature`, `${num(c, 0)}°C`, 'coolant') ?? (c >= 100 ? got(2, `${num(c, 0)}°C`, 'overheating', t.engineHot(num(c, 0))) : c >= 92 ? got(1, `${num(c, 0)}°C`, 'hot', t.engineHot(num(c, 0))) : undefined) };
  } },
  { key: 'oil', name: 'Oil pressure', glyph: g.oil, read: (s) => {
    const base = engineBase(s), p = base ? numAt(s, `${base}.oilPressure`) : null;
    if (!base || p == null) return null;
    const b = bar(p), running = rpm(numAt(s, `${base}.revolutions`) ?? 0) > 0;
    return { kind: 'p', v: clamp(b / 6), ids: [`${base}.oilPressure`], big: `${num(b, 1)} bar`, label: running ? 'oil' : 'oil, engine off',
      alert: noteAlert(s, `${base}.oilPressure`, `${num(b, 1)} bar`, 'oil') ?? (running && b < 1 ? got(2, `${num(b, 1)} bar`, 'oil pressure', t.oilLow(num(b, 1))) : undefined) };
  } },
] };

const AP_STATES = ['standby', 'auto', 'wind', 'route'];
export const steering: System = { id: 'steering', title: 'Steering', channels: [
  { key: 'autopilot', name: 'Autopilot', glyph: g.wheel, read: (s) => {
    const state = strAt(s, 'steering.autopilot.state');
    if (state == null) return null;
    const target = numAt(s, 'steering.autopilot.target.headingMagnetic') ?? numAt(s, 'steering.autopilot.target.headingTrue');
    const segs: Seg[] = AP_STATES.map((st) => ({ label: t.autopilotStates[st] ?? st, on: st === state, id: 'steering.autopilot.state', act: st === state ? undefined : put('steering.autopilot.state', st) }));
    return { kind: 'c', segs, ids: ['steering.autopilot.state'], big: t.autopilotStates[state] ?? state, label: target != null && state !== 'standby' ? `target ${num(deg(target), 0)}°` : 'the helm is yours',
      alert: noteAlert(s, 'steering.autopilot.state', t.autopilotStates[state] ?? state, 'autopilot') };
  } },
  { key: 'target', name: 'Target', glyph: g.target, read: (s) => {
    const path = ['steering.autopilot.target.headingMagnetic', 'steering.autopilot.target.headingTrue'].find((p) => numAt(s, p) != null);
    if (!path) return null;
    const target = deg(numAt(s, path)!), heading = numAt(s, path.endsWith('True') ? 'navigation.headingTrue' : 'navigation.headingMagnetic');
    return { kind: 'p', v: target / 360, ids: [path], big: `${num(target, 0)}°`, label: heading != null ? `heading ${num(deg(heading), 0)}°` : 'autopilot target',
      dial: { min: 0, max: 359, step: 1, unit: '°', label: 'target', value: Math.round(target), id: path, set: (d) => put(path, rad(d)) },
      now: heading != null ? deg(heading) : undefined };
  } },
  { key: 'rudder', name: 'Rudder', glyph: g.rudder, read: (s) => {
    const r = numAt(s, 'steering.rudderAngle');
    if (r == null) return null;
    const d = relDeg(r);
    return { kind: 'p', v: clamp((d + 35) / 70), ids: ['steering.rudderAngle'], big: `${num(Math.abs(d), 0)}°`, label: Math.abs(d) < 0.5 ? 'amidships' : d < 0 ? t.port : t.starboard };
  } },
  { key: 'anchor', name: 'Anchor', glyph: g.anchor, read: (s) => {
    const cur = numAt(s, 'navigation.anchor.currentRadius'), max = numAt(s, 'navigation.anchor.maxRadius');
    if (cur == null || max == null) return null;
    return { kind: 'p', v: clamp(cur / max), ids: ['navigation.anchor.currentRadius', 'navigation.anchor.maxRadius'], big: `${num(cur, 0)} m`, label: `of ${num(max, 0)} m allowed`,
      alert: noteAlert(s, 'navigation.anchor', `${num(cur, 0)} m`, 'anchor') ?? (cur > max ? got(2, `${num(cur, 0)} m`, 'dragging', t.dragging(num(cur, 0), num(max, 0))) : undefined) };
  } },
] };

export const systems: System[] = [navigation, wind, electrical, tanks, engine, steering];
