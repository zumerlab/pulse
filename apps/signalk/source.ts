// What the UI needs from a Signal K server, and the implementation over its
// REST and WebSocket APIs: the vessel's full tree once, then the stream of
// deltas; PUT for what the boat can be told. The object (@zumer/pulse) never
// sees this: `model.ts` turns the paths into readings and `host.ts` wraps it
// as the board's host.

import type { Action, HistoryRow, Status } from '@zumer/pulse';
import { t } from './strings.ts';

// A path's value and when it was reported (ms since the epoch). Signal K's
// values are SI: m/s, rad, K, Pa, ratios 0..1, m, m³.
export type Value = { value: unknown; at: number };
export type Meta = { units?: string; displayName?: string; shortName?: string; description?: string };
// A notification the server raises on a path (its zones, a plugin's alarm).
export type Notification = { state: 'normal' | 'nominal' | 'alert' | 'warn' | 'alarm' | 'emergency'; message?: string; method?: string[] };
// An action for the server: the core's Action (`ids`: the paths it touches) and a PUT of a value to a path;
// or a way out to a page about a thing (a vessel on MarineTraffic).
export type Act = Action & ({ kind: 'put'; path: string; value: unknown } | { kind: 'open'; url: string });
// Another vessel on the stream (its AIS): where it is and where it goes, and
// what it says of itself (its MMSI, its type, its length, where it is bound,
// its navigational status) when it says it.
export type Target = {
  id: string; name: string; lat: number; lon: number; cog?: number; sog?: number; at: number;
  mmsi?: string; type?: string; length?: number; destination?: string; state?: string;
};

