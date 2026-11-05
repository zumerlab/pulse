// A yacht that is not there: Tehuelche, motor-sailing off Mar del Plata, as
// the paths a Signal K server would report, moving a little every couple of
// seconds and answering the PUTs, so the app (and its tests) run without a
// server. Same shape as the WebSocket source.

import type { HistoryRow, Status } from '@zumer/pulse';
import type { Act, Meta, Notification, Target, Value, VesselSource } from '../source.ts';
import { t } from '../strings.ts';

const R = Math.PI / 180;                        // degrees to radians
const KN = 1 / 1.943844;                        // knots to m/s
const K = 273.15;

// Every path the yacht reports, SI like the server: m/s, rad, K, Pa, ratios, m, m³.
const YACHT: Record<string, unknown> = {
  'navigation.position': { latitude: -38.052, longitude: -57.413 },
  'navigation.speedOverGround': 6.4 * KN,
  'navigation.speedThroughWater': 6.1 * KN,
  'navigation.courseOverGroundTrue': 215 * R,
  'navigation.headingMagnetic': 212 * R,
  'navigation.headingTrue': 209 * R,
  'navigation.magneticVariation': -3 * R,
  'navigation.trip.log': 18_520,
  'environment.depth.belowTransducer': 2.7,
  'environment.depth.belowKeel': 1.1,
  'environment.wind.angleApparent': 38 * R,
  'environment.wind.speedApparent': 14.2 * KN,
  'environment.wind.angleTrueWater': 61 * R,
  'environment.wind.speedTrue': 10.8 * KN,
  'environment.wind.directionTrue': 272 * R,
  'environment.outside.pressure': 100_420,
  'environment.outside.temperature': 24.2 + K,
  'environment.water.temperature': 18.4 + K,
  'electrical.batteries.house.capacity.stateOfCharge': 0.24,
  'electrical.batteries.house.voltage': 12.62,
  'electrical.batteries.house.current': 14.1,
  'electrical.batteries.house.capacity.timeRemaining': 7_200,
  'electrical.batteries.start.voltage': 13.9,
  'electrical.batteries.start.current': 0.4,
  'electrical.solar.main.panelPower': 85,
  'tanks.fuel.0.currentLevel': 0.62,
  'tanks.fuel.0.capacity': 0.4,
  'tanks.freshWater.0.currentLevel': 0.41,
  'tanks.freshWater.0.capacity': 0.3,
  'tanks.blackWater.0.currentLevel': 0.86,
  'tanks.blackWater.0.capacity': 0.08,
  'propulsion.port.revolutions': 1850 / 60,
  'propulsion.port.temperature': 88 + K,
  'propulsion.port.oilPressure': 310_000,
  'propulsion.port.fuel.rate': 2.4 / 3_600_000,
  'steering.autopilot.state': 'auto',
  'steering.autopilot.target.headingMagnetic': 212 * R,
  'steering.rudderAngle': 2 * R,
  'notifications.electrical.batteries.house.capacity.stateOfCharge': { state: 'warn', message: 'House battery at 24%', method: ['visual'] } satisfies Notification,
  'notifications.tanks.blackWater.0.currentLevel': { state: 'alert', message: 'Holding tank 86% full', method: ['visual'] } satisfies Notification,
  'notifications.environment.depth.belowTransducer': { state: 'warn', message: 'Shallow water: 2.7 m under the transducer', method: ['visual', 'sound'] } satisfies Notification,
};
const META: Record<string, Meta> = {
  'navigation.speedOverGround': { units: 'm/s', displayName: 'Speed over ground' },
  'navigation.speedThroughWater': { units: 'm/s', displayName: 'Speed through water' },
  'navigation.courseOverGroundTrue': { units: 'rad', displayName: 'Course over ground' },
  'navigation.headingMagnetic': { units: 'rad', displayName: 'Heading (magnetic)' },
  'navigation.headingTrue': { units: 'rad', displayName: 'Heading (true)' },
  'navigation.magneticVariation': { units: 'rad' },
  'navigation.trip.log': { units: 'm', displayName: 'Trip log' },
  'environment.depth.belowTransducer': { units: 'm', displayName: 'Depth below transducer' },
  'environment.depth.belowKeel': { units: 'm', displayName: 'Depth below keel' },
  'environment.wind.angleApparent': { units: 'rad', displayName: 'Apparent wind angle' },
  'environment.wind.speedApparent': { units: 'm/s', displayName: 'Apparent wind speed' },
  'environment.wind.angleTrueWater': { units: 'rad', displayName: 'True wind angle' },
  'environment.wind.speedTrue': { units: 'm/s', displayName: 'True wind speed' },
  'environment.wind.directionTrue': { units: 'rad', displayName: 'True wind direction' },
  'environment.outside.pressure': { units: 'Pa', displayName: 'Barometer' },
  'environment.outside.temperature': { units: 'K', displayName: 'Air temperature' },
  'environment.water.temperature': { units: 'K', displayName: 'Water temperature' },
  'electrical.batteries.house.capacity.stateOfCharge': { units: 'ratio', displayName: 'House bank' },
  'electrical.batteries.house.voltage': { units: 'V' },
  'electrical.batteries.house.current': { units: 'A' },
  'electrical.batteries.house.capacity.timeRemaining': { units: 's' },
  'electrical.batteries.start.voltage': { units: 'V', displayName: 'Engine battery' },
  'electrical.batteries.start.current': { units: 'A' },
  'electrical.solar.main.panelPower': { units: 'W', displayName: 'Solar panels' },
  'tanks.fuel.0.currentLevel': { units: 'ratio', displayName: 'Diesel' },
  'tanks.fuel.0.capacity': { units: 'm3' },
  'tanks.freshWater.0.currentLevel': { units: 'ratio', displayName: 'Fresh water' },
  'tanks.freshWater.0.capacity': { units: 'm3' },
  'tanks.blackWater.0.currentLevel': { units: 'ratio', displayName: 'Holding tank' },
  'tanks.blackWater.0.capacity': { units: 'm3' },
  'propulsion.port.revolutions': { units: 'Hz', displayName: 'Engine' },
  'propulsion.port.temperature': { units: 'K', displayName: 'Coolant' },
  'propulsion.port.oilPressure': { units: 'Pa', displayName: 'Oil pressure' },
  'propulsion.port.fuel.rate': { units: 'm3/s', displayName: 'Fuel rate' },
  'steering.autopilot.state': { displayName: 'Autopilot' },
  'steering.autopilot.target.headingMagnetic': { units: 'rad', displayName: 'Autopilot target' },
  'steering.rudderAngle': { units: 'rad', displayName: 'Rudder' },
};

