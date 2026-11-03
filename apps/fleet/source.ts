// What the UI needs from a fleet, and the implementation over HSL's
// high-frequency positioning feed: every vehicle of Helsinki's transit
// publishes its position, speed, heading, delay and doors once a second over
// MQTT, public, no credentials, over WebSocket for browsers. The object
// (@zumer/pulse) never sees this: `model.ts` turns the vehicles into
// readings and `host.ts` wraps it as the board's host. The feed moves
// faster than a screen should: changes are gathered and handed on once a
// second.

import type { Action, Status } from '@zumer/pulse';
import { MqttClient, text } from './mqtt.ts';
import { t } from './strings.ts';

// A vehicle as the feed reports it. Speed in m/s, heading in degrees, `dl`
// the offset from the timetable in seconds (negative behind), `occu` the
// occupancy 0..100, `drst` the doors (1 open), `loc` where the position comes
// from (GPS, ODO, MAN, DR, N for none). `seen` is when it last spoke.
export type Vehicle = {
  id: string; mode: string; oper: number; veh: number;
  route: string; desi: string; dir: string; headsign: string;
  lat: number | null; long: number | null; spd: number | null; hdg: number | null; dl: number | null;
  occu: number | null; drst: number | null; loc: string; stop: number | null; at: number; seen: number;
};
export type Vehicles = Map<string, Vehicle>;
// A fleet takes no commands from here.
export type Act = Action & { kind: string };

export interface FleetSource {
  readonly vehicles: Vehicles;
  readonly modes: string[];
  readonly status: Status;
  readonly error: string;
  readonly label: string;           // where the data comes from, for the connection line
  readonly rate: number;            // messages a minute, lately
  onChange(fn: (ids: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

export const HSL_URL = 'wss://mqtt.hsl.fi:443/';
export const MODES = ['tram', 'bus', 'metro', 'train', 'ferry'];
// Gone quiet for this long, a vehicle leaves the fleet (its journey ended).
const STALE = 3 * 60_000;

type VP = { desi?: string; dir?: string; oper?: number; veh?: number; tst?: string; tsi?: number; spd?: number | null; hdg?: number | null; lat?: number | null; long?: number | null;
  dl?: number | null; drst?: number | null; occu?: number | null; loc?: string; stop?: number | null; route?: string };

// The topic says what the message is about: version, journey, lifecycle,
// event, mode, operator, vehicle, route, direction, headsign, start, next stop.
export function parseTopic(topic: string) {
  const p = topic.split('/');
  if (p[1] !== 'hfp' || p[2] !== 'v2') return null;
  return { lifecycle: p[4], event: p[5], mode: p[6], oper: Number(p[7]), veh: Number(p[8]), route: p[9] ?? '', dir: p[10] ?? '', headsign: p[11] ?? '', start: p[12] ?? '', nextStop: p[13] ?? '' };
}

// A vehicle position message as the vehicle it describes, or nothing.
export function vehicleOf(topic: string, json: unknown, now: number): Vehicle | null {
  const tp = parseTopic(topic);
  const vp = (json as { VP?: VP } | null)?.VP;
  if (!tp || !vp || tp.event !== 'vp' || !Number.isFinite(tp.oper) || !Number.isFinite(tp.veh)) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return {
    id: `${tp.oper}/${tp.veh}`, mode: tp.mode, oper: tp.oper, veh: tp.veh,
    route: vp.route ?? tp.route, desi: vp.desi ?? '', dir: vp.dir ?? tp.dir, headsign: tp.headsign,
    lat: n(vp.lat), long: n(vp.long), spd: n(vp.spd), hdg: n(vp.hdg), dl: n(vp.dl), occu: n(vp.occu), drst: n(vp.drst),
    loc: vp.loc ?? 'N', stop: n(vp.stop), at: vp.tst ? Date.parse(vp.tst) || now : now, seen: now,
  };
}

// HSL over MQTT: one subscription per mode (or per route), the vehicles kept
// as they speak, handed on once a second, dropped when they fall silent.
export class HslSource implements FleetSource {
  readonly vehicles: Vehicles = new Map();
  status: Status = 'signed-out';
  error = '';
  rate = 0;
  private client: MqttClient | null = null;
  private pending = new Set<string>();
  private flush = 0;
  private sweep = 0;
  private count = 0;
  private counted = 0;
  private retry = 0;
  private timer = 0;
  private stopped = true;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();
  readonly modes: string[];
  private routes: string[];
  private url: string;

  constructor(modes: string[], routes: string[] = [], url = HSL_URL) { this.modes = modes; this.routes = routes; this.url = url; }

  get label() { return t.liveLabel(this.modes.map((m) => t.modes[m] ?? m), this.vehicles.size, this.rate); }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status, error = '') {
    if (status === this.status && error === this.error) return;
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }

  // The topics: every vehicle position of each mode, or of each route named.
  topics() {
    return this.modes.flatMap((mode) => this.routes.length ? this.routes.map((r) => `/hfp/v2/journey/ongoing/vp/${mode}/+/+/${r}/#`) : [`/hfp/v2/journey/ongoing/vp/${mode}/#`]);
  }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    this.connect();
    this.flush = window.setInterval(() => this.hand(), 1000);
    this.sweep = window.setInterval(() => this.forget(), 15_000);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.flush);
    clearInterval(this.sweep);
    this.client?.close();
    this.client = null;
  }

  private connect() {
    const client = new MqttClient({ url: this.url, topics: this.topics() }, {
      onOpen: () => { this.retry = 0; if (this.vehicles.size) this.setStatus('live'); },
      onMessage: (m) => this.receive(m.topic, m.payload),
      onClose: (why) => {
        if (this.stopped || this.client !== client) return;
        this.client = null;
        if (this.vehicles.size) this.setStatus('offline'); else this.setStatus('error', t.nothingYet(why));
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => { if (!this.stopped) this.connect(); }, Math.min(30_000, 2000 * 2 ** this.retry++));
      },
    });
    this.client = client;
    client.open();
  }

  private receive(topic: string, payload: Uint8Array) {
    let json: unknown;
    try { json = JSON.parse(text(payload)); } catch { return; }
    const v = vehicleOf(topic, json, Date.now());
    if (!v) return;
    this.count++;
    const was = this.vehicles.get(v.id);
    this.vehicles.set(v.id, v);
    // Only what the readings can see counts as a change; a position alone does not repaint.
    if (!was || was.spd !== v.spd || was.hdg !== v.hdg || was.dl !== v.dl || was.occu !== v.occu || was.drst !== v.drst || was.loc !== v.loc || was.headsign !== v.headsign || was.stop !== v.stop) this.pending.add(v.id);
    if (this.status !== 'live') this.setStatus('live');
  }

  // Once a second: what changed, to whoever listens; the rate, over the last minute.
  private hand() {
    this.counted = this.counted * 0.9 + this.count * 6;      // a smoothed messages-a-minute
    this.count = 0;
    this.rate = Math.round(this.counted);
    if (!this.pending.size) { this.statusListeners.forEach((fn) => fn()); return; }
    const ids = [...this.pending];
    this.pending.clear();
    this.listeners.forEach((fn) => fn(ids));
  }

  private forget() {
    const now = Date.now(), gone: string[] = [];
    for (const [id, v] of this.vehicles) if (now - v.seen > STALE) { this.vehicles.delete(id); gone.push(id); }
    if (gone.length) this.listeners.forEach((fn) => fn(gone));
  }

  async act(a: Act) { throw new Error(`a fleet takes no ${a.kind}`); }
}
