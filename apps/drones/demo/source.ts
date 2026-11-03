// Six copters that are not there: a survey around home, one running out
// of battery, one with a poor fix, one armed on the ground, moving every
// half second and answering the commands, so the app (and its tests) run
// without a simulator. Same shape as the mavlink2rest source.

import type { Status } from '@zumer/pulse';
import { type Act, type Drone, type Drones, type SwarmSource, blank } from '../source.ts';
import { t } from '../strings.ts';

const HOME = { lat: -34.9214, lon: -57.9545 };
// Metres north and east of home into degrees.
const at = (n: number, e: number) => ({ lat: HOME.lat + n / 111_320, lon: HOME.lon + e / (111_320 * Math.cos((HOME.lat * Math.PI) / 180)) });

type Flight = { n: number; e: number; alt: number; mode: string; armed: boolean; flying: boolean; battery: number; voltage: number; fix: number; sats: number; heading: number; speed: number; silent?: boolean; leg?: number };
const START: Record<number, Flight> = {
  1: { n: 120, e: -80, alt: 40, mode: 'AUTO', armed: true, flying: true, battery: 64, voltage: 15.1, fix: 3, sats: 14, heading: 90, speed: 6 },
  2: { n: 60, e: -80, alt: 40, mode: 'AUTO', armed: true, flying: true, battery: 61, voltage: 15.0, fix: 3, sats: 13, heading: 90, speed: 6 },
  3: { n: 0, e: -80, alt: 40, mode: 'AUTO', armed: true, flying: true, battery: 58, voltage: 14.9, fix: 3, sats: 12, heading: 90, speed: 6 },
  4: { n: -60, e: -80, alt: 40, mode: 'AUTO', armed: true, flying: true, battery: 55, voltage: 14.8, fix: 3, sats: 15, heading: 90, speed: 6 },
  5: { n: 210, e: 160, alt: 25, mode: 'LOITER', armed: true, flying: true, battery: 17, voltage: 13.9, fix: 3, sats: 11, heading: 200, speed: 0.4 },
  6: { n: 8, e: 5, alt: 0, mode: 'STABILIZE', armed: true, flying: false, battery: 92, voltage: 16.6, fix: 2, sats: 5, heading: 20, speed: 0 },
};

export class DemoSource implements SwarmSource {
  readonly drones: Drones = new Map();
  status: Status = 'signed-out';
  error = '';
  private flights = new Map<number, Flight>();
  private timer = 0;
  private listeners = new Set<(sysids: number[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (sysids: number[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    this.drones.clear(); this.flights.clear();
    const now = Date.now();
    for (const [id, f] of Object.entries(START)) { this.flights.set(Number(id), { ...f, leg: 0 }); this.drones.set(Number(id), this.droneOf(Number(id), { ...f }, now)); }
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.drones.keys()]));
    this.timer = window.setInterval(() => this.tick(), 500);
  }
  stop() { clearInterval(this.timer); this.drones.clear(); this.setStatus('signed-out'); }

  private droneOf(sysid: number, f: Flight, now: number): Drone {
    const pos = at(f.n, f.e);
    return { ...blank(sysid, now), mode: f.mode, armed: f.armed, flying: f.flying, lat: pos.lat, lon: pos.lon, alt: f.alt, heading: f.heading, groundspeed: f.speed, climb: 0,
      battery: f.battery, voltage: f.voltage, fix: f.fix, sats: f.sats, home: HOME, seen: f.silent ? now - 14_000 : now, text: '' };
  }

  // The survey: four copters mowing east and west; the loiterer drifting;
  // batteries draining; a returning one flying home and landing.
  private tick() {
    const now = Date.now(), changed: number[] = [];
    for (const [sysid, f] of this.flights) {
      if (f.silent) continue;
      if (f.flying) f.battery = Math.max(0, f.battery - 0.004);
      if (f.mode === 'AUTO' && f.flying) {
        f.e += f.heading === 90 ? 3 : -3;
        if (f.e > 160) f.heading = 270; else if (f.e < -160) f.heading = 90;
      } else if (f.mode === 'LOITER' && f.flying) {
        f.n += (Math.random() - 0.5) * 1.5; f.e += (Math.random() - 0.5) * 1.5;
      } else if ((f.mode === 'RTL' || f.mode === 'SMART_RTL') && f.flying) {
        const dist = Math.hypot(f.n, f.e);
        if (dist > 4) { f.n -= (f.n / dist) * 5; f.e -= (f.e / dist) * 5; f.heading = ((Math.atan2(-f.e, -f.n) * 180) / Math.PI + 360) % 360; f.speed = 10; }
        else if (f.alt > 0.5) { f.alt = Math.max(0, f.alt - 1.5); f.speed = 0; }
        else { f.flying = false; f.armed = false; f.alt = 0; f.mode = 'STABILIZE'; }
      } else if (f.mode === 'LAND' && f.flying) {
        if (f.alt > 0.5) { f.alt = Math.max(0, f.alt - 1.5); f.speed = 0; } else { f.flying = false; f.armed = false; f.alt = 0; f.mode = 'STABILIZE'; }
      } else if (f.mode === 'GUIDED' && f.armed && !f.flying && f.alt < 30 && (f.leg ?? 0) > 0) {
        // A takeoff in progress.
        f.alt += 1.5; f.flying = true;
      }
      if (f.flying && f.mode === 'GUIDED' && f.alt < 30) f.alt = Math.min(30, f.alt + 1.5);
      this.drones.set(sysid, this.droneOf(sysid, f, now));
      // Only a drone in the air changes for the readings; one on the ground keeps its refusals.
      if (f.flying) changed.push(sysid);
    }
    this.listeners.forEach((fn) => fn(changed));
  }

  // The commands, taken a moment later like the autopilot would.
  async act(a: Act) {
    await new Promise((r) => setTimeout(r, 400));
    const f = this.flights.get(a.sysid);
    if (!f) throw new Error(`no vehicle ${a.sysid}`);
    if (a.kind === 'arm') { if (a.arm && f.fix < 3) throw new Error('PreArm: need 3D fix'); f.armed = a.arm; if (!a.arm) f.flying = false; }
    else if (a.kind === 'mode') { f.mode = a.mode; if (a.mode === 'LOITER' || a.mode === 'GUIDED') f.speed = f.flying ? 0.5 : 0; }
    else if (a.kind === 'takeoff') { if (!f.armed) throw new Error('not armed'); if (f.fix < 3) throw new Error('need 3D fix'); f.mode = 'GUIDED'; f.leg = 1; f.flying = true; f.speed = 0; }
    this.drones.set(a.sysid, this.droneOf(a.sysid, f, Date.now()));
    this.listeners.forEach((fn) => fn([a.sysid]));
  }
}