const jitter = (v: number, step: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * 2 * step));
// The vessels around, from their AIS, metres north and east of where the
// yacht starts, each on its course at its speed: a freighter on a crossing
// course that will pass 0.3 nm off in about fourteen minutes
// (the one that calls), a fishing boat opening to the northeast, the ferry to
// Buenos Aires crossing well ahead, and a sailboat the yacht slowly overtakes.
// The scene starts over every twenty minutes.
type Around = Omit<Target, 'lat' | 'lon' | 'at'> & { n: number; e: number };
const AROUND: Around[] = [
  { id: 'vessels.urn:mrn:imo:mmsi:636019825', mmsi: '636019825', name: 'MSC ALICIA', n: -4972, e: 4110, cog: 300 * R, sog: 14 * KN, type: 'Cargo', length: 199, destination: 'Buenos Aires', state: 'motoring' },
  { id: 'vessels.urn:mrn:imo:mmsi:701006201', mmsi: '701006201', name: 'DON PEDRO', n: 880, e: 760, cog: 40 * R, sog: 5 * KN, type: 'Fishing', length: 24, state: 'fishing' },
  { id: 'vessels.urn:mrn:imo:mmsi:701000733', mmsi: '701000733', name: 'BUQUEBUS', n: 5200, e: -4100, cog: 120 * R, sog: 32 * KN, type: 'Passenger', length: 99, destination: 'Montevideo', state: 'motoring' },
  { id: 'vessels.urn:mrn:imo:mmsi:701001122', mmsi: '701001122', name: 'ALMA', n: -2200, e: -1500, cog: 210 * R, sog: 5.5 * KN, type: 'Sailing', length: 11, state: 'sailing' },
];
const SCENE_S = 20 * 60, TICK_S = 2;
const LAT0 = -38.052, LON0 = -57.413;
const place = (n: number, e: number) => ({ lat: LAT0 + n / 111_320, lon: LON0 + e / (111_320 * Math.cos((LAT0 * Math.PI) / 180)) });
// Where something is `s` seconds into the scene, from where it started, its course and its speed.
const at = (n: number, e: number, cog: number, sog: number, s: number) => place(n + sog * Math.cos(cog) * s, e + sog * Math.sin(cog) * s);

