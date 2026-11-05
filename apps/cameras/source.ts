// What the UI needs from a city's roads, and the implementation over the
// public feeds: in London TfL's (the disruptions and the corridors every two
// minutes), in the Bay Area the CHP's incidents and Caltrans' signs (every two
// minutes); the list of cameras every half hour (it is a megabyte), and, for the cameras that watch
// an incident, when their still last changed (the still's Last-Modified; a
// GET, since TfL's bucket answers a page's HEAD without CORS), so a camera that froze or went dark where it matters is
// known. The object (@zumer/pulse) never sees this: `model.ts` turns it into
// readings and `host.ts` wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { CAMERAS_URL, camerasOf, DISRUPTIONS_URL, disruptionsOf, metres, rank, ROADS_URL, roadsOf, unplanned, type Camera, type Disruption, type Road } from './feeds.ts';
import { CA_CAMERAS_URL, CA_SIGNS_URL, caCamerasOf, CHP_URL, chpOf, signsOf, type Sign } from './feeds-ca.ts';
import { t } from './strings.ts';

// An action of the roads' board: a link to open (a camera's clip, TfL's page). Nothing here commands a camera.
export type Act = Action & { kind: 'open'; url: string };

// Where the roads are: London from TfL (stills and recorded clips), the Bay Area from Caltrans and the CHP (live streams).
export type City = { id: 'bayarea' | 'london'; name: string; center: { lat: number; lon: number }; zoom: number; credit: { label: string; url: string } };
export const CITIES: Record<City['id'], City> = {
  bayarea: { id: 'bayarea', name: 'Bay Area', center: { lat: 37.75, lon: -122.25 }, zoom: 9, credit: { label: 'Caltrans · CHP', url: 'https://quickmap.dot.ca.gov/' } },
  london: { id: 'london', name: 'London', center: { lat: 51.5074, lon: -0.1278 }, zoom: 10, credit: { label: 'Powered by TfL Open Data', url: 'https://tfl.gov.uk/info-for/open-data-users/' } },
};

export interface CameraSource {
  readonly city: City;
  readonly signs: Sign[];                // what the freeway signs say (the Bay Area's)
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
// The camera nearest a place within a distance: one that streams if there is, else one that works, else the nearest that is off
// (or dark: `dark` says which a check found not answering, or showing its feed's "unavailable" card).
export function nearestCamera(cameras: Iterable<Camera>, lat: number, lon: number, within = WATCH_METRES, dark: (c: Camera) => boolean = () => false): { camera: Camera; m: number } | null {
  type Near = { camera: Camera; m: number };
  let live: Near | null = null, up: Near | null = null, down: Near | null = null;
  for (const c of cameras) {
    const m = metres(lat, lon, c.lat, c.lon);
    if (m > within) continue;
    const works = c.available && !dark(c);
    if (works && c.stream) { if (!live || m < live.m) live = { camera: c, m }; }
    else if (works) { if (!up || m < up.m) up = { camera: c, m }; }
    else if (!down || m < down.m) down = { camera: c, m };
  }
  return live ?? up ?? down;
}
// The cameras that watch an unplanned incident: the ones whose stills are worth checking.
export const isDark = (s: { stills: Map<string, number> }) => (c: Camera) => s.stills.get(c.id) === 0;
export const watched = (s: { cameras: Map<string, Camera>; disruptions: Disruption[]; stills: Map<string, number> }) =>
  [...new Set(s.disruptions.filter(unplanned).map((d) => nearestCamera(s.cameras.values(), d.lat, d.lon, WATCH_METRES, isDark(s))?.camera).filter((c): c is Camera => !!c))];
// The streaming cameras nearest the worst unplanned incident (or the city's center), the ones that are not known dark first.
export const liveCameras = (s: { cameras: Map<string, Camera>; disruptions: Disruption[]; stills: Map<string, number>; city: City }) => {
  const worst = s.disruptions.filter(unplanned).sort((a, b) => rank(a) - rank(b))[0], at = worst ?? s.city.center;
  return [...s.cameras.values()].filter((c) => c.available && c.stream).map((c) => ({ c, m: metres(at.lat, at.lon, c.lat, c.lon) }))
    .sort((a, b) => Number(s.stills.get(a.c.id) === 0) - Number(s.stills.get(b.c.id) === 0) || a.m - b.m);
};
// The cameras worth checking: the two nearest each unplanned incident (so when the nearest is dark the next is known), and the first live ones.
const candidates = (s: { cameras: Map<string, Camera>; disruptions: Disruption[]; stills: Map<string, number>; city: City }) => {
  const out = new Set<Camera>(liveCameras(s).slice(0, 3).map((x) => x.c));
  for (const d of s.disruptions.filter(unplanned)) {
    [...s.cameras.values()].map((c) => ({ c, m: metres(d.lat, d.lon, c.lat, c.lon) })).filter((x) => x.m <= WATCH_METRES && x.c.available)
      .sort((a, b) => Number(!!b.c.stream) - Number(!!a.c.stream) || a.m - b.m).slice(0, 2).forEach((x) => out.add(x.c));
  }
  return [...out];
};
// Caltrans shows a card, "Temporarily Unavailable", in place of a camera that is down: a still far smaller than a picture.
export const CARD_BYTES = 16_000;

// What both sources share: the state, the listeners, the status.
export abstract class BaseSource {
  readonly city: City;
  signs: Sign[] = [];
  readonly cameras = new Map<string, Camera>();
  disruptions: Disruption[] = [];
  roads: Road[] = [];
  readonly stills = new Map<string, number>();
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  protected listeners = new Set<(ids: string[]) => void>();
  protected statusListeners = new Set<() => void>();

