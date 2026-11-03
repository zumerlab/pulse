// What the UI needs from a swarm of ArduPilot vehicles, and the
// implementation over mavlink2rest: the MAVLink stream as JSON over
// WebSocket, one vehicle per system id, and commands posted back as
// COMMAND_LONG. The object (@zumer/pulse) never sees this: `model.ts` turns
// the vehicles into readings and `host.ts` wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { t } from './strings.ts';

// A vehicle as the stream describes it. Positions in degrees, altitude in
// metres above home, heading in degrees, speeds in m/s, battery as a share
// and volts, the GPS fix type (0 none, 2 2D, 3 3D, 4+ differential) and
// satellites. `seen` is when it last spoke; `text` its last status line.
export type Drone = {
  sysid: number; type: string; mode: string; armed: boolean; flying: boolean;
  lat: number | null; lon: number | null; alt: number | null; heading: number | null;
  groundspeed: number | null; climb: number | null; battery: number | null; voltage: number | null;
  fix: number; sats: number; home: { lat: number; lon: number } | null; seen: number; text: string;
};
export type Drones = Map<number, Drone>;
// A command for a vehicle: the core's Action (`ids`: the drones it touches) and what to tell it.
export type Act = Action & ({ kind: 'arm'; sysid: number; arm: boolean } | { kind: 'mode'; sysid: number; mode: string } | { kind: 'takeoff'; sysid: number; alt: number });

