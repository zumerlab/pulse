// What the UI needs from a machine, and the implementation over the collector
// (`collector/collector.mjs`), a small Node server on the machine itself. The
// object (@zumer/pulse) never sees this: `model.ts` turns the things into
// readings and `host.ts` wraps it as the board's host.

import type { Action, HistoryRow, Status } from '@zumer/pulse';
import { t } from './strings.ts';

// A thing the collector found: a sensor, a volume, a container, a service.
// `changed` is when its state last changed (ms since the epoch).
export type Thing = { id: string; name: string; state: string | number; unit: string; attrs: Record<string, unknown>; changed: number };
export type Things = Map<string, Thing>;
export type HostInfo = { name: string; model?: string; version?: string; platform?: string; arch?: string };
export type Snapshot = { host: HostInfo; at: number; interval: number; things: Record<string, Omit<Thing, 'id'>> };
// An action for the collector: what it touches (the core's `ids`) and what to do.
export type Act = Action & { kind: string; name?: string };

export interface MachineSource {
  readonly things: Things;
  readonly host: HostInfo | null;
  readonly status: Status;
  readonly error: string;
  readonly label: string;           // where the data comes from, for the connection line
  onChange(fn: (changed: Thing[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  // Rows of (state, when) for the last `hours` hours of these things.
  history(ids: string[], hours: number): Promise<Record<string, HistoryRow[]>>;
  start(): void;
  stop(): void;
}

const COLLECTOR = 'pulse-homelab-collector';
export const DEFAULT_COLLECTOR = 'http://127.0.0.1:5180';
export const lastCollector = () => { try { return localStorage.getItem(COLLECTOR) ?? DEFAULT_COLLECTOR; } catch { return DEFAULT_COLLECTOR; } };
export const rememberCollector = (url: string) => { try { localStorage.setItem(COLLECTOR, url); } catch { /* only to remember */ } };

// The collector over HTTP: the snapshot every few seconds (the interval the
// collector itself uses), the day of a thing on request, actions by POST.
export class CollectorSource implements MachineSource {
  readonly things: Things = new Map();
  host: HostInfo | null = null;
  status: Status = 'signed-out';
  error = '';
  private timer = 0;
  private interval = 3000;
  private listeners = new Set<(changed: Thing[]) => void>();
  private statusListeners = new Set<() => void>();

  readonly url: string;
  private token: string;
  constructor(url: string, token = '') { this.url = url; this.token = token; }

  get label() { return this.host ? `${this.host.name}${this.host.version ? ` · ${this.host.version}` : ''}` : this.url; }
  onChange(fn: (changed: Thing[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
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
    this.setStatus('connecting');
    void this.poll();
  }
  stop() { clearTimeout(this.timer); this.timer = 0; }

  private async poll() {
    try {
      const res = await fetch(this.url, { headers: this.headers(), signal: AbortSignal.timeout(5000) });
      if (res.status === 401) { this.setStatus('error', t.errUnauthorized); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const snap = (await res.json()) as Snapshot;
      this.take(snap);
      this.setStatus('live');
    } catch (error) {
      // Nothing yet: say so and show how to start the collector. Something
      // already shown: keep it and retry.
      if (!this.things.size) this.setStatus('error', t.errNoCollector(this.url, error instanceof Error ? error.message : String(error)));
      else this.setStatus('offline');
    }
    this.timer = window.setTimeout(() => void this.poll(), this.interval);
  }

  // Only what changed reaches the listeners; what the collector no longer
  // reports is gone.
  private take(snap: Snapshot) {
    this.host = snap.host;
    this.interval = Math.max(1000, (snap.interval || 3) * 1000);
    const changed: Thing[] = [];
    for (const [id, raw] of Object.entries(snap.things)) {
      const was = this.things.get(id);
      if (!was || was.state !== raw.state || was.changed !== raw.changed || JSON.stringify(was.attrs) !== JSON.stringify(raw.attrs)) {
        const thing = { id, ...raw };
        this.things.set(id, thing);
        changed.push(thing);
      }
    }
    for (const id of [...this.things.keys()]) if (!(id in snap.things)) { changed.push(this.things.get(id)!); this.things.delete(id); }
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
  }

  async act(a: Act) {
    const body = { ...a } as Record<string, unknown>;
    delete body.ids;
    const res = await fetch(`${this.url}/act`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers() }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText })) as { error?: string }).error ?? res.statusText);
    // The collector read the machine again before answering: take it now.
    const snap = await fetch(this.url, { headers: this.headers() }).then((r) => r.json() as Promise<Snapshot>).catch(() => null);
    if (snap) this.take(snap);
  }

  async history(ids: string[], hours: number) {
    const res = await fetch(`${this.url}/history?ids=${encodeURIComponent(ids.join(','))}&hours=${hours}`, { headers: this.headers() });
    if (!res.ok) throw new Error(res.statusText);
    return ((await res.json()) as { rows: Record<string, HistoryRow[]> }).rows;
  }
}