  constructor(city: City) { this.city = city; }

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

  get label() { return t.liveLabel(this.city.name, this.disruptions.filter(unplanned).length, [...this.cameras.values()].filter((c) => c.available).length); }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    if (this.city.id === 'london') {
      void this.poll('cameras', 30 * 60_000, () => this.fetchCameras(CAMERAS_URL, camerasOf));
      void this.poll('disruptions', 2 * 60_000, () => this.fetchDisruptions());
      void this.poll('roads', 2 * 60_000, () => this.fetchRoads());
    } else {
      void this.poll('cameras', 30 * 60_000, () => this.fetchCameras(CA_CAMERAS_URL, caCamerasOf));
      void this.poll('chp', 2 * 60_000, () => this.fetchChp());
      void this.poll('signs', 2 * 60_000, () => this.fetchSigns());
    }
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

  private async fetchCameras(url: string, parse: (j: unknown) => Camera[]) {
    const list = parse(await this.get(url));
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
  private async fetchChp() {
    const res = await fetch(CHP_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${res.status}`);
    this.disruptions = chpOf(await res.text());
    this.emit(['disruptions', ...this.disruptions.map((d) => d.id)]);
    void this.checkStills();
  }
  private async fetchSigns() {
    this.signs = signsOf(await this.get(CA_SIGNS_URL));
    this.emit(['signs', ...this.signs.map((x) => x.id)]);
  }
  private async fetchRoads() {
    this.roads = roadsOf(await this.get(ROADS_URL));
    this.emit(['roads', ...this.roads.map((r) => `road:${r.id}`)]);
  }
  // When the stills of the cameras that matter last changed; one that does not answer counts as dark (0).
  // A camera is dark (0) when its still does not answer, is the feed's "unavailable" card, or its stream answers with nothing.
  private async checkStills() {
    const list = candidates(this);
    await Promise.all(list.map(async (c) => {
      const at = await fetch(c.image, { cache: 'no-store', signal: AbortSignal.timeout(15_000) }).then(async (r) => {
        if (!r.ok) return 0;
        const bytes = (await r.arrayBuffer()).byteLength;
        return c.id.startsWith('ca:') && bytes < CARD_BYTES ? 0 : Date.parse(r.headers.get('Last-Modified') ?? '') || 0;
      }, () => 0);
      const streams = !c.stream || !at ? true : await fetch(c.stream, { cache: 'no-store', signal: AbortSignal.timeout(15_000) }).then((r) => r.ok, () => false);
      this.stills.set(c.id, streams ? at : 0);
    }));
    if (list.length) this.emit(list.map((c) => c.id));
  }
}