export interface SwarmSource {
  readonly drones: Drones;
  readonly status: Status;
  readonly error: string;
  readonly label: string;
  onChange(fn: (sysids: number[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

const SERVER = 'pulse-drones-server';
export const DEFAULT_SERVER = 'http://127.0.0.1:8088';
export const lastServer = () => { try { return localStorage.getItem(SERVER) ?? DEFAULT_SERVER; } catch { return DEFAULT_SERVER; } };
export const rememberServer = (url: string) => { try { localStorage.setItem(SERVER, url); } catch { /* only to remember */ } };

// ArduCopter's flight modes by number, and the ones a pilot picks from the ring.
export const COPTER_MODES: Record<number, string> = { 0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED', 5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT', 13: 'SPORT', 14: 'FLIP', 15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE', 18: 'THROW', 19: 'AVOID_ADSB', 20: 'GUIDED_NOGPS', 21: 'SMART_RTL', 22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG', 25: 'SYSTEMID', 26: 'AUTOROTATE', 27: 'AUTO_RTL' };
export const PICKABLE = ['LOITER', 'GUIDED', 'AUTO', 'RTL', 'LAND'];
const modeNumber = (name: string) => Number(Object.entries(COPTER_MODES).find(([, n]) => n === name)?.[0] ?? -1);
// The stream is filtered to what the readings use.
const MESSAGES = ['HEARTBEAT', 'GLOBAL_POSITION_INT', 'SYS_STATUS', 'BATTERY_STATUS', 'VFR_HUD', 'GPS_RAW_INT', 'STATUSTEXT', 'HOME_POSITION'];
const LOST = 10_000;

type Frame = { header: { system_id: number; component_id: number }; message: Record<string, unknown> & { type: string } };
const bits = (x: unknown) => (typeof x === 'object' && x && 'bits' in x ? Number((x as { bits: number }).bits) : typeof x === 'number' ? x : 0);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const typeName = (x: unknown) => (typeof x === 'object' && x && 'type' in x ? String((x as { type: string }).type) : String(x ?? ''));

export const blank = (sysid: number, now: number): Drone => ({ sysid, type: 'copter', mode: '', armed: false, flying: false, lat: null, lon: null, alt: null, heading: null, groundspeed: null, climb: null, battery: null, voltage: null, fix: 0, sats: 0, home: null, seen: now, text: '' });

// One MAVLink message into the vehicle it is about. Returns whether a reading can see the change.
export function apply(d: Drone, m: Frame['message'], now: number): boolean {
  d.seen = now;
  switch (m.type) {
    case 'HEARTBEAT': {
      const mt = typeName(m.type_ ?? m.mavtype);
      if (mt === 'MAV_TYPE_GCS' || mt === 'MAV_TYPE_ONBOARD_CONTROLLER') return false;
      const armed = (bits(m.base_mode) & 128) !== 0, mode = COPTER_MODES[Number(m.custom_mode)] ?? `mode ${String(m.custom_mode)}`;
      const flying = armed && typeName(m.system_status) === 'MAV_STATE_ACTIVE';
      const changed = d.armed !== armed || d.mode !== mode || d.flying !== flying;
      d.armed = armed; d.mode = mode; d.flying = flying;
      if (mt.includes('FIXED_WING')) d.type = 'plane'; else if (mt.includes('ROVER') || mt.includes('GROUND')) d.type = 'rover';
      return changed;
    }
    case 'GLOBAL_POSITION_INT': {
      d.lat = num(m.lat) != null ? Number(m.lat) / 1e7 : d.lat;
      d.lon = num(m.lon) != null ? Number(m.lon) / 1e7 : d.lon;
      d.alt = num(m.relative_alt) != null ? Number(m.relative_alt) / 1000 : d.alt;
      d.heading = num(m.hdg) != null && Number(m.hdg) !== 65535 ? Number(m.hdg) / 100 : d.heading;
      return true;
    }
    case 'VFR_HUD': d.groundspeed = num(m.groundspeed); d.climb = num(m.climb); return true;
    case 'SYS_STATUS': {
      const pct = num(m.battery_remaining), v = num(m.voltage_battery);
      d.battery = pct != null && pct >= 0 ? pct : d.battery;
      d.voltage = v != null && v !== 65535 ? v / 1000 : d.voltage;
      return true;
    }
    case 'BATTERY_STATUS': { const pct = num(m.battery_remaining); if (pct != null && pct >= 0) d.battery = pct; return true; }
    case 'GPS_RAW_INT': {
      const fix = typeName(m.fix_type), sats = num(m.satellites_visible) ?? 0;
      d.fix = fix === 'GPS_FIX_TYPE_NO_GPS' || fix === 'GPS_FIX_TYPE_NO_FIX' ? 0 : fix === 'GPS_FIX_TYPE_2D_FIX' ? 2 : fix === 'GPS_FIX_TYPE_3D_FIX' ? 3 : /DGPS|RTK|STATIC|PPP/.test(fix) ? 4 : typeof m.fix_type === 'number' ? Number(m.fix_type) : d.fix;
      d.sats = sats === 255 ? 0 : sats;
      return true;
    }
    case 'HOME_POSITION': { const lat = num(m.latitude), lon = num(m.longitude); if (lat != null && lon != null) d.home = { lat: lat / 1e7, lon: lon / 1e7 }; return true; }
    case 'STATUSTEXT': { const text = Array.isArray(m.text) ? String.fromCharCode(...(m.text as number[]).filter((c) => c > 0)) : String(m.text ?? ''); d.text = text.trim(); return true; }
  }
  return false;
}

// mavlink2rest over HTTP and WebSocket: the stream of the messages the
// readings use, each vehicle by its system id; commands as COMMAND_LONG.
export class RestSource implements SwarmSource {
  readonly drones: Drones = new Map();
  status: Status = 'signed-out';
  error = '';
  private ws: WebSocket | null = null;
  private pending = new Set<number>();
  private flush = 0;
  private sweep = 0;
  private retry = 0;
  private timer = 0;
  private stopped = true;
  private listeners = new Set<(sysids: number[]) => void>();
  private statusListeners = new Set<() => void>();
  readonly url: string;

  constructor(url: string) { this.url = url.replace(/\/+$/, ''); }

  get label() { return t.liveLabel(this.url.replace(/^https?:\/\//, ''), this.drones.size); }
  onChange(fn: (sysids: number[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status, error = '') {
    if (status === this.status && error === this.error) return;
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    void this.open();
    this.flush = window.setInterval(() => this.hand(), 500);
    this.sweep = window.setInterval(() => this.hand(true), 5000);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer); clearInterval(this.flush); clearInterval(this.sweep);
    this.ws?.close(); this.ws = null;
  }

  // The server first (its info page says it is there), then the stream.
  private async open() {
    try {
      const res = await fetch(`${this.url}/info`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`${res.status}`);
    } catch (error) {
      if (this.stopped) return;
      if (!this.drones.size) this.setStatus('error', t.errNoServer(this.url, error instanceof Error ? error.message : String(error)));
      else this.setStatus('offline');
      this.later();
      return;
    }
    const ws = new WebSocket(`${this.url.replace(/^http/, 'ws')}/ws/mavlink?filter=^(${MESSAGES.join('|')})$`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; };
    ws.onmessage = (e) => this.receive(e.data as string);
    ws.onclose = () => {
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;
      if (this.drones.size) this.setStatus('offline'); else this.setStatus('error', t.errNoServer(this.url, 'the stream closed'));
      this.later();
    };
  }
  private later() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { if (!this.stopped) void this.open(); }, Math.min(30_000, 2000 * 2 ** this.retry++));
  }

  private receive(data: string) {
    let f: Frame;
    try { f = JSON.parse(data) as Frame; } catch { return; }
    if (!f.header || !f.message?.type || f.header.system_id === 255 || f.header.system_id === 0) return;
    // Only the autopilot's own messages (component 1); a camera or a gimbal is not the vehicle.
    if (f.header.component_id !== 1 && f.message.type !== 'HEARTBEAT') return;
    const now = Date.now();
    let d = this.drones.get(f.header.system_id);
    if (!d) { d = blank(f.header.system_id, now); this.drones.set(d.sysid, d); this.pending.add(d.sysid); }
    if (apply(d, f.message, now)) this.pending.add(d.sysid);
    if (this.status !== 'live') this.setStatus('live');
  }

  // Twice a second, what changed; every few seconds, the ones gone quiet (their link reading changes).
  private hand(all = false) {
    const now = Date.now();
    if (all) for (const d of this.drones.values()) if (now - d.seen > LOST / 2) this.pending.add(d.sysid);
    if (!this.pending.size) return;
    const ids = [...this.pending];
    this.pending.clear();
    this.listeners.forEach((fn) => fn(ids));
  }

  // A command to one vehicle, as mavlink2rest takes it: a COMMAND_LONG from the GCS.
  async act(a: Act) {
    const cmd = (command: string, params: number[]) => ({
      header: { system_id: 255, component_id: 240, sequence: 0 },
      message: { type: 'COMMAND_LONG', param1: params[0] ?? 0, param2: params[1] ?? 0, param3: params[2] ?? 0, param4: params[3] ?? 0, param5: params[4] ?? 0, param6: params[5] ?? 0, param7: params[6] ?? 0,
        command: { type: command }, target_system: a.sysid, target_component: 1, confirmation: 0 },
    });
    const body = a.kind === 'arm' ? cmd('MAV_CMD_COMPONENT_ARM_DISARM', [a.arm ? 1 : 0])
      : a.kind === 'takeoff' ? cmd('MAV_CMD_NAV_TAKEOFF', [0, 0, 0, 0, 0, 0, a.alt])
      : cmd('MAV_CMD_DO_SET_MODE', [1, modeNumber(a.mode)]);
    if (a.kind === 'mode' && modeNumber(a.mode) < 0) throw new Error(`unknown mode ${a.mode}`);
    const res = await fetch(`${this.url}/mavlink`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
  }
}