export class DemoSource implements VesselSource {
  readonly values = new Map<string, Value>();
  readonly meta = new Map<string, Meta>(Object.entries(META));
  readonly others = new Map<string, Target>();
  private scene = 0;                 // seconds into the traffic's scene
  readonly name = 'Tehuelche';
  status: Status = 'signed-out';
  error = '';
  private timer = 0;
  private listeners = new Set<(paths: string[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (paths: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    const now = Date.now();
    this.values.clear();
    for (const [path, value] of Object.entries(YACHT)) this.values.set(path, { value, at: path.startsWith('notifications.') ? now - 25 * 60_000 : now });
    this.scene = 0;
    this.moveTraffic(now);
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.values.keys()]));
    this.timer = window.setInterval(() => this.tick(), 2000);
  }
  stop() { clearInterval(this.timer); this.values.clear(); this.others.clear(); this.setStatus('signed-out'); }

  // The boat moves: the numbers of a boat under way move, the depth too (its
  // alert carries a key, so the drifting value does not make it a new one).
  private tick() {
    const now = Date.now(), changed: string[] = [];
    const move = (path: string, step: number, lo: number, hi: number) => {
      const v = this.values.get(path)?.value;
      if (typeof v !== 'number') return;
      this.values.set(path, { value: jitter(v, step, lo, hi), at: now });
      changed.push(path);
    };
    move('navigation.speedOverGround', 0.15, 5.6 * KN, 7.2 * KN);
    move('navigation.headingMagnetic', 1.5 * R, 208 * R, 216 * R);
    move('navigation.courseOverGroundTrue', 0.5 * R, 214 * R, 216 * R);
    move('environment.wind.angleApparent', 3 * R, 30 * R, 46 * R);
    move('environment.wind.speedApparent', 0.4, 12 * KN, 17 * KN);
    move('environment.depth.belowTransducer', 0.1, 2.4, 2.95);
    move('steering.rudderAngle', 1 * R, -4 * R, 4 * R);
    move('electrical.batteries.house.current', 0.6, 12, 16);
    move('electrical.solar.main.panelPower', 6, 60, 110);
    move('propulsion.port.revolutions', 10 / 60, 1820 / 60, 1880 / 60);
    const p = this.values.get('environment.outside.pressure')?.value;
    if (typeof p === 'number') { this.values.set('environment.outside.pressure', { value: p - 1, at: now }); changed.push('environment.outside.pressure'); }
    // The traffic moves along its course, and the yacht along hers.
    this.scene = (this.scene + TICK_S) % SCENE_S;
    this.moveTraffic(now);
    changed.push('navigation.position', 'traffic');
    this.listeners.forEach((fn) => fn(changed));
  }

  // Everyone where the scene puts them: the vessels on their courses, the yacht where her own course and speed took her.
  private own = { n: 0, e: 0 };
  private moveTraffic(now: number) {
    if (!this.scene) this.own = { n: 0, e: 0 };
    else {
      const cog = this.values.get('navigation.courseOverGroundTrue')?.value as number, sog = this.values.get('navigation.speedOverGround')?.value as number;
      this.own = { n: this.own.n + sog * Math.cos(cog) * TICK_S, e: this.own.e + sog * Math.sin(cog) * TICK_S };
    }
    const own = place(this.own.n, this.own.e);
    this.values.set('navigation.position', { value: { latitude: own.lat, longitude: own.lon }, at: now });
    this.others.clear();
    for (const { n, e, ...a } of AROUND) this.others.set(a.id, { ...a, ...at(n, e, a.cog!, a.sog!, this.scene), at: now });
  }

  // The server's PUTs, answered a moment later like a real round trip: the
  // autopilot takes a state and a target; anything else is refused.
  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    await new Promise((r) => setTimeout(r, 400));
    if (!a.path.startsWith('steering.autopilot.')) throw new Error(`no handler for ${a.path}`);
    this.values.set(a.path, { value: a.value, at: Date.now() });
    this.listeners.forEach((fn) => fn([a.path]));
  }

  // A day of each path: a wave around the current value (the barometer
  // falling through it), as the history API would give it, every ten minutes.
  async history(paths: string[], hours: number) {
    const now = Date.now() / 1000, out: Record<string, HistoryRow[]> = {};
    for (const path of paths) {
      const v = this.values.get(path)?.value;
      if (typeof v !== 'number') { out[path] = []; continue; }
      const rel = path.includes('wind') ? 0.35 : path.includes('speed') ? 0.3 : path.includes('depth') ? 0.8 : path.includes('stateOfCharge') ? 0.5 : path.includes('pressure') ? 0.008 : path.includes('revolutions') ? 0.4 : 0.08;
      const rows: HistoryRow[] = [];
      for (let m = hours * 60; m >= 0; m -= 10) {
        const tt = now - m * 60, phase = m / 60;
        const trend = path.includes('pressure') || path.includes('stateOfCharge') ? 1 + rel * phase / 12 : 1 + rel * Math.sin(phase / 24 * Math.PI * 2);
        rows.push({ s: String(Math.max(0, v * trend + (Math.random() - 0.5) * v * rel * 0.2)), lu: Math.round(tt) });
      }
      out[path] = rows;
    }
    return out;
  }
}
