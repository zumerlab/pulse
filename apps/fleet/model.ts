import { listOf, num, type Alert, type Group, type Reading, type Seg } from '@zumer/pulse';
import type { Vehicle, Vehicles } from './source.ts';
import { t } from './strings.ts';

// A fleet read two ways. On the systems axis, the fleet as one object per
// dimension of the service (on time, lines, load, the fleet itself), each
// member a tick on a swarm ring, the failing ones painted. On the groups
// axis, one object per vehicle, with its delay, its motion (the heading as
// a bearing), its load and its doors. Nothing here takes a command: a late
// tram is seen, not fixed.

export type Channel = { key: string; name: string; glyph: string; read: (v: Vehicles) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 3',
  ahead: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l-3 3',
  lines: 'M4 6h16 M4 12h16 M4 18h16 M8 4v4 M14 10v4 M10 16v4',
  tram: 'M6 4h12v12H6z M6 10h12 M9 16v3 M15 16v3 M7 20h10 M9 7h2 M13 7h2 M9 13h.01 M15 13h.01',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20a6 6 0 0 1 12 0 M17 11a3 3 0 1 0 0-6 M21 20a6 6 0 0 0-5-5.9',
  doors: 'M4 4h16v16H4z M12 4v16 M9 12h.01 M15 12h.01',
  satellite: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v5 M12 16v5 M3 12h5 M16 12h5',
  speed: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  silence: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
// The alert's key is its label (late, crowded, GPS): the value in `big` drifts, the alert stays the same.
const got = (level: 1 | 2, big: string, label: string, why: string): Alert => ({ level, big, label, why, key: label, verb: t.gotIt, acts: [] });
export const compass = (d: number) => t.compass[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
export const kmh = (ms: number) => ms * 3.6;
// "4:30", for seconds.
export const mmss = (s: number) => { const a = Math.round(Math.abs(s)); return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`; };
// Behind the timetable by this much, a vehicle is late; by twice, very late.
export const LATE = 180, VERY_LATE = 360, EARLY = 120, CROWDED = 80;
export const lateBy = (v: Vehicle) => (v.dl != null && v.dl < 0 ? -v.dl : 0);
export const earlyBy = (v: Vehicle) => (v.dl != null && v.dl > 0 ? v.dl : 0);
export const hasFix = (v: Vehicle) => v.loc === 'GPS' || v.loc === 'ODO' || v.loc === 'MAN';
export const nameOf = (v: Vehicle) => `${t.modeOne[v.mode] ?? v.mode} ${v.desi || v.route} · ${v.veh}`;
export const toOf = (v: Vehicle) => v.headsign || v.route;
// The vehicle's id as a thing, and the group it belongs to (its line) for the gear.
export const VEH = 'veh:';
export const isVehicle = (id: string) => id.startsWith(VEH);
export const vehicleId = (id: string) => id.slice(VEH.length);
export const lineOf = (v: Vehicle) => v.desi || v.route || '?';
const byLine = (a: Vehicle, b: Vehicle) => lineOf(a).localeCompare(lineOf(b), undefined, { numeric: true }) || a.veh - b.veh;
const vehicles = (vs: Vehicles) => [...vs.values()].sort(byLine);
const what = (vs: Vehicle[]) => { const modes = [...new Set(vs.map((v) => v.mode))]; return modes.length === 1 ? t.modes[modes[0]] ?? modes[0] : 'vehicles'; };
// A member as a tick: on when fine; and as a line of the detail's list.
const tick = (v: Vehicle, on: boolean, label: string): Seg => ({ label, on, id: VEH + v.id });

// ─── The fleet, by dimension ───

export const service: System = { id: 'service', title: 'Service', channels: [
  { key: 'late', name: 'On time', glyph: g.clock, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    // The late ones first, the latest of them in front, so the painted ticks sit together.
    const ordered = [...all].sort((a, b) => lateBy(b) - lateBy(a) || byLine(a, b));
    const late = ordered.filter((v) => lateBy(v) >= LATE), very = late.filter((v) => lateBy(v) >= VERY_LATE);
    const segs = ordered.map((v) => tick(v, lateBy(v) < LATE, `${lineOf(v)} · ${v.veh}${lateBy(v) >= 60 ? ` · +${mmss(lateBy(v))}` : earlyBy(v) >= 60 ? ` · −${mmss(earlyBy(v))}` : ''}`));
    const share = late.length / all.length, worst = late[0];
    return { kind: 's', segs, ids: all.map((v) => VEH + v.id), big: `${all.length - late.length} of ${all.length}`, list: segs,
      label: worst ? `on time · worst ${nameOf(worst)} ${t.late(mmss(lateBy(worst)))}` : `${what(all)} on time`,
      alert: late.length && (share >= 0.25 || very.length >= 3) ? { level: 2, big: `${late.length} late`, label: what(all), key: 'late', fail: late.map((_, i) => i),
        why: t.fleetLate(late.length, all.length, what(all), listOf(late.slice(0, 3).map((v) => `${nameOf(v)} ${mmss(lateBy(v))}`))), verb: t.gotIt, acts: [] }
        : late.length && share >= 0.1 ? { level: 1, big: `${late.length} late`, label: what(all), key: 'late', fail: late.map((_, i) => i),
          why: t.fleetLate(late.length, all.length, what(all), listOf(late.slice(0, 3).map((v) => `${nameOf(v)} ${mmss(lateBy(v))}`))), verb: t.gotIt, acts: [] } : undefined };
  } },
  { key: 'early', name: 'Running early', glyph: g.ahead, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const early = all.filter((v) => earlyBy(v) >= EARLY).sort((a, b) => earlyBy(b) - earlyBy(a));
    return { kind: 'p', v: clamp(early.length / Math.max(1, all.length) * 4), ids: early.map((v) => VEH + v.id).concat(early.length ? [] : [VEH + all[0].id]), big: `${early.length}`,
      label: early.length ? `ahead of the timetable · ${nameOf(early[0])} ${t.early(mmss(earlyBy(early[0])))}` : 'ahead of the timetable',
      list: early.map((v) => tick(v, true, `${lineOf(v)} · ${v.veh} · −${mmss(earlyBy(v))}`)) };
  } },
] };

export const lines: System = { id: 'lines', title: 'Lines', channels: [
  { key: 'routes', name: 'Lines', glyph: g.lines, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const byRoute = new Map<string, Vehicle[]>();
    for (const v of all) byRoute.set(lineOf(v), [...(byRoute.get(lineOf(v)) ?? []), v]);
    const routes = [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    const bad = routes.filter(([, list]) => list.some((v) => lateBy(v) >= LATE));
    const ordered = [...bad, ...routes.filter((r) => !bad.includes(r))];
    const segs: Seg[] = ordered.map(([line, list]) => { const late = list.filter((v) => lateBy(v) >= LATE).length; return { label: `${line} · ${list.length}${late ? ` · ${late} late` : ''}`, on: !late, id: `line:${line}` }; });
    return { kind: 's', segs, ids: all.map((v) => VEH + v.id), big: `${routes.length - bad.length} of ${routes.length}`, label: `lines on time · ${all.length} ${what(all)} out`, list: segs,
      alert: bad.length >= Math.max(2, routes.length / 2) ? got(1, `${bad.length} lines late`, 'of ' + routes.length, `${listOf(bad.map(([line]) => line))} ${bad.length === 1 ? 'has' : 'have'} ${what(all)} more than 3 minutes late`) : undefined };
  } },
  { key: 'headways', name: 'Out on the lines', glyph: g.tram, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const moving = all.filter((v) => (v.spd ?? 0) > 0.5);
    return { kind: 'p', v: clamp(moving.length / all.length), ids: all.map((v) => VEH + v.id), big: `${moving.length}`, label: `of ${all.length} moving · ${all.length - moving.length} stopped` };
  } },
] };

export const load: System = { id: 'load', title: 'Load', channels: [
  { key: 'crowded', name: 'Crowding', glyph: g.people, read: (vs) => {
    const all = vehicles(vs).filter((v) => v.occu != null);
    if (!all.length) return null;
    const ordered = [...all].sort((a, b) => (b.occu ?? 0) - (a.occu ?? 0) || byLine(a, b));
    const crowded = ordered.filter((v) => (v.occu ?? 0) >= CROWDED);
    const segs = ordered.map((v) => tick(v, (v.occu ?? 0) < CROWDED, `${lineOf(v)} · ${v.veh} · ${num(v.occu ?? 0, 0)}%`));
    return { kind: 's', segs, ids: all.map((v) => VEH + v.id), big: `${crowded.length} crowded`, list: segs,
      label: crowded.length ? listOf(crowded.slice(0, 3).map(nameOf)) : `fullest ${nameOf(ordered[0])} at ${num(ordered[0].occu ?? 0, 0)}%`,
      alert: crowded.length >= 3 ? { level: 1, big: `${crowded.length} crowded`, label: what(all), key: 'crowded', fail: crowded.map((_, i) => i), why: t.fleetCrowded(crowded.length, listOf(crowded.slice(0, 4).map(nameOf))), verb: t.gotIt, acts: [] } : undefined };
  } },
  { key: 'doors', name: 'At a stop', glyph: g.doors, read: (vs) => {
    const all = vehicles(vs).filter((v) => v.drst != null);
    if (!all.length) return null;
    const open = all.filter((v) => v.drst === 1);
    return { kind: 'p', v: clamp(open.length / all.length), ids: open.map((v) => VEH + v.id).concat(open.length ? [] : [VEH + all[0].id]), big: `${open.length}`, label: `with the doors open · ${all.length - open.length} under way` };
  } },
] };

export const fleet: System = { id: 'fleet', title: 'Fleet', channels: [
  { key: 'reporting', name: 'Reporting', glyph: g.tram, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const modes = [...new Set(all.map((v) => v.mode))];
    return { kind: 'p', v: clamp(all.length / 120), ids: all.map((v) => VEH + v.id), big: `${all.length} ${what(all)}`,
      label: modes.length === 1 ? `on ${new Set(all.map(lineOf)).size} lines` : listOf(modes.map((m) => `${all.filter((v) => v.mode === m).length} ${t.modes[m] ?? m}`)) };
  } },
  { key: 'signal', name: 'GPS', glyph: g.satellite, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const ordered = [...all].sort((a, b) => Number(hasFix(a)) - Number(hasFix(b)) || byLine(a, b));
    const blind = ordered.filter((v) => !hasFix(v));
    const segs = ordered.map((v) => tick(v, hasFix(v), `${lineOf(v)} · ${v.veh} · ${hasFix(v) ? v.loc : 'no fix'}`));
    return { kind: 's', segs, ids: all.map((v) => VEH + v.id), big: blind.length ? `${blind.length} without GPS` : 'All located', list: segs, label: blind.length ? listOf(blind.slice(0, 3).map(nameOf)) : `${all.length} ${what(all)} with a fix`,
      alert: blind.length >= 2 ? { level: 1, big: `${blind.length} blind`, label: what(all), key: 'blind', fail: blind.map((_, i) => i), why: t.fleetNoFix(blind.length, listOf(blind.slice(0, 4).map(nameOf))), verb: t.gotIt, acts: [] } : undefined };
  } },
  { key: 'silent', name: 'Silent', glyph: g.silence, read: (vs) => {
    const all = vehicles(vs);
    if (!all.length) return null;
    const now = Date.now(), silent = all.filter((v) => now - v.seen > 60_000);
    return { kind: 'p', v: clamp(silent.length / all.length * 4), ids: silent.map((v) => VEH + v.id).concat(silent.length ? [] : [VEH + all[0].id]), big: `${silent.length}`, label: 'quiet for over a minute',
      list: silent.map((v) => tick(v, false, `${nameOf(v)} · ${num((now - v.seen) / 60_000, 0)} min`)) };
  } },
] };

export const systems: System[] = [service, lines, load, fleet];

// ─── One object per vehicle: the groups axis ───

// The lines as the gear's groups, each with its vehicles.
export function groupsOf(vs: Vehicles): Group[] {
  const byRoute = new Map<string, Vehicle[]>();
  for (const v of vehicles(vs)) byRoute.set(lineOf(v), [...(byRoute.get(lineOf(v)) ?? []), v]);
  return [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([line, list]) => ({ title: `Line ${line}`, items: list.map((v) => ({ id: v.id, name: `${v.veh} → ${toOf(v)}` })) }));
}

// A vehicle's channels, read from the vehicle itself. The keys carry the
// system they belong to (`service/delay`), so the gear's choices hold on
// both axes.
const vehicleChannels: { key: string; name: string; glyph: string; read: (v: Vehicle) => Reading | null }[] = [
  { key: 'service/delay', name: 'Timetable', glyph: g.clock, read: (v) => {
    if (v.dl == null) return null;
    const late = lateBy(v), early = earlyBy(v), id = VEH + v.id;
    // Under a minute either way is on time: the seconds only in the line under.
    const big = late >= 60 ? `+${mmss(late)}` : early >= 60 ? `−${mmss(early)}` : t.onTime;
    const fine = late < 60 && early < 60;
    return { kind: 'p', v: clamp(late / 600), ids: [id], big, label: fine && (late || early) ? `${late ? `${late} s behind` : `${early} s ahead`} · to ${toOf(v)}` : `to ${toOf(v)}${v.stop ? ` · stop ${v.stop}` : ''}`,
      alert: late >= VERY_LATE ? got(2, big, 'late', t.lateWhy(nameOf(v), toOf(v), mmss(late))) : late >= LATE ? got(1, big, 'late', t.lateWhy(nameOf(v), toOf(v), mmss(late)))
        : early >= EARLY ? got(1, big, 'early', t.earlyWhy(nameOf(v), toOf(v), mmss(early))) : undefined };
  } },
  { key: 'fleet/motion', name: 'Motion', glyph: g.speed, read: (v) => {
    if (v.spd == null) return null;
    const id = VEH + v.id, k = kmh(v.spd);
    return { kind: 'p', v: clamp(k / 60), ids: [id], big: `${num(k, 0)} km/h`, bearing: v.hdg ?? undefined,
      label: `${v.hdg != null ? `heading ${compass(v.hdg)}` : 'heading unknown'} · ${hasFix(v) ? v.loc : 'no GPS fix'}`,
      alert: !hasFix(v) ? got(1, 'No fix', 'GPS', t.noFix(nameOf(v))) : undefined };
  } },
  { key: 'load/crowded', name: 'Load', glyph: g.people, read: (v) => {
    if (v.occu == null) return null;
    const id = VEH + v.id;
    return { kind: 'p', v: clamp(v.occu / 100), ids: [id], big: `${num(v.occu, 0)}%`, label: 'occupancy',
      alert: v.occu >= 90 ? got(1, `${num(v.occu, 0)}%`, 'crowded', t.crowdedWhy(nameOf(v), Math.round(v.occu))) : undefined };
  } },
  { key: 'load/doors', name: 'Doors', glyph: g.doors, read: (v) => {
    if (v.drst == null) return null;
    const id = VEH + v.id, open = v.drst === 1;
    return { kind: 's', segs: [{ label: 'Doors', on: open, id }], ids: [id], big: open ? 'Open' : 'Closed', label: open ? 'at a stop' : 'under way' };
  } },
];

// One object per vehicle, the channels of the systems chosen read from it.
export function vehicleSystems(vs: Vehicles, chosen: string[], hidden: (system: string, channel: string) => boolean): System[] {
  return vehicles(vs).map((v) => ({
    id: VEH + v.id, title: `${t.modeOne[v.mode] ?? v.mode} ${lineOf(v)} → ${toOf(v)}`,
    channels: vehicleChannels.filter((ch) => { const [sys, key] = ch.key.split('/'); return chosen.includes(sys) && !hidden(sys, key); })
      .map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (all: Vehicles) => { const now = all.get(v.id); return now ? ch.read(now) : null; } })),
  }));
}
