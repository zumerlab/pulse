// What the UI needs from London's roads, and the implementation over TfL's
// open data: the disruptions and the corridors every two minutes, the list of
// cameras every half hour (it is a megabyte), and, for the cameras that watch
// an incident, when their still last changed (the still's Last-Modified; a
// GET, since TfL's bucket answers a page's HEAD without CORS), so a camera that froze or went dark where it matters is
// known. The object (@zumer/pulse) never sees this: `model.ts` turns it into
// readings and `host.ts` wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { CAMERAS_URL, camerasOf, DISRUPTIONS_URL, disruptionsOf, metres, ROADS_URL, roadsOf, unplanned, type Camera, type Disruption, type Road } from './feeds.ts';
import { t } from './strings.ts';

// An action of the roads' board: a link to open (a camera's clip, TfL's page). Nothing here commands a camera.
export type Act = Action & { kind: 'open'; url: string };

export interface CameraSource {
  readonly cameras: Map<string, Camera>;
  readonly disruptions: Disruption[];
  readonly roads: Road[];
  readonly stills: Map<string, number>;   // when a watched camera's still last changed (ms), by camera
  readonly status: Status;
  readonly error: string;
  readonly label: string;
  readonly failed: string[];
  // The picture of a camera as of now: the still, asked again every two minutes.
  picture(c: Camera): string;
  onChange(fn: (ids: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

export const WATCH_METRES = 600;
// The camera nearest a place within a distance: a working one if there is, else the nearest that is off.
export function nearestCamera(cameras: Iterable<Camera>, lat: number, lon: number, within = WATCH_METRES): { camera: Camera; m: number } | null {
  type Near = { camera: Camera; m: number };
  let up: Near | null = null, down: Near | null = null;
  for (const c of cameras) {
    const m = metres(lat, lon, c.lat, c.lon);
    if (m > within) continue;
    if (c.available) { if (!up || m < up.m) up = { camera: c, m }; }
    else if (!down || m < down.m) down = { camera: c, m };
  }
  return up ?? down;
}
// The cameras that watch an unplanned incident: the ones whose stills are worth checking.
export const watched = (s: { cameras: Map<string, Camera>; disruptions: Disruption[] }) =>
  [...new Set(s.disruptions.filter(unplanned).map((d) => nearestCamera(s.cameras.values(), d.lat, d.lon)?.camera).filter((c): c is Camera => !!c))];

// What both sources share: the state, the listeners, the status.
export abstract class BaseSource {
  readonly cameras = new Map<string, Camera>();
  disruptions: Disruption[] = [];
  roads: Road[] = [];
  readonly stills = new Map<string, number>();
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
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
  picture(c: Camera) { return /^https?:/.test(c.image) ? `${c.image}?m=${Math.floor(Date.now() / 120_000)}` : c.image; }
  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }
}

export class LiveSource extends BaseSource implements CameraSource {
  private timers = new Map<string, number>();
  private stopped = true;

  get label() { return t.liveLabel(this.disruptions.filter(unplanned).length, [...this.cameras.values()].filter((c) => c.available).length); }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    void this.poll('cameras', 30 * 60_000, () => this.fetchCameras());
    void this.poll('disruptions', 2 * 60_000, () => this.fetchDisruptions());
    void this.poll('roads', 2 * 60_000, () => this.fetchRoads());
  }
  stop() { this.stopped = true; for (const id of this.timers.values()) clearTimeout(id); this.timers.clear(); }

  private settle() {
    if (this.stopped) return;
    const has = this.cameras.size > 0 || this.disruptions.length > 0;
    if (has) this.setStatus(this.failed.length >= 3 ? 'offline' : 'live');
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
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }

  private async fetchCameras() {
    const list = camerasOf(await this.get(CAMERAS_URL));
    if (!list.length) throw new Error('no cameras');
    this.cameras.clear();
    for (const c of list) this.cameras.set(c.id, c);
    this.emit(['cameras', ...list.map((c) => c.id)]);
    void this.checkStills();
  }
  private async fetchDisruptions() {
    this.disruptions = disruptionsOf(await this.get(DISRUPTIONS_URL));
    this.emit(['disruptions', ...this.disruptions.map((d) => d.id)]);
    void this.checkStills();
  }
  private async fetchRoads() {
    this.roads = roadsOf(await this.get(ROADS_URL));
    this.emit(['roads', ...this.roads.map((r) => `road:${r.id}`)]);
  }
  // When the stills of the cameras that matter last changed; one that does not answer counts as dark (0).
  private async checkStills() {
    const list = watched(this);
    await Promise.all(list.map(async (c) => {
      const at = await fetch(c.image, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? Date.parse(r.headers.get('Last-Modified') ?? '') || 0 : 0), () => 0);
      this.stills.set(c.id, at);
    }));
    if (list.length) this.emit(list.map((c) => c.id));
  }
}
