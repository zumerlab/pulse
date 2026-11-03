import { listOf, num, type Alert, type Group, type Plot, type Reading, type Seg } from '@zumer/pulse';
import { type Act, type Drone, type Drones, PICKABLE } from './source.ts';
import { t } from './strings.ts';

// A swarm read two ways. On the systems axis the swarm as one object per
// dimension: where they are (a radar around home), their power, their link
// and GPS, their flight; each drone a tick, the ones that call painted,
// and the alert's action is one command to each of them (bring them home).
// On the groups axis one object per drone: its mode as a choice ring that
// sets it, its flight, its battery, its link, its place around home.

export type Channel = { key: string; name: string; glyph: string; read: (d: Drones) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  radar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 12l6-6',
  drone: 'M5 5l4 4 M19 5l-4 4 M5 19l4-4 M19 19l-4-4 M9 9h6v6H9z M3 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M17 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M3 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0 M17 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  battery: 'M3 8h15v8H3z M18 10h2v4h-2z M6 11v2',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  link: 'M2 9a15 15 0 0 1 20 0 M5 13a10 10 0 0 1 14 0 M8.5 16.5a5 5 0 0 1 7 0 M12 20h.01',
  satellite: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v5 M12 16v5 M3 12h5 M16 12h5',
  altitude: 'M12 21V5 M12 5l-4 4 M12 5l4 4 M4 21h16',
  mode: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 3v4 M12 17v4 M3 12h4 M17 12h4',
  speed: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10 M10 20v-6h4v6',
  arm: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5 M9 12h6',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const RADAR_M = 300;                 // the rim of the radar, metres from home
export const LOST_S = 10, LOW = 20, CRITICAL = 10;
export const compass = (d: number) => t.compass[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
export const nameOf = (d: Drone) => `${d.type === 'plane' ? 'Plane' : d.type === 'rover' ? 'Rover' : 'Copter'} ${d.sysid}`;
export const DRONE = 'drone:';
export const droneId = (d: Drone) => DRONE + d.sysid;
export const sysidOf = (id: string) => Number(id.slice(DRONE.length));
const got = (level: 1 | 2, big: string, label: string, why: string, acts: Act[] = [], verb = t.gotIt): Alert => ({ level, big, label, why, key: label, verb, acts });
const rtl = (d: Drone): Act => ({ ids: [droneId(d)], kind: 'mode', sysid: d.sysid, mode: 'RTL' });
const setMode = (d: Drone, mode: string): Act => ({ ids: [droneId(d)], kind: 'mode', sysid: d.sysid, mode });
const arm = (d: Drone, on: boolean): Act => ({ ids: [droneId(d)], kind: 'arm', sysid: d.sysid, arm: on });
const takeoff = (d: Drone): Act => ({ ids: [droneId(d)], kind: 'takeoff', sysid: d.sysid, alt: 30 });

// Where a drone is from home: metres and degrees from the north.
export function fromHome(d: Drone): { m: number; bearing: number } | null {
  if (d.lat == null || d.lon == null || !d.home) return null;
  const r = Math.PI / 180, dLat = (d.lat - d.home.lat) * r, dLon = (d.lon - d.home.lon) * r * Math.cos(d.home.lat * r);
  const m = Math.hypot(dLat, dLon) * 6_371_000, bearing = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  return { m, bearing };
}
const secondsSilent = (d: Drone, now = Date.now()) => (now - d.seen) / 1000;
const lost = (d: Drone) => secondsSilent(d) > LOST_S;
const goodFix = (d: Drone) => d.fix >= 3 && d.sats >= 6;
const all = (ds: Drones) => [...ds.values()].sort((a, b) => a.sysid - b.sysid);
const tick = (d: Drone, on: boolean, label: string): Seg => ({ label, on, id: droneId(d) });
const plotOf = (d: Drone): Plot | null => {
  const at = fromHome(d);
  if (!at) return null;
  const tone = lost(d) || (d.battery != null && d.battery < CRITICAL) ? 'critical' : (d.battery != null && d.battery < LOW) || !goodFix(d) ? 'warn' : undefined;
  return { bearing: at.bearing, range: at.m / RADAR_M, label: `${nameOf(d)} · ${num(at.m, 0)} m ${compass(at.bearing)}${d.alt != null ? ` · ${num(d.alt, 0)} m up` : ''}`, id: droneId(d), on: d.flying, tone };
};

// ─── The swarm, by dimension ───

export const swarm: System = { id: 'swarm', title: 'Swarm', channels: [
  { key: 'where', name: 'Around home', glyph: g.radar, read: (ds) => {
    const list = all(ds);
    if (!list.length) return null;
    const flying = list.filter((d) => d.flying), plots = list.map(plotOf).filter((p): p is Plot => !!p);
    const far = list.map((d) => fromHome(d)?.m ?? 0), spread = Math.max(0, ...far);
    const out = list.filter((d) => (fromHome(d)?.m ?? 0) > RADAR_M);
    return { kind: 'p', v: clamp(flying.length / list.length), ids: list.map(droneId), big: `${flying.length} flying`, label: `of ${list.length} · farthest ${num(spread, 0)} m`, plots,
      list: list.map((d) => { const at = fromHome(d); return tick(d, d.flying, `${nameOf(d)} · ${at ? `${num(at.m, 0)} m ${compass(at.bearing)}` : 'no position'} · ${t.modes[d.mode] ?? d.mode}`); }),
      alert: out.length ? got(1, `${out.length} far`, 'range', listOf(out.map((d) => t.farWhy(nameOf(d), Math.round(fromHome(d)!.m)))), out.map(rtl), t.bringAllHome) : undefined };
  } },
  { key: 'modes', name: 'Modes', glyph: g.mode, read: (ds) => {
    const list = all(ds);
    if (!list.length) return null;
    const segs = list.map((d) => tick(d, d.flying, `${nameOf(d)} · ${t.modes[d.mode] ?? d.mode}${d.armed ? '' : ' · disarmed'}`));
    const modes = [...new Set(list.map((d) => t.modes[d.mode] ?? d.mode))];
    return { kind: 's', segs, ids: list.map(droneId), list: segs, big: modes.length === 1 ? modes[0] : `${modes.length} modes`, label: listOf(modes.slice(0, 4)) };
  } },
] };

export const power: System = { id: 'power', title: 'Power', channels: [
  { key: 'battery', name: 'Batteries', glyph: g.battery, read: (ds) => {
    const list = all(ds).filter((d) => d.battery != null).sort((a, b) => a.battery! - b.battery!);
    if (!list.length) return null;
    const low = list.filter((d) => d.battery! < LOW), critical = low.filter((d) => d.battery! < CRITICAL);
    const segs = list.map((d) => tick(d, d.battery! >= LOW, `${nameOf(d)} · ${num(d.battery!, 0)}%${d.voltage != null ? ` · ${num(d.voltage, 1)} V` : ''}`));
    const flyingLow = low.filter((d) => d.flying);
    return { kind: 's', segs, ids: list.map(droneId), list: segs, big: low.length ? `${low.length} low` : `${num(list[0].battery!, 0)}% lowest`, label: low.length ? listOf(low.map(nameOf)) : nameOf(list[0]),
      alert: low.length ? got(critical.length ? 2 : 1, `${num(low[0].battery!, 0)}%`, 'battery', t.swarmBattery(low.length, listOf(low.map((d) => `${nameOf(d)} ${num(d.battery!, 0)}%`))), flyingLow.map(rtl), flyingLow.length ? (flyingLow.length === 1 ? t.bringHome : t.bringAllHome) : t.gotIt) : undefined };
  } },
  { key: 'voltage', name: 'Voltage', glyph: g.bolt, read: (ds) => {
    const list = all(ds).filter((d) => d.voltage != null).sort((a, b) => a.voltage! - b.voltage!);
    if (!list.length) return null;
    return { kind: 'p', v: clamp((list[0].voltage! - 13) / 4), ids: list.map(droneId), big: `${num(list[0].voltage!, 1)} V`, label: `lowest · ${nameOf(list[0])}` };
  } },
] };

export const link: System = { id: 'link', title: 'Link', channels: [
  { key: 'heartbeat', name: 'Heard from', glyph: g.link, read: (ds) => {
    const list = all(ds).sort((a, b) => secondsSilent(b) - secondsSilent(a));
    if (!list.length) return null;
    const gone = list.filter(lost);
    const segs = list.map((d) => tick(d, !lost(d), `${nameOf(d)} · ${lost(d) ? `${num(secondsSilent(d), 0)} s ago` : 'now'}`));
    return { kind: 's', segs, ids: list.map(droneId), list: segs, big: gone.length ? `${gone.length} lost` : 'All heard', label: gone.length ? listOf(gone.map(nameOf)) : `${list.length} on the link`,
      alert: gone.length ? got(2, `${gone.length} lost`, 'link', t.swarmLost(gone.length, listOf(gone.map((d) => `${nameOf(d)} ${num(secondsSilent(d), 0)} s`)))) : undefined };
  } },
  { key: 'gps', name: 'GPS', glyph: g.satellite, read: (ds) => {
    const list = all(ds).sort((a, b) => Number(goodFix(a)) - Number(goodFix(b)) || a.sats - b.sats);
    if (!list.length) return null;
    const poor = list.filter((d) => !goodFix(d));
    const segs = list.map((d) => tick(d, goodFix(d), `${nameOf(d)} · ${d.fix >= 3 ? '3D' : d.fix === 2 ? '2D' : 'no'} fix · ${d.sats} sats`));
    return { kind: 's', segs, ids: list.map(droneId), list: segs, big: poor.length ? `${poor.length} poor` : 'All 3D', label: poor.length ? listOf(poor.map(nameOf)) : `${Math.min(...list.map((d) => d.sats))} satellites at least`,
      alert: poor.length ? got(poor.some((d) => d.flying) ? 2 : 1, `${poor.length} poor`, 'fix', t.swarmFix(poor.length, listOf(poor.map((d) => `${nameOf(d)} ${d.sats} sats`)))) : undefined };
  } },
] };

export const flight: System = { id: 'flight', title: 'Flight', channels: [
  { key: 'altitude', name: 'Altitude', glyph: g.altitude, read: (ds) => {
    const list = all(ds).filter((d) => d.alt != null).sort((a, b) => b.alt! - a.alt!);
    if (!list.length) return null;
    const flying = list.filter((d) => d.flying);
    const segs = list.map((d) => tick(d, d.flying, `${nameOf(d)} · ${num(d.alt!, 0)} m`));
    return { kind: 's', segs, ids: list.map(droneId), list: segs, big: flying.length ? `${num(list[0].alt!, 0)} m` : 'On the ground', label: flying.length ? `highest · ${nameOf(list[0])}` : `${list.length} landed` };
  } },
  { key: 'speed', name: 'Speed', glyph: g.speed, read: (ds) => {
    const list = all(ds).filter((d) => d.groundspeed != null).sort((a, b) => b.groundspeed! - a.groundspeed!);
    if (!list.length) return null;
    return { kind: 'p', v: clamp(list[0].groundspeed! / 20), ids: list.map(droneId), big: `${num(list[0].groundspeed!, 1)} m/s`, label: `fastest · ${nameOf(list[0])}`, bearing: list[0].heading ?? undefined };
  } },
] };

export const systems: System[] = [swarm, power, link, flight];

// ─── One object per drone: the groups axis ───

export function groupsOf(ds: Drones): Group[] {
  const byType = new Map<string, Drone[]>();
  for (const d of all(ds)) byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  return [...byType.entries()].map(([type, list]) => ({ title: `${type[0].toUpperCase()}${type.slice(1)}s`, items: list.map((d) => ({ id: String(d.sysid), name: nameOf(d) })) }));
}

const droneChannels: { key: string; name: string; glyph: string; read: (d: Drone) => Reading | null }[] = [
  { key: 'swarm/mode', name: 'Mode', glyph: g.mode, read: (d) => {
    const id = droneId(d);
    const options = PICKABLE.includes(d.mode) ? PICKABLE : [d.mode, ...PICKABLE];
    const segs: Seg[] = options.map((m) => ({ label: t.modes[m] ?? m, on: m === d.mode, id, act: m === d.mode ? undefined : setMode(d, m) }));
    return { kind: 'c', segs, ids: [id], big: t.modes[d.mode] ?? d.mode, label: d.flying ? 'flying' : d.armed ? 'armed, on the ground' : 'disarmed' };
  } },
  { key: 'swarm/armed', name: 'Armed', glyph: g.arm, read: (d) => {
    const id = droneId(d);
    return { kind: 's', segs: [{ label: 'Armed', on: d.armed, id, act: arm(d, !d.armed) }], ids: [id], big: d.armed ? 'Armed' : 'Disarmed', label: d.flying ? 'in the air' : 'on the ground',
      ...(d.armed && !d.flying ? { alert: { level: 1, big: 'Armed', label: 'on the ground', key: 'armed-ground', why: `${nameOf(d)} is armed on the ground`, verb: 'Take off to 30 m', acts: [takeoff(d)] } } : {}) };
  } },
  { key: 'swarm/where', name: 'From home', glyph: g.home, read: (d) => {
    const at = fromHome(d), id = droneId(d), plot = plotOf(d);
    if (!at) return null;
    return { kind: 'p', v: clamp(at.m / RADAR_M), ids: [id], big: `${num(at.m, 0)} m`, label: `${compass(at.bearing)} of home`, bearing: at.bearing, plots: plot ? [plot] : undefined,
      alert: at.m > RADAR_M ? got(1, `${num(at.m, 0)} m`, 'range', t.farWhy(nameOf(d), Math.round(at.m)), d.flying ? [rtl(d)] : [], d.flying ? t.bringHome : t.gotIt) : undefined };
  } },
  { key: 'flight/altitude', name: 'Altitude', glyph: g.altitude, read: (d) => {
    if (d.alt == null) return null;
    return { kind: 'p', v: clamp(d.alt / 120), ids: [droneId(d)], big: `${num(d.alt, 0)} m`, label: `${d.climb != null && Math.abs(d.climb) > 0.3 ? `${d.climb > 0 ? 'climbing' : 'descending'} ${num(Math.abs(d.climb), 1)} m/s` : 'level'}` };
  } },
  { key: 'flight/speed', name: 'Speed', glyph: g.speed, read: (d) => {
    if (d.groundspeed == null) return null;
    return { kind: 'p', v: clamp(d.groundspeed / 20), ids: [droneId(d)], big: `${num(d.groundspeed, 1)} m/s`, bearing: d.heading ?? undefined, label: d.heading != null ? `heading ${compass(d.heading)}` : 'over ground' };
  } },
  { key: 'power/battery', name: 'Battery', glyph: g.battery, read: (d) => {
    if (d.battery == null) return null;
    const id = droneId(d);
    return { kind: 'p', v: clamp(d.battery / 100), ids: [id], big: `${num(d.battery, 0)}%`, label: d.voltage != null ? `${num(d.voltage, 1)} V` : 'battery',
      alert: d.battery < LOW ? got(d.battery < CRITICAL ? 2 : 1, `${num(d.battery, 0)}%`, 'battery', t.batteryWhy(nameOf(d), Math.round(d.battery)), d.flying ? [rtl(d)] : [], d.flying ? t.bringHome : t.gotIt) : undefined };
  } },
  { key: 'link/heartbeat', name: 'Link', glyph: g.link, read: (d) => {
    const s = secondsSilent(d), id = droneId(d);
    return { kind: 'p', v: clamp(1 - s / LOST_S), ids: [id], big: lost(d) ? `${num(s, 0)} s` : 'Live', label: lost(d) ? 'since the last message' : 'heartbeat',
      alert: lost(d) ? got(2, `${num(s, 0)} s`, 'link', t.lostWhy(nameOf(d), Math.round(s))) : undefined };
  } },
  { key: 'link/gps', name: 'GPS', glyph: g.satellite, read: (d) => {
    const id = droneId(d);
    return { kind: 'p', v: clamp(d.sats / 20), ids: [id], big: d.fix >= 3 ? '3D fix' : d.fix === 2 ? '2D fix' : 'No fix', label: `${d.sats} satellites`,
      alert: !goodFix(d) ? got(d.flying ? 2 : 1, d.fix >= 3 ? '3D fix' : d.fix === 2 ? '2D fix' : 'No fix', 'fix', t.fixWhy(nameOf(d), d.sats), d.flying ? [setMode(d, 'LAND')] : [], d.flying ? t.land : t.gotIt) : undefined };
  } },
];

export function droneSystems(ds: Drones, chosen: string[], hidden: (system: string, channel: string) => boolean): System[] {
  return all(ds).map((d) => ({
    id: droneId(d), title: nameOf(d),
    channels: droneChannels.filter((ch) => { const [sys, key] = ch.key.split('/'); return chosen.includes(sys) && !hidden(sys, key); })
      .map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (now: Drones) => { const x = now.get(d.sysid); return x ? ch.read(x) : null; } })),
  }));
}
