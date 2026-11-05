// What the UI needs from the station, and the implementation over the public
// feeds: NASA's telemetry through Lightstreamer (pushed, about once a second),
// the position every five seconds and the track ahead every five minutes
// (wheretheiss.at), the station and its crew every half hour and the launches
// every fifteen minutes (Launch Library 2). Each on its own clock. The object
// (@zumer/pulse) never sees this: `model.ts` turns it into readings and
// `host.ts` wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { expeditionOf, expeditionUrl, LAUNCHES_URL, launchesOf, positionOf, STATION_URL, stationOf, trackOf, trackUrl, WHERE_API, type Launch, type Position, type Station, type TrackPoint } from './feeds.ts';
import { LightstreamerClient } from './lightstreamer.ts';
import { FIELDS, ITEMS, sampleOf, type Sample } from './telemetry.ts';
import { t } from './strings.ts';

export type Place = { name: string; lat: number; lon: number };
// An action of the station's board: a link to open (a webcast, a launch's page). The station itself takes no commands from here.
export type Act = Action & { kind: 'open'; url: string };

export interface IssSource {
  readonly samples: Map<string, Sample>;  // the telemetry, by PUI
  readonly signal: { aos: boolean; at: number } | null;   // whether the ground hears the station, and since when
  readonly position: Position | null;
  readonly track: TrackPoint[];
  readonly station: Station | null;
  readonly launches: Launch[];
  readonly place: Place;
  readonly status: Status;
  readonly error: string;
  readonly label: string;
  readonly failed: string[];
  // A PUI's samples over the last minutes (the source keeps half an hour of each).
  past(id: string): Sample[];
  onChange(fn: (ids: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

export const DEFAULT_PLACE: Place = { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 };
export const TELEMETRY = 'https://push.lightstreamer.com';
const KEEP = 30 * 60_000;

// What both sources share: the samples and their half hour, the listeners, the status.
export abstract class BaseSource {
  readonly samples = new Map<string, Sample>();
  signal: IssSource['signal'] = null;
  position: Position | null = null;
  track: TrackPoint[] = [];
  station: Station | null = null;
  launches: Launch[] = [];
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  protected history = new Map<string, Sample[]>();
  protected listeners = new Set<(ids: string[]) => void>();
  protected statusListeners = new Set<() => void>();

  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  protected emit(ids: string[]) { if (ids.length) this.listeners.forEach((fn) => fn(ids)); }
  protected setStatus(status: Status, error = '') {
    if (status === this.status && error === this.error) return;
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }
  past(id: string) { return this.history.get(id) ?? []; }

  // The countdowns tick: every second in a launch's last ten minutes (and its first ten), else every half minute.
  private clock = 0;
  protected startClock() {
    clearInterval(this.clock);
    let n = 0;
    this.clock = window.setInterval(() => {
      n++;
      const now = Date.now();
      if (n % 30 === 0 || this.launches.some((l) => Math.abs(l.net - now) < 600_000)) this.emit(['launches', ...this.launches.map((l) => `launch:${l.id}`)]);
    }, 1000);
  }
  protected stopClock() { clearInterval(this.clock); this.clock = 0; }

  // An update of the stream: a sample, or the clock (its class is the signal).
  protected take(id: string, f: Record<string, string | null>, year?: number): boolean {
    if (id === 'TIME_000001') {
      const aos = f['Status.Class'] === '24';
      if (this.signal?.aos === aos) return false;
      this.signal = { aos, at: Date.now() };
      return true;
    }
    const s = sampleOf(id, f, year);
    if (!s) return false;
    const was = this.samples.get(id);
    if (was && was.raw === s.raw && was.at === s.at) return false;
    this.samples.set(id, s);
    const h = this.history.get(id) ?? [];
    h.push(s);
    while (h.length && h[0].at < s.at - KEEP) h.shift();
    this.history.set(id, h);
    return true;
  }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }
}

export class LiveSource extends BaseSource implements IssSource {
  readonly place: Place;
  private ls: LightstreamerClient | null = null;
  private timers = new Map<string, number>();
  private stopped = true;
  private changed = new Set<string>();
  private flush = 0;
  private retry = 0;

  constructor(place: Place) { super(); this.place = place; }

  get label() { return t.liveLabel(this.station?.aboard ?? null, this.signal?.aos ?? null); }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    this.listen();
    this.startClock();
    void this.poll('position', 5_000, () => this.fetchPosition());
    void this.poll('track', 5 * 60_000, () => this.fetchTrack());
    void this.poll('station', 30 * 60_000, () => this.fetchStation());
    void this.poll('launches', 15 * 60_000, () => this.fetchLaunches());
  }
  stop() {
    this.stopped = true;
    this.stopClock();
    this.ls?.close(); this.ls = null;
    for (const id of this.timers.values()) clearTimeout(id);
    this.timers.clear();
    clearTimeout(this.flush); this.flush = 0;
  }

  // The telemetry, pushed: the changes gathered and passed on once a second.
  private listen() {
    if (this.stopped) return;
    this.ls = new LightstreamerClient({ url: TELEMETRY, adapterSet: 'ISSLIVE', items: ITEMS, fields: FIELDS }, {
      onOpen: () => { this.retry = 0; this.failed = this.failed.filter((x) => x !== 'telemetry'); this.settle(); },
      onUpdate: (item, values) => {
        if (!this.take(item, values)) return;
        this.changed.add(item === 'TIME_000001' ? 'signal' : item);
        if (!this.flush) this.flush = window.setTimeout(() => { this.flush = 0; const ids = [...this.changed]; this.changed.clear(); this.emit(ids); this.settle(); }, 1000);
      },
      onClose: () => {
        this.ls = null;
        this.failed = [...new Set([...this.failed, 'telemetry'])];
        this.settle();
        if (this.stopped) return;
        this.retry = Math.min(6, this.retry + 1);
        this.timers.set('telemetry', window.setTimeout(() => this.listen(), 1000 * 2 ** this.retry));
      },
    });
    this.ls.open();
  }

  private get hasData() { return this.samples.size > 0 || !!this.position || !!this.launches.length; }
  private settle() {
    if (this.stopped) return;
    if (this.hasData) this.setStatus(this.failed.length >= 3 ? 'offline' : 'live');
    else if (this.failed.length >= 3) this.setStatus('error', t.nothingYet(this.failed.join(', ')));
  }

  private async poll(name: string, every: number, ask: () => Promise<void>) {
    if (this.stopped) return;
    const ok = await ask().then(() => true, () => false);
    if (this.stopped) return;
    this.failed = ok ? this.failed.filter((x) => x !== name) : [...new Set([...this.failed, name])];
    this.settle();
    this.timers.set(name, window.setTimeout(() => void this.poll(name, every, ask), ok ? every : Math.min(every, 60_000)));
  }
  private async get(url: string): Promise<unknown> {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  private async fetchPosition() {
    const p = positionOf(await this.get(WHERE_API));
    if (!p) throw new Error('no position');
    this.position = p;
    this.emit(['position']);
  }
  private async fetchTrack() {
    this.track = trackOf(await this.get(trackUrl(Date.now())));
    this.emit(['position']);
  }
  // Launch Library takes fifteen questions an hour from a browser: its answers are kept for as long as
  // they are good, so a reload does not ask again, and an old one stands in when it says no.
  private async kept(url: string, ttl: number): Promise<unknown> {
    const key = `pulse-iss:${url}`;
    let was: { at: number; json: unknown } | null = null;
    try { was = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* none kept */ }
    if (was && Date.now() - was.at < ttl) return was.json;
    try {
      const json = await this.get(url);
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), json })); } catch { /* full or blocked */ }
      return json;
    } catch (e) {
      if (was) return was.json;
      throw e;
    }
  }
  private async fetchStation() {
    const now = Date.now(), s = stationOf(await this.kept(STATION_URL, 30 * 60_000), now);
    if (!s) throw new Error('no station');
    if (s.expeditionId != null) Object.assign(s, expeditionOf(await this.kept(expeditionUrl(s.expeditionId), 30 * 60_000), now));
    this.station = s;
    this.emit(['crew', 'docked']);
  }
  private async fetchLaunches() {
    this.launches = launchesOf(await this.kept(LAUNCHES_URL, 15 * 60_000));
    this.emit(['launches', ...this.launches.map((l) => `launch:${l.id}`)]);
  }
}
