import { listOf, num, type Alert, type GeoPlot, type MapSpec, type Plot, type ReadContext, type Reading, type Seg } from '@zumer/pulse';
import type { Launch } from './feeds.ts';
import type { Act, IssSource } from './source.ts';
import { PUIS, textOf, WINGS, type Sample } from './telemetry.ts';
import { t } from './strings.ts';

// The station read as a flight controller's glance: what each console would
// want in front of it, one object per discipline. Air, water and power from
// the telemetry; attitude, the station's mode and its links; where it is and
// who is aboard; the launches coming up. The alerts' thresholds are this
// app's own, near the nominal values the stream shows, not NASA's flight
// rules; a reading that has not changed for hours (the air analyzers sample
// now and then) says so and does not call.

export type Channel = { key: string; name: string; glyph: string; read: (s: IssSource, ctx: ReadContext) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  gauge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 12l4-4 M8 16h8',
  co2: 'M4 12a4 4 0 0 1 8 0 4 4 0 0 1-8 0z M14 9h3a2 2 0 0 1 0 4h-1a2 2 0 0 0 0 4h3',
  o2: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  temp: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z M12 9v6',
  fan: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M12 10c0-4 2-6 4-6s2 4-2 6 M14 12c4 0 6 2 6 4s-4 2-6-2 M12 14c0 4-2 6-4 6s-2-4 2-6 M10 12c-4 0-6-2-6-4s4-2 6 2',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  tank: 'M6 4h12v16H6z M6 12h12',
  cycle: 'M20 12a8 8 0 0 1-14 5 M4 12a8 8 0 0 1 14-5 M18 3v4h-4 M6 21v-4h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  panel: 'M3 9h18v6H3z M9 9v6 M15 9v6 M12 15v6',
  joint: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 3v6 M12 15v6',
  loop: 'M4 8h12a4 4 0 0 1 0 8H8 M8 12l-4 4 4 4',
  gyro: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12c3-2 15-2 18 0 M12 3c-2 3-2 15 0 18',
  axes: 'M12 3v18 M3 12h18 M6 6l12 12',
  station: 'M3 12h18 M7 8v8 M17 8v8 M10 10h4v4h-4z',
  crew: 'M9 8a3 3 0 1 0 0 .01 M17 9a2.5 2.5 0 1 0 0 .01 M3 20c0-4 3-6 6-6s6 2 6 6 M15 20c0-3 1-5 4-5',
  dock: 'M4 12h6 M14 12h6 M10 8v8 M14 8v8',
  mass: 'M6 20h12l-2-10H8z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  track: 'M3 14c3-6 6-6 9 0s6 6 9 0',
  you: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  signal: 'M5 12a7 7 0 0 1 14 0 M8 12a4 4 0 0 1 8 0 M12 12v9',
  video: 'M3 7h12v10H3z M15 10l6-3v10l-6-3',
  antenna: 'M12 21V11 M8 3l4 8 4-8 M6 21h12',
  rocket: 'M12 2c3 3 4 7 4 11l-4 4-4-4c0-4 1-8 4-11z M8 13l-3 3v3l3-2 M16 13l3 3v3l-3-2 M12 9a1.5 1.5 0 1 0 0 .01',
  week: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  pad: 'M12 3v12 M8 21h8 M10 15h4l1 6H9z',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const got = (level: 1 | 2, big: string, label: string, why: string, key: string, acts: Act[] = [], verb = t.gotIt): Alert => ({ level, big, label, why, key, verb, acts });
const STALE = 6 * 3_600_000;
const get = (s: IssSource, id: string) => s.samples.get(id);
const val = (s: IssSource, id: string) => get(s, id)?.value ?? null;
const fresh = (x: Sample | undefined, now = Date.now()) => !!x && now - x.at < STALE;
// How old a reading is, in its label, when it has not changed for hours.
const age = (x: Sample, now = Date.now()) => (now - x.at >= STALE ? ` · ${t.asOf(t.ago(now - x.at))}` : '');
const latlon = (lat: number, lon: number, digits = 1) => `${num(Math.abs(lat), digits)}°${lat >= 0 ? 'N' : 'S'} ${num(Math.abs(lon), digits)}°${lon >= 0 ? 'E' : 'W'}`;
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (d: number) => COMPASS[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
const R_EARTH = 6371, D = Math.PI / 180;
// The great circle between two places, in kilometres, and the bearing from the first to the second.
export const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const a = Math.sin((lat2 - lat1) * D / 2) ** 2 + Math.cos(lat1 * D) * Math.cos(lat2 * D) * Math.sin((lon2 - lon1) * D / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
export const bearingTo = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const y = Math.sin((lon2 - lon1) * D) * Math.cos(lat2 * D), x = Math.cos(lat1 * D) * Math.sin(lat2 * D) - Math.sin(lat1 * D) * Math.cos(lat2 * D) * Math.cos((lon2 - lon1) * D);
  return ((Math.atan2(y, x) / D) + 360) % 360;
};

// ─── Air ───

// A channel that follows one analyzer, the Lab's or Node 3's: the viewer's pick, else the one that changed last.
const analyzer = (s: IssSource, ctx: ReadContext, key: string, ids: string[]) => {
  const have = ids.filter((id) => get(s, id));
  const pick = ctx.picks[key];
  return have.includes(pick) ? pick : have.sort((a, b) => get(s, b)!.at - get(s, a)!.at)[0];
};
const where = (id: string) => (id.startsWith('NODE3') ? 'Node 3' : 'Lab');

export const air: System = { id: 'air', title: 'Air', channels: [
  { key: 'pressure', name: 'Pressure', glyph: g.gauge, read: (s) => {
    const x = get(s, 'USLAB000058');
    if (!x?.value) return null;
    const p = x.value, ago = s.past(x.id).find((y) => y.at <= x.at - 10 * 60_000) ?? s.past(x.id)[0];
    const drop = ago && x.at - ago.at >= 5 * 60_000 ? ago.value! - p : 0, airlock = get(s, 'AIRLOCK000054');
    const big = `${num(p, 0)} mmHg`, why = t.pressureWhy(big, drop >= 3 ? `${num(drop, 1)} mmHg` : '');
    return { kind: 'p', v: clamp((p - 700) / 100), ids: [x.id, ...(airlock ? [airlock.id] : [])], big, label: `${num(p / 51.715, 2)} psi${airlock?.value ? ` · airlock ${num(airlock.value, 0)}` : ''}`,
      alert: p < 710 || drop >= 3 ? got(2, big, drop >= 3 ? 'falling' : 'low', why, 'pressure') : p < 735 || p > 790 ? got(1, big, p < 735 ? 'low' : 'high', why, 'pressure') : undefined };
  } },
  { key: 'co2', name: 'CO₂', glyph: g.co2, read: (s, ctx) => {
    const id = analyzer(s, ctx, 'air/co2', ['USLAB000055', 'NODE3000003']);
    const x = id ? get(s, id) : undefined;
    if (x?.value == null) return null;
    const v = x.value, big = `${num(v, 1)} mmHg`, why = t.co2Why(where(x.id), big);
    return { kind: 'p', v: clamp(v / 8), ids: [x.id], big, name: `CO₂ · ${where(x.id)}`, label: `${num((v / 760) * 100, 2)}% of the air${age(x)}`, choice: x.id, choices: ['USLAB000055', 'NODE3000003'].filter((c) => c !== x.id && get(s, c)),
      alert: fresh(x) && v >= 6 ? got(2, big, 'CO₂ high', why, 'co2') : fresh(x) && v >= 4 ? got(1, big, 'CO₂ high', why, 'co2') : undefined };
  } },
  { key: 'o2', name: 'O₂', glyph: g.o2, read: (s, ctx) => {
    const id = analyzer(s, ctx, 'air/o2', ['USLAB000053', 'NODE3000001']);
    const x = id ? get(s, id) : undefined, p = val(s, 'USLAB000058');
    if (x?.value == null) return null;
    const v = x.value, big = `${num(v, 0)} mmHg`, why = t.o2Why(where(x.id), big);
    return { kind: 'p', v: clamp((v - 120) / 80), ids: [x.id], big, name: `O₂ · ${where(x.id)}`, label: `${p ? `${num((v / p) * 100, 1)}% of the air` : 'partial pressure'}${age(x)}`, choice: x.id, choices: ['USLAB000053', 'NODE3000001'].filter((c) => c !== x.id && get(s, c)),
      alert: fresh(x) && v < 125 ? got(2, big, 'O₂ low', why, 'o2') : fresh(x) && (v < 145 || v > 185) ? got(1, big, v < 145 ? 'O₂ low' : 'O₂ high', why, 'o2') : undefined };
  } },
  { key: 'temperature', name: 'Temperature', glyph: g.temp, read: (s) => {
    const x = get(s, 'USLAB000059');
    if (x?.value == null) return null;
    const v = x.value, big = `${num(v, 1)} °C`;
    return { kind: 'p', v: clamp((v - 15) / 15), ids: [x.id], big, label: `the Lab’s air${age(x)}`,
      alert: v < 18 || v > 28 ? got(1, big, v < 18 ? 'cold' : 'warm', t.tempWhy(big), 'temperature') : undefined };
  } },
  { key: 'conditioners', name: 'Air conditioners', glyph: g.fan, read: (s) => {
    const list = ['USLAB000064', 'USLAB000065', 'NODE2000003', 'NODE3000018', 'AIRLOCK000053'].map((id) => get(s, id)).filter((x): x is Sample => !!x);
    if (!list.length) return null;
    const on = list.filter((x) => x.value === 5);
    const segs: Seg[] = list.map((x) => ({ label: `${PUIS[x.id].name.replace(' air conditioner', '')} · ${textOf(x)}`, on: x.value === 5, id: x.id }));
    return { kind: 's', segs, ids: list.map((x) => x.id), list: segs, big: `${on.length} of ${list.length}`, label: 'running' };
  } },
] };

// ─── Water ───

const tank = (key: string, name: string, id: string, glyph: string, call: (v: number) => string | null): Channel => ({ key, name, glyph, read: (s) => {
  const x = get(s, id);
  if (x?.value == null) return null;
  const v = x.value, big = `${num(v, 0)}%`, what = call(v);
  return { kind: 'p', v: clamp(v / 100), ids: [id], big, label: `full${age(x)}`, alert: what ? got(1, big, name.toLowerCase(), t.tankWhy(name, big, what), key) : undefined };
} });

export const water: System = { id: 'water', title: 'Water', channels: [
  tank('clean', 'Clean water', 'NODE3000009', g.drop, (v) => (v <= 10 ? 'nearly empty' : null)),
  tank('waste', 'Waste water', 'NODE3000008', g.tank, (v) => (v >= 90 ? 'nearly full' : null)),
  tank('urine', 'Urine tank', 'NODE3000005', g.tank, (v) => (v >= 90 ? 'nearly full' : null)),
  { key: 'processors', name: 'Processors', glyph: g.cycle, read: (s) => {
    const all: [string, number][] = [['NODE3000004', 16], ['NODE3000006', 4], ['NODE3000010', 1]];
    const list = all.map(([id, running]) => [get(s, id), running] as const).filter((x): x is readonly [Sample, number] => !!x[0]);
    if (!list.length) return null;
    const segs: Seg[] = list.map(([x, running]) => ({ label: `${PUIS[x.id].name} · ${textOf(x)}`, on: x.value === running, id: x.id }));
    const o2 = get(s, 'NODE3000011');
    return { kind: 's', segs, ids: list.map(([x]) => x.id), list: segs, big: `${segs.filter((x) => x.on).length} of ${segs.length}`,
      label: `processing${o2?.value != null && o2.value > 0 ? ` · ${num(o2.value, 1)} lb of O₂ a day` : ''}` };
  } },
] };

// ─── Power and thermal ───

const daylight = (s: IssSource) => s.position?.daylight ?? null;
export const power: System = { id: 'power', title: 'Power', channels: [
  { key: 'arrays', name: 'Solar arrays', glyph: g.panel, read: (s) => {
    const list = WINGS.map((w) => ({ w, v: get(s, w.volts), a: get(s, w.amps) })).filter((x) => x.v);
    if (!list.length) return null;
    const up = (x: typeof list[number]) => (x.v!.value ?? 0) > 100;
    const lit = daylight(s), dark = list.filter((x) => !up(x)), on = list.length - dark.length;
    const segs: Seg[] = list.map((x) => ({ label: `${x.w.wing} · ${num(x.v!.value ?? 0, 0)} V${x.a?.value ? ` · ${num(x.a.value, 1)} A` : ''}`, on: up(x), id: x.v!.id }));
    // A wing without voltage while most have it (the drive voltage stays up in the dark too, as the recording shows): that one is off.
    const odd = on >= 4 && dark.length ? dark : [];
    return { kind: 's', segs, ids: list.map((x) => x.v!.id), list: segs, big: `${on} of ${list.length}`, label: `wings with voltage${lit == null ? '' : lit ? ' · in the sun' : ' · in the dark'}`,
      alert: odd.length ? { ...got(1, `${odd.length} dark`, 'arrays', t.wingWhy(listOf(odd.map((x) => `Wing ${x.w.wing}`))), `wings:${odd.map((x) => x.w.wing).join(',')}`), fail: odd.map((x) => list.indexOf(x)) } : undefined };
  } },
  { key: 'alpha', name: 'Alpha joints', glyph: g.joint, read: (s) => {
    const port = get(s, 'S0000004'), stbd = get(s, 'S0000003');
    if (port?.value == null) return null;
    const pm = get(s, 'S0000008'), sm = get(s, 'S0000009');
    return { kind: 'p', v: clamp(port.value / 360), ids: [port.id, ...(stbd ? [stbd.id] : []), ...(pm ? [pm.id] : []), ...(sm ? [sm.id] : [])], big: `${num(port.value, 0)}°`, bearing: port.value,
      label: `port${pm ? ` ${textOf(pm)}` : ''}${stbd?.value != null ? ` · starboard ${num(stbd.value, 0)}°${sm ? ` ${textOf(sm)}` : ''}` : ''}` };
  } },
  { key: 'beta', name: 'Beta angle', glyph: g.sun, read: (s) => {
    const x = get(s, 'USLAB000040');
    if (x?.value == null) return null;
    return { kind: 'p', v: clamp(Math.abs(x.value) / 75), ids: [x.id], big: `${num(x.value, 1)}°`, label: Math.abs(x.value) > 60 ? 'the sun over the orbit: almost no night' : 'the sun to the orbit plane' };
  } },
] };

const loop = (key: string, name: string, tempId: string, flowId: string): Channel => ({ key, name, glyph: g.loop, read: (s) => {
  const temp = get(s, tempId), flow = get(s, flowId);
  if (temp?.value == null) return null;
  return { kind: 'p', v: clamp((flow?.value ?? 0) / 5000), ids: [tempId, ...(flow ? [flowId] : [])], big: `${num(temp.value, 1)} °C`, label: `ammonia${flow?.value != null ? ` · ${num(flow.value, 0)} kg/h` : ''}` };
} });
export const thermal: System = { id: 'thermal', title: 'Thermal', channels: [
  loop('loopA', 'Loop A', 'S1000003', 'S1000001'),
  loop('loopB', 'Loop B', 'P1000003', 'P1000001'),
  { key: 'radiators', name: 'Radiators', glyph: g.joint, read: (s) => {
    const a = get(s, 'S0000001'), b = get(s, 'S0000002');
    if (a?.value == null) return null;
    return { kind: 'p', v: clamp((a.value + 115) / 230), ids: [a.id, ...(b ? [b.id] : [])], big: `${num(a.value, 0)}°`, bearing: a.value, label: `starboard joint${b?.value != null ? ` · port ${num(b.value, 0)}°` : ''}` };
  } },
] };

// ─── Attitude and the station ───

const CONTROL = [4, 5, 7, 3];
export const attitude: System = { id: 'attitude', title: 'Attitude', channels: [
  { key: 'momentum', name: 'CMG momentum', glyph: g.gyro, read: (s) => {
    const x = get(s, 'USLAB000010');
    if (x?.value == null) return null;
    const v = x.value, big = `${num(v, 1)}%`;
    return { kind: 'p', v: clamp(v / 100), ids: [x.id], big, label: 'of the gyroscopes’ capacity',
      alert: v >= 95 ? got(2, big, 'saturated', t.cmgWhy(big), 'momentum') : v >= 80 ? got(1, big, 'near saturation', t.cmgWhy(big), 'momentum') : undefined };
  } },
  { key: 'gyros', name: 'Gyroscopes', glyph: g.gyro, read: (s) => {
    const list = [1, 2, 3, 4].map((n) => ({ n, x: get(s, `USLAB00000${n}`), rpm: get(s, `Z10000${String(n + 8).padStart(2, '0')}`) })).filter((c) => c.x);
    if (!list.length) return null;
    const on = list.filter((c) => c.x!.value === 1);
    const segs: Seg[] = list.map((c) => ({ label: `CMG ${c.n}${c.rpm?.value ? ` · ${num(c.rpm.value, 0)} rpm` : ''}`, on: c.x!.value === 1, id: c.x!.id }));
    return { kind: 's', segs, ids: list.map((c) => c.x!.id), big: `${on.length} of ${list.length}`, label: 'in use',
      alert: on.length < 4 ? { ...got(on.length < 2 ? 2 : 1, `${on.length} of 4`, 'gyroscopes', t.gyrosWhy(on.length), `gyros:${on.map((c) => c.n).join(',')}`), fail: list.map((c, i) => (c.x!.value === 1 ? -1 : i)).filter((i) => i >= 0) } : undefined };
  } },
  { key: 'control', name: 'Control', glyph: g.axes, read: (s) => {
    const x = get(s, 'USLAB000012');
    if (x?.value == null) return null;
    const states = PUIS.USLAB000012.states!, lost = [get(s, 'USLAB000041'), get(s, 'USLAB000042')].find((y) => y?.value === 1);
    const frame = get(s, 'USLAB000017'), moving = val(s, 'USLAB000081') === 1;
    const segs: Seg[] = [...new Set([...CONTROL, x.value])].map((m) => ({ label: states[m] ?? String(m), on: m === x.value, id: x.id }));
    return { kind: 'c', segs, ids: [x.id, ...(lost ? [lost.id] : [])], big: textOf(x), label: `${frame ? `${textOf(frame)} frame` : 'attitude'}${moving ? ' · maneuvering' : ''}`,
      alert: lost ? got(2, 'lost', 'attitude', t.attitudeWhy(PUIS[lost.id].name.toLowerCase()), lost.id) : x.value === 7 ? got(1, 'free drift', 'attitude', t.attitudeWhy('free drift, no control'), 'drift') : undefined };
  } },
] };

const MODES = [1, 2, 4, 8, 16, 32, 64];
export const station: System = { id: 'station', title: 'Station', channels: [
  { key: 'mode', name: 'Mode', glyph: g.station, read: (s) => {
    const x = get(s, 'USLAB000086');
    if (x?.value == null) return null;
    const states = PUIS.USLAB000086.states!;
    const segs: Seg[] = MODES.map((m) => ({ label: states[m], on: m === x.value, id: x.id }));
    const mode = textOf(x);
    return { kind: 'c', segs, ids: [x.id], big: mode[0].toUpperCase() + mode.slice(1), label: 'station mode',
      alert: x.value === 32 || x.value === 64 ? got(2, mode, 'station mode', t.modeWhy(mode), `mode:${x.value}`) : undefined };
  } },
  { key: 'crew', name: 'Crew', glyph: g.crew, read: (s) => {
    const st = s.station;
    if (!st) return null;
    const segs: Seg[] = st.crew.map((c) => ({ label: `${c.name} · ${c.role.toLowerCase()} · ${c.agency}`, on: true, id: 'crew' }));
    const walk = st.spacewalk, now = Date.now();
    return { kind: 's', segs, ids: ['crew'], list: segs, big: `${st.aboard || st.crew.length} aboard`, label: `${st.expedition}${st.started ? ` · day ${Math.floor((now - st.started) / 86_400_000) + 1}` : ''}`,
      alert: walk ? got(1, 'EVA', 'spacewalk', t.walkWhy(walk.name, t.ago(now - walk.since)), `eva:${walk.since}`) : undefined };
  } },
  { key: 'docked', name: 'Docked', glyph: g.dock, read: (s) => {
    const st = s.station;
    if (!st?.ports.length) return null;
    const by = new Map(st.docked.map((d) => [d.port, d])), now = Date.now();
    const segs: Seg[] = st.ports.map((p) => ({ label: by.has(p) ? `${by.get(p)!.vehicle} · ${p}` : `${p} · free`, on: by.has(p), id: 'docked' }));
    const list: Seg[] = st.docked.map((d) => ({ label: `${d.vehicle} · ${d.port} · ${Math.floor((now - d.since) / 86_400_000)} days`, on: true, id: 'docked' }));
    return { kind: 's', segs, ids: ['docked'], list, big: `${st.docked.length} docked`, label: `of ${st.ports.length} ports · ${listOf(st.docked.slice(0, 2).map((d) => d.vehicle))}${st.docked.length > 2 ? '…' : ''}` };
  } },
  { key: 'mass', name: 'Mass', glyph: g.mass, read: (s) => {
    const x = get(s, 'USLAB000039');
    if (x?.value == null) return null;
    return { kind: 'p', v: clamp(x.value / 500_000), ids: [x.id], big: `${num(x.value / 1000, 0)} t`, label: `${num(x.value, 0)} kg with what is docked` };
  } },
] };

// ─── Orbit ───

const heading = (s: IssSource) => {
  const p = s.position, next = s.track.find((q) => p && q.at > p.at);
  return p && next ? bearingTo(p.lat, p.lon, next.lat, next.lon) : undefined;
};
const trackPlots = (s: IssSource): GeoPlot[] => s.track.filter((q) => !s.position || q.at > s.position.at).map((q) => ({
  lat: q.lat, lon: q.lon, label: `in ${Math.round((q.at - Date.now()) / 60_000)} min · ${latlon(q.lat, q.lon)}`, on: false, size: 0 }));
const issPlot = (s: IssSource): GeoPlot => ({ lat: s.position!.lat, lon: s.position!.lon, label: `ISS · ${latlon(s.position!.lat, s.position!.lon)}`, id: 'position', size: 1 });
const placePlot = (s: IssSource): GeoPlot => ({ lat: s.place.lat, lon: s.place.lon, label: s.place.name, id: 'place', size: 0.45, on: false });
// The station is above the horizon of a place when the angle between them is under the one its height allows.
export const overhead = (s: IssSource) => {
  const p = s.position;
  if (!p) return null;
  const km = distanceKm(s.place.lat, s.place.lon, p.lat, p.lon), horizon = Math.acos(R_EARTH / (R_EARTH + p.alt)) * R_EARTH;
  return { km, up: km < horizon, bearing: bearingTo(s.place.lat, s.place.lon, p.lat, p.lon) };
};

export const orbit: System = { id: 'orbit', title: 'Orbit', channels: [
  { key: 'where', name: 'Position', glyph: g.globe, read: (s) => {
    const p = s.position;
    if (!p) return null;
    return { kind: 'p', v: clamp((p.alt - 370) / 60), ids: ['position'], big: latlon(p.lat, p.lon, 0), bearing: heading(s),
      label: `${num(p.alt, 0)} km up · ${p.daylight ? 'in the sun' : 'in the dark'}`,
      globe: { center: { lat: p.lat, lon: p.lon }, plots: [...trackPlots(s), placePlot(s), issPlot(s)] } };
  } },
  { key: 'track', name: 'Ground track', glyph: g.track, read: (s) => {
    const p = s.position;
    if (!p) return null;
    const next = s.track.find((q) => q.at > p.at + 60_000), map: MapSpec = { center: { lat: p.lat, lon: p.lon }, zoom: 2, plots: [...trackPlots(s), issPlot(s)] };
    const night = s.track.find((q) => q.at > p.at && q.daylight !== p.daylight);
    return { kind: 'p', v: clamp(s.track.filter((q) => q.at > p.at).length / 10), ids: ['position'], map, bearing: heading(s),
      big: next ? latlon(next.lat, next.lon, 0) : latlon(p.lat, p.lon, 0),
      label: `${next ? `in ${Math.round((next.at - Date.now()) / 60_000)} min` : 'now'}${night ? ` · ${p.daylight ? 'sunset' : 'sunrise'} in ${Math.max(1, Math.round((night.at - Date.now()) / 60_000))} min` : ''}` };
  } },
  { key: 'you', name: 'From you', glyph: g.you, read: (s) => {
    const o = overhead(s);
    if (!o) return null;
    const plots: Plot[] = [{ bearing: o.bearing, range: clamp(o.km / 20_000), label: 'ISS', id: 'position' }];
    return { kind: 'p', v: 1 - clamp(o.km / 20_000), ids: ['position'], big: `${num(o.km, 0)} km`, bearing: o.bearing, plots,
      label: o.up ? `above ${s.place.name}’s horizon now` : `${compass(o.bearing)} of ${s.place.name}` };
  } },
] };

// ─── The links ───

export const links: System = { id: 'links', title: 'Links', channels: [
  { key: 'signal', name: 'Signal', glyph: g.signal, read: (s) => {
    const sig = s.signal;
    if (!sig) return null;
    const ago = Date.now() - sig.at;
    return { kind: 'p', v: sig.aos ? 1 : 0, ids: ['signal'], big: sig.aos ? 'Signal' : 'Loss of signal', label: `${sig.aos ? 'the ground hears the station' : 'between relay satellites'} · ${t.ago(ago)}`,
      alert: !sig.aos && ago >= 30 * 60_000 ? got(1, 'LOS', 'signal', t.losWhy(t.ago(ago)), `los:${sig.at}`) : undefined };
  } },
  { key: 'video', name: 'Ku-band video', glyph: g.video, read: (s) => {
    const list = ['USLAB000088', 'USLAB000089', 'USLAB000090', 'USLAB000091'].map((id) => get(s, id)).filter((x): x is Sample => !!x);
    if (!list.length) return null;
    const segs: Seg[] = list.map((x, i) => ({ label: `Channel ${i + 1} · ${textOf(x)}`, on: x.value === 1, id: x.id }));
    const ku = get(s, 'Z1000013');
    return { kind: 's', segs, ids: list.map((x) => x.id), big: `${segs.filter((x) => x.on).length} of ${segs.length}`, label: `downlinks active${ku ? ` · transmit ${textOf(ku)}` : ''}` };
  } },
  { key: 'sband', name: 'S-band', glyph: g.antenna, read: (s) => {
    const x = get(s, 'USLAB000092');
    if (x?.value == null) return null;
    const segs: Seg[] = [1, 2].map((n) => ({ label: `String ${n}`, on: x.value === n, id: x.id }));
    return { kind: 'c', segs, ids: [x.id], big: `String ${x.value}`, label: 'voice and commands' };
  } },
] };

// ─── Launches ───

export const LAUNCH = 'launch:';
const STATUS: Record<number, string> = { 1: 'go', 2: 'to be determined', 3: 'success', 4: 'failure', 5: 'hold', 6: 'in flight', 7: 'partial failure', 8: 'to be confirmed' };
const statusOf = (l: Launch) => STATUS[l.statusId] ?? l.status.toLowerCase();
// What is coming: what has not flown, or is flying, within the last hour.
const coming = (s: IssSource, now = Date.now()) => s.launches.filter((l) => l.net > now - 3_600_000 && ![3, 4, 7].includes(l.statusId)).sort((a, b) => a.net - b.net);
const watch = (l: Launch): Act[] => (l.webcast ? [{ ids: [], kind: 'open', url: l.webcast }] : []);
const launchSeg = (l: Launch, now = Date.now()): Seg => ({ label: `${t.countdown(l.net - now, true)} · ${l.name}`, on: l.statusId === 1 || l.statusId === 6, id: LAUNCH + l.id, to: LAUNCH + l.id });
// A launch within the hour, or flying, calls: someone will want to watch it.
const launchAlert = (l: Launch, now = Date.now()): Alert | undefined => {
  const soon = l.net - now;
  if (l.statusId === 6) return got(1, 'in flight', l.rocket || 'launch', t.launchWhy(l.name, 'is flying', l.place), `launch:${l.id}:flight`, watch(l), l.webcast ? t.watch : t.gotIt);
  if (soon > 0 && soon <= 3_600_000 && (l.statusId === 1 || l.statusId === 8)) return got(1, t.countdown(soon), l.rocket || 'launch', t.launchWhy(l.name, `in ${Math.max(1, Math.round(soon / 60_000))} min`, l.place), `launch:${l.id}`, watch(l), l.webcast ? t.watch : t.gotIt);
  return undefined;
};

export const launches: System = { id: 'launches', title: 'Launches', channels: [
  { key: 'next', name: 'Next launch', glyph: g.rocket, read: (s) => {
    const list = coming(s), l = list[0], now = Date.now();
    if (!l) return null;
    return { kind: 'p', v: clamp(1 - (l.net - now) / 86_400_000), ids: ['launches', LAUNCH + l.id], big: t.countdown(l.net - now), label: `${l.name} · ${l.place.split(',')[0]}`,
      list: list.map((x) => launchSeg(x, now)), alert: launchAlert(l, now) };
  } },
  { key: 'station', name: 'To the station', glyph: g.dock, read: (s) => {
    const l = coming(s).find((x) => x.toStation), now = Date.now();
    if (!l) return s.launches.length ? { kind: 'p', v: 0, ids: ['launches'], big: 'None', label: 'no flight to the station among the next launches' } : null;
    return { kind: 'p', v: clamp(1 - (l.net - now) / (14 * 86_400_000)), ids: [LAUNCH + l.id], big: t.countdown(l.net - now), label: l.name, list: [launchSeg(l, now)] };
  } },
  { key: 'week', name: 'This week', glyph: g.week, read: (s) => {
    const now = Date.now(), list = coming(s, now).filter((l) => l.net < now + 7 * 86_400_000);
    if (!s.launches.length) return null;
    const segs = list.map((l) => launchSeg(l, now));
    return { kind: 's', segs, ids: ['launches', ...list.map((l) => LAUNCH + l.id)], list: segs, big: `${list.length}`, label: `launches in seven days${list.length ? ` · ${listOf([...new Set(list.map((l) => l.provider.split(' ')[0]))].slice(0, 3))}` : ''}` };
  } },
] };

export const systemsOf = (): System[] => [air, water, power, thermal, attitude, station, orbit, links, launches];

// ─── One launch as an object, zoomed into from a list ───

const launchOf = (s: IssSource, id: string) => (id.startsWith(LAUNCH) ? s.launches.find((l) => l.id === id.slice(LAUNCH.length)) : undefined);
const launchChannels: { key: string; name: string; glyph: string; read: (s: IssSource, l: Launch) => Reading | null }[] = [
  { key: 'countdown', name: 'Countdown', glyph: g.rocket, read: (_s, l) => {
    const now = Date.now(), id = LAUNCH + l.id;
    return { kind: 'p', v: clamp(1 - (l.net - now) / 86_400_000), ids: [id], big: t.countdown(l.net - now),
      label: `${statusOf(l)}${l.precision && l.precision !== 'Second' && l.precision !== 'Minute' ? ` · to the ${l.precision.toLowerCase()}` : ''}${l.probability != null ? ` · ${l.probability}% weather` : ''}`,
      link: l.webcast ? { label: t.watch, on: true, id, act: watch(l)[0] } : undefined, alert: launchAlert(l, now) };
  } },
  { key: 'pad', name: 'Pad', glyph: g.pad, read: (_s, l) => {
    if (l.lat == null || l.lon == null) return null;
    return { kind: 'p', v: 1, ids: [LAUNCH + l.id], big: l.pad.split('(')[0].trim() || l.pad, label: l.place,
      map: { center: { lat: l.lat, lon: l.lon }, zoom: 13, plots: [{ lat: l.lat, lon: l.lon, label: l.pad, id: LAUNCH + l.id, size: 1 }] } };
  } },
  { key: 'mission', name: 'Mission', glyph: g.flag, read: (_s, l) => ({ kind: 'p', v: l.toStation ? 1 : 0.5, ids: [LAUNCH + l.id], big: l.orbit || '—', label: `${l.mission || l.name} · ${l.provider}${l.toStation ? ' · to the ISS' : ''}` }) },
];
export const launchObject = (s: IssSource, id: string): System | null => {
  const l = launchOf(s, id);
  if (!l) return null;
  return { id, title: l.name, channels: launchChannels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (src: IssSource) => { const now = launchOf(src, id); return now ? ch.read(src, now) : null; } })) };
};
export { launchOf };
