// Eighty-four trams that are not there: Helsinki's eleven lines with the
// vehicles the feed would report, moving every second and handed on once a
// second like the live source, so the app (and its tests) run without the
// broker. Same shape as the live source.

import type { Status } from '@zumer/pulse';
import type { Act, FleetSource, Vehicle, Vehicles } from '../source.ts';
import { t } from '../strings.ts';

// The lines of the tram network and where each one goes.
const LINES: [string, string, string, number][] = [
  ['1', 'Käpylä', 'Eira', 7], ['2', 'Olympiaterminaali', 'Pasila', 8], ['3', 'Nordenskiöldinkatu', 'Olympiaterminaali', 9], ['4', 'Munkkiniemi', 'Katajanokka', 9],
  ['6', 'Arabia', 'Hietalahti', 8], ['7', 'Pasila', 'Länsiterminaali', 9], ['8', 'Arabia', 'Jätkäsaari', 8], ['9', 'Pasila', 'Länsiterminaali', 8],
  ['10', 'Pikku Huopalahti', 'Kirurgi', 8], ['13', 'Nihti', 'Pasila', 5], ['15', 'Itäkeskus', 'Keilaniemi', 5],
];
// The ones that call: late by this much (seconds behind), crowded, blind.
const LATE: Record<number, number> = { 1012: -248, 1033: -407, 1041: -195, 1060: -612, 1017: -221, 1052: -310, 1074: -186, 1008: -455, 1066: -270, 1029: -201 };
const EARLY: Record<number, number> = { 1005: 150, 1045: 131, 1071: 180, 1024: 125 };
const CROWDED: Record<number, number> = { 1012: 94, 1037: 86, 1050: 91 };
const BLIND = new Set([1060, 1079]);
const SILENT = new Set([1079]);

// A seeded wobble, so the recorded day looks the same every time it opens.
const seeded = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };

export function yard(now: number): Vehicle[] {
  const out: Vehicle[] = [];
  let veh = 1000;
  for (const [desi, a, b, n] of LINES) {
    for (let i = 0; i < n; i++) {
      veh++;
      const r = seeded(veh), dir = i % 2 ? '2' : '1';
      const dl = LATE[veh] ?? EARLY[veh] ?? Math.round((r - 0.5) * 100);
      const stopped = r > 0.8;
      out.push({
        id: `40/${veh}`, mode: 'tram', oper: 40, veh, route: `10${desi.padStart(2, '0')}`, desi, dir, headsign: dir === '1' ? a : b,
        lat: 60.17 + (r - 0.5) * 0.08, long: 24.94 + (seeded(veh * 7) - 0.5) * 0.12,
        spd: stopped ? 0 : 3 + r * 10, hdg: Math.round(seeded(veh * 3) * 360), dl, occu: CROWDED[veh] ?? Math.round(5 + r * 60), drst: stopped && r > 0.9 ? 1 : 0,
        loc: BLIND.has(veh) ? 'DR' : 'GPS', stop: 1000000 + Math.round(r * 9000), at: now - (SILENT.has(veh) ? 95_000 : 500), seen: now - (SILENT.has(veh) ? 95_000 : 500),
      });
    }
  }
  return out;
}

export class DemoSource implements FleetSource {
  readonly vehicles: Vehicles = new Map();
  readonly modes = ['tram'];
  status: Status = 'signed-out';
  error = '';
  rate = 0;
  private timer = 0;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    this.vehicles.clear();
    for (const v of yard(Date.now())) this.vehicles.set(v.id, v);
    this.rate = this.vehicles.size * 60;
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.vehicles.keys()]));
    this.timer = window.setInterval(() => this.tick(), 1000);
  }
  stop() { clearInterval(this.timer); this.vehicles.clear(); this.setStatus('signed-out'); }

  // The trams move: speeds and headings wander, the ones under way creep
  // along the timetable. The ones that call stay as they are: a late tram
  // that drifts in and out of "late" would call again each time.
  private tick() {
    const now = Date.now(), changed: string[] = [];
    for (const v of this.vehicles.values()) {
      if (SILENT.has(v.veh)) continue;
      const moving = (v.spd ?? 0) > 0;
      const next: Vehicle = { ...v, seen: now, at: now,
        spd: moving ? Math.max(0.5, Math.min(14, (v.spd ?? 5) + (Math.random() - 0.5) * 1.5)) : v.spd,
        hdg: moving && v.hdg != null ? (v.hdg + Math.round((Math.random() - 0.5) * 6) + 360) % 360 : v.hdg };
      this.vehicles.set(v.id, next);
      if (moving) changed.push(v.id);
    }
    this.listeners.forEach((fn) => fn(changed));
  }

  async act(a: Act) { throw new Error(`a fleet takes no ${a.kind}`); }
}