export interface VesselSource {
  readonly values: Map<string, Value>;
  readonly meta: Map<string, Meta>;
  readonly others: Map<string, Target>;     // the vessels around, by context
  readonly name: string;            // the vessel's name, when known
  readonly status: Status;
  readonly error: string;
  readonly label: string;           // where the data comes from, for the connection line
  onChange(fn: (paths: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  // Rows of (state, when) for the last `hours` hours of these paths, when the server keeps a history.
  history(paths: string[], hours: number): Promise<Record<string, HistoryRow[]>>;
  start(): void;
  stop(): void;
}

const SERVER = 'pulse-signalk-server';
export const DEFAULT_SERVER = 'https://demo.signalk.org';
export const lastServer = () => { try { return localStorage.getItem(SERVER) ?? DEFAULT_SERVER; } catch { return DEFAULT_SERVER; } };
export const rememberServer = (url: string) => { try { localStorage.setItem(SERVER, url); } catch { /* only to remember */ } };

// The keys of a node that are not children: the value itself, its meta and where it came from.
const NOT_CHILDREN = new Set(['value', 'values', 'meta', 'timestamp', '$source', 'source', 'sourceRef', 'pgn', 'sentence']);
// The full tree of a vessel (`/signalk/v1/api/vessels/self`) as paths: every
// node with a `value` is one, with its timestamp and its meta.
export function flatten(tree: Record<string, unknown>, values: Map<string, Value>, meta: Map<string, Meta>, prefix = '', now = Date.now()) {
  for (const [k, v] of Object.entries(tree)) {
    if (NOT_CHILDREN.has(k) || v == null || typeof v !== 'object' || Array.isArray(v)) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    const node = v as Record<string, unknown>;
    if ('value' in node) values.set(path, { value: node.value, at: Date.parse(String(node.timestamp ?? '')) || now });
    if (node.meta && typeof node.meta === 'object') meta.set(path, node.meta as Meta);
    flatten(node, values, meta, path, now);
  }
}

type Delta = { context?: string; updates?: { timestamp?: string; values?: { path: string; value: unknown }[]; meta?: { path: string; value: Meta }[] }[] };
type Hello = { self?: string; name?: string; version?: string };

// The server over HTTP and WebSocket: the tree once, then every delta of the
// vessel; a lost socket is opened again, later each time.
export class WebSocketSource implements VesselSource {
  readonly values = new Map<string, Value>();
  readonly meta = new Map<string, Meta>();
  readonly others = new Map<string, Target>();
  name = '';
  status: Status = 'signed-out';
  error = '';
  private ws: WebSocket | null = null;
  private self = 'vessels.self';
  private retry = 0;
  private timer = 0;
  private trafficTimer = 0;
  private stopped = true;
  private listeners = new Set<(paths: string[]) => void>();
  private statusListeners = new Set<() => void>();
  private version = '';

  readonly url: string;
  private token: string;
  constructor(url: string, token = '') { this.url = url.replace(/\/+$/, ''); this.token = token; }

  get label() { return `${this.name || this.url.replace(/^https?:\/\//, '')}${this.version ? ` · Signal K ${this.version}` : ''}`; }
  onChange(fn: (paths: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status, error = '') {
    if (status === this.status && error === this.error) return;
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }
  private headers(): Record<string, string> { return this.token ? { Authorization: `Bearer ${this.token}` } : {}; }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    void this.open();
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  // The discovery document names the endpoints; the tree fills the values;
  // the stream keeps them.
  private async open() {
    let wsUrl = `${this.url.replace(/^http/, 'ws')}/signalk/v1/stream`;
    try {
      const disc = await fetch(`${this.url}/signalk`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
      if (!disc.ok) throw new Error(`${disc.status}`);
      const doc = await disc.json() as { endpoints?: Record<string, { version?: string; 'signalk-ws'?: string }>; server?: { version?: string } };
      const v1 = doc.endpoints?.v1;
      if (v1?.['signalk-ws']) wsUrl = v1['signalk-ws'];
      this.version = doc.server?.version ?? v1?.version ?? '';
      const tree = await fetch(`${this.url}/signalk/v1/api/vessels/self`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
      if (tree.status === 401 || tree.status === 403) { this.setStatus('error', t.errUnauthorized); return; }
      if (tree.ok) {
        const self = await tree.json() as Record<string, unknown>;
        if (typeof self.name === 'string') this.name = self.name;
        const changed: string[] = [];
        const fresh = new Map<string, Value>();
        flatten(self, fresh, this.meta);
        for (const [p, v] of fresh) { this.values.set(p, v); changed.push(p); }
        if (changed.length) this.listeners.forEach((fn) => fn(changed));
      }
    } catch (error) {
      if (this.stopped) return;
      if (!this.values.size) { this.setStatus('error', t.errNoServer(this.url, error instanceof Error ? error.message : String(error))); this.later(); return; }
    }
    if (this.stopped) return;
    // Every vessel: the boat's own paths, and the others' positions for the traffic radar.
    this.connect(`${wsUrl}?subscribe=all${this.token ? `&token=${encodeURIComponent(this.token)}` : ''}`);
  }

  private connect(url: string) {
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; };
    ws.onmessage = (e) => this.receive(JSON.parse(String(e.data)) as Delta & Hello);
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (this.ws !== ws || this.stopped) return;
      this.ws = null;
      if (this.values.size) this.setStatus('offline');
      else this.setStatus('error', t.errNoServer(this.url, 'the stream closed'));
      this.later();
    };
  }
  private later() {
    clearTimeout(this.timer);
    const wait = Math.min(30_000, 2000 * 2 ** this.retry++);
    this.timer = window.setTimeout(() => { if (!this.stopped) void this.open(); }, wait);
  }

  // The hello names the vessel; every delta of it changes paths.
  private receive(msg: Delta & Hello) {
    if (msg.self) { this.self = msg.self; this.setStatus('live'); return; }
    if (!msg.updates) return;
    if (msg.context && msg.context !== this.self && msg.context !== 'vessels.self') { this.other(msg.context, msg.updates); return; }
    const changed: string[] = [];
    for (const u of msg.updates) {
      const at = Date.parse(u.timestamp ?? '') || Date.now();
      for (const m of u.meta ?? []) this.meta.set(m.path, { ...this.meta.get(m.path), ...m.value });
      for (const { path, value } of u.values ?? []) {
        if (!path) {
          // The vessel's own fields (name, mmsi) arrive without a path.
          if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') this.name = (value as { name: string }).name;
          continue;
        }
        const was = this.values.get(path);
        if (was && was.at === at && JSON.stringify(was.value) === JSON.stringify(value)) continue;
        this.values.set(path, { value, at });
        changed.push(path);
      }
    }
    if (this.status !== 'live') this.setStatus('live');
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
  }

  // Another vessel's delta: its position, course, speed, name and what it says
  // of itself; forgotten after ten minutes of silence. A busy channel brings a
  // delta per vessel every second or two: the traffic is told at most once a
  // second, all of it at once, so the board does not repaint for each ship.
  private other(context: string, updates: NonNullable<Delta['updates']>) {
    if (!context.startsWith('vessels.')) return;
    const now = Date.now();
    let o = this.others.get(context);
    let changed = false;
    const mmsi = /mmsi:(\d+)/.exec(context)?.[1];
    for (const u of updates) {
      for (const { path, value } of u.values ?? []) {
        if (path === 'navigation.position' && value && typeof value === 'object') {
          const p = value as { latitude?: number; longitude?: number };
          if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
          o = { ...(o ?? { id: context, name: mmsi ?? context.replace(/^vessels\./, ''), mmsi }), lat: p.latitude, lon: p.longitude, at: now };
          changed = true;
        } else if (!o) continue;
        else if (path === 'navigation.courseOverGroundTrue' && typeof value === 'number') o = { ...o, cog: value, at: now };
        else if (path === 'navigation.speedOverGround' && typeof value === 'number') o = { ...o, sog: value, at: now };
        else if (path === 'navigation.state' && typeof value === 'string') o = { ...o, state: value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() };
        else if (path === 'navigation.destination.commonName' && typeof value === 'string') o = { ...o, destination: value };
        else if (path === 'design.aisShipType' && value && typeof value === 'object') o = { ...o, type: String((value as { name?: unknown }).name ?? '') || o.type };
        else if (path === 'design.length' && value && typeof value === 'object') o = { ...o, length: Number((value as { overall?: unknown }).overall) || o.length };
        else if (path === 'name' || (path === '' && value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string')) o = { ...o, name: path === 'name' ? String(value) : (value as { name: string }).name };
      }
    }
    if (o) this.others.set(context, o);
    for (const [id, t] of this.others) if (now - t.at > 600_000) { this.others.delete(id); changed = true; }
    if (changed && !this.trafficTimer) this.trafficTimer = window.setTimeout(() => { this.trafficTimer = 0; this.listeners.forEach((fn) => fn(['traffic'])); }, 1000);
  }

  // A value to a path: Signal K's PUT, answered by whatever plugin owns the path.
  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    const res = await fetch(`${this.url}/signalk/v1/api/vessels/self/${a.path.replace(/\./g, '/')}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify({ value: a.value }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ message: res.statusText })) as { message?: string }).message ?? res.statusText);
    const body = await res.json().catch(() => null) as { state?: string; message?: string } | null;
    if (body?.state === 'FAILED') throw new Error(body.message ?? 'refused');
  }

  // The history API (a server with signalk-to-influxdb or the like): one row
  // per `resolution` seconds, or nothing when the server keeps none.
  async history(paths: string[], hours: number) {
    const to = new Date(), from = new Date(to.getTime() - hours * 3_600_000);
    const out: Record<string, HistoryRow[]> = Object.fromEntries(paths.map((p) => [p, []]));
    try {
      const res = await fetch(`${this.url}/signalk/v1/history/values?from=${from.toISOString()}&to=${to.toISOString()}&paths=${encodeURIComponent(paths.join(','))}&resolution=600`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return out;
      const body = await res.json() as { values?: { path: string }[]; data?: [string, ...(number | null)[]][] };
      (body.data ?? []).forEach((row) => {
        const lu = Date.parse(row[0]) / 1000;
        (body.values ?? []).forEach((v, i) => { const x = row[i + 1]; if (x != null && out[v.path]) out[v.path].push({ s: String(x), lu }); });
      });
    } catch { /* no history on this server */ }
    return out;
  }
}
