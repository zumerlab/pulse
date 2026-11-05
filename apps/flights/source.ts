// What the UI needs from the sky, and the implementation over the community
// ADS-B networks (adsb.lol, airplanes.live, adsb.fi: one API, free, no key)
// and OpenSky: the aircraft squawking an emergency anywhere, the traffic
// around a place, and the whole sky now and then. Each question on its own
// clock, through the dev server (none of them lets a page read it:
// `vite.config.ts`). The object (@zumer/pulse) never sees this: `model.ts`
// turns the aircraft into readings and `host.ts` wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { t } from './strings.ts';

// An aircraft as the networks report it: altitude in feet (null on the
// ground), speed in knots, track in degrees, the vertical rate in ft/min, the
// squawk and the emergency it declares, when it was last heard (`seen`, ms
// ago when read) and a short trail of where it has been.
export type Aircraft = {
  hex: string; flight: string; reg: string; type: string; category: string;
  lat: number | null; lon: number | null; alt: number | null; ground: boolean; gs: number | null; track: number | null; rate: number | null;
  squawk: string; emergency: string; seen: number; at: number; dst: number | null; dir: number | null;
  trail: { at: number; lat: number; lon: number; alt: number | null; track: number | null }[];
};
export type Fleet = Map<string, Aircraft>;
export type Region = { name: string; lat: number; lon: number; nm: number };
// The whole sky, as OpenSky counts it now and then: how many in the air, from where, and a dot per cell of the globe.
export type Sky = { at: number; airborne: number; countries: [string, number][]; bins: { lat: number; lon: number; n: number }[] };
// An action of the sky: a link to open (the aircraft on the network's map).
export type Act = Action & { kind: 'open'; url: string };

export interface SkySource {
  readonly aircraft: Fleet;               // the region's, and the ones squawking anywhere
  readonly emergencies: Set<string>;      // the hexes squawking an emergency
  readonly sky: Sky | null;
  readonly region: Region;
  readonly scoped?: boolean;              // read within some groups (a phase of flight): what is empty there is left out
  readonly mapUrl: (hex: string) => string;
  readonly status: Status;
  readonly error: string;
  readonly label: string;
  readonly failed: string[];
  onChange(fn: (ids: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

export const DEFAULT_REGION: Region = { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816, nm: 250 };
// The networks' APIs as the dev server passes them on; the maps open in a tab of their own.
export const NETWORKS: Record<string, { api: string; map: (hex: string) => string }> = {
  'adsb.lol': { api: '/net/adsb.lol', map: (hex) => `https://adsb.lol/?icao=${hex}` },
  'airplanes.live': { api: '/net/airplanes.live', map: (hex) => `https://globe.airplanes.live/?icao=${hex}` },
  'adsb.fi': { api: '/net/adsb.fi', map: (hex) => `https://globe.adsb.fi/?icao=${hex}` },
};
export const DEFAULT_NETWORK = 'adsb.lol';
const TRAIL = 12, EMERGENCY_SQUAWKS = ['7700', '7600', '7500'];

// The aircraft come in `ac`, or in `aircraft` (adsb.fi, around a point).
type V2 = { ac?: Record<string, unknown>[]; aircraft?: Record<string, unknown>[]; now?: number; msg?: string };
const listOf = (v: V2) => v.ac ?? v.aircraft ?? [];
const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
// One aircraft of the v2 answer; `alt_baro` is "ground" on the ground.
export function aircraftOf(a: Record<string, unknown>, now: number, was?: Aircraft): Aircraft | null {
  const hex = typeof a.hex === 'string' ? a.hex.toLowerCase() : '';
  if (!hex) return null;
  const ground = a.alt_baro === 'ground', alt = ground ? null : n(a.alt_baro) ?? n(a.alt_geom);
  const seenS = n(a.seen) ?? 0, at = now - seenS * 1000;
  const lat = n(a.lat), lon = n(a.lon), track = n(a.track);
  const trail = was ? [...was.trail] : [];
  if (lat != null && lon != null && (!trail.length || at - trail[trail.length - 1].at >= 10_000)) { trail.push({ at, lat, lon, alt, track }); if (trail.length > TRAIL) trail.shift(); }
  return {
    hex, flight: String(a.flight ?? '').trim() || (typeof a.r === 'string' ? a.r : hex.toUpperCase()), reg: String(a.r ?? ''), type: String(a.t ?? ''), category: String(a.category ?? ''),
    lat, lon, alt, ground, gs: n(a.gs), track, rate: n(a.baro_rate) ?? n(a.geom_rate), squawk: String(a.squawk ?? ''), emergency: typeof a.emergency === 'string' && a.emergency !== 'none' ? a.emergency : '',
    seen: seenS * 1000, at, dst: n(a.dst), dir: n(a.dir), trail,
  };
}

// OpenSky's state vectors: a row per aircraft, the fields by position.
type States = { time: number; states: (string | number | boolean | null)[][] | null };
export function skyOf(s: States, now: number): Sky {
  const rows = (s.states ?? []).filter((r) => !r[8] && typeof r[5] === 'number' && typeof r[6] === 'number');
  const byCountry = new Map<string, number>(), byCell = new Map<string, { lat: number; lon: number; n: number }>();
  for (const r of rows) {
    const country = String(r[2] ?? ''), lat = r[6] as number, lon = r[5] as number;
    byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
    const key = `${Math.floor(lat / 5)}:${Math.floor(lon / 5)}`;
    const cell = byCell.get(key) ?? { lat: Math.floor(lat / 5) * 5 + 2.5, lon: Math.floor(lon / 5) * 5 + 2.5, n: 0 };
    cell.n++;
    byCell.set(key, cell);
  }
  return { at: (s.time ? s.time * 1000 : now), airborne: rows.length, countries: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), bins: [...byCell.values()] };
}

// The networks over HTTP: the emergencies every 30 s, the region every 15 s,
// the sky every 15 minutes (OpenSky's anonymous allowance is 400 credits a
// day; a whole-sky call costs 4). What stops being reported is forgotten
// after a while, so a lost signal shows before it goes.
export class NetworkSource implements SkySource {
  readonly aircraft: Fleet = new Map();
  readonly emergencies = new Set<string>();
  sky: Sky | null = null;
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  private timers = new Map<string, number>();
  private turn: Promise<unknown> = Promise.resolve();
  private stopped = true;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();
  readonly region: Region;
  readonly scoped?: boolean;              // read within some groups (a phase of flight): what is empty there is left out
  readonly api: string;
  readonly mapUrl: (hex: string) => string;
  private opensky: string;

  constructor(region: Region, network = DEFAULT_NETWORK, opensky = '/net/opensky') {
    this.region = region;
    const net = NETWORKS[network] ?? { api: network.replace(/\/+$/, ''), map: (hex: string) => `https://globe.adsbexchange.com/?icao=${hex}` };
    this.api = net.api; this.mapUrl = net.map; this.opensky = opensky.replace(/\/+$/, '');
  }

  get label() { return t.liveLabel(this.region.name, [...this.aircraft.values()].filter((a) => a.dst != null).length, this.sky?.airborne ?? null); }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
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
    void this.poll('emergencies', 30_000, () => this.fetchEmergencies());
    void this.poll('region', 15_000, () => this.fetchRegion());
    void this.poll('sky', 15 * 60_000, () => this.fetchSky());
  }
  stop() { this.stopped = true; for (const id of this.timers.values()) clearTimeout(id); this.timers.clear(); }

  private async poll(name: string, every: number, ask: () => Promise<void>) {
    if (this.stopped) return;
    const ok = await ask().then(() => true, () => false);
    if (this.stopped) return;
    this.failed = ok ? this.failed.filter((x) => x !== name) : [...new Set([...this.failed, name])];
    if (this.aircraft.size || this.sky) this.setStatus(this.failed.length === 3 ? 'offline' : 'live');
    else if (this.failed.length === 3) this.setStatus('error', t.nothingYet(this.failed.join(', ')));
    this.timers.set(name, window.setTimeout(() => void this.poll(name, every, ask), ok ? every : Math.min(every, 60_000)));
  }
  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<T>;
  }
  // A network takes one question a second (adsb.fi turns the rest away), so they wait their turn.
  private ask<T>(path: string): Promise<T> {
    const answer = this.turn.then(() => this.get<T>(`${this.api}${path}`));
    this.turn = answer.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 1_000)));
    return answer;
  }

  // Takes a batch of aircraft; the ones not in it that belong to the same question are kept a while, then forgotten.
  private take(list: Record<string, unknown>[], now: number, mine: (a: Aircraft) => boolean, changed: Set<string>) {
    const seen = new Set<string>();
    for (const raw of list) {
      const a = aircraftOf(raw, now, this.aircraft.get(String(raw.hex ?? '').toLowerCase()));
      if (!a) continue;
      seen.add(a.hex);
      const was = this.aircraft.get(a.hex);
      this.aircraft.set(a.hex, a);
      if (!was || was.at !== a.at || was.squawk !== a.squawk || was.alt !== a.alt) changed.add(a.hex);
    }
    for (const [hex, a] of this.aircraft) if (mine(a) && !seen.has(hex)) {
      // Not reported this time: the readings see it as silent; after ten minutes it is gone.
      if (now - a.at > 600_000) { this.aircraft.delete(hex); changed.add(hex); }
      else if (a.seen < now - a.at) { a.seen = now - a.at; changed.add(hex); }
    }
  }

  private async fetchEmergencies() {
    const now = Date.now(), changed = new Set<string>();
    const answers = await Promise.all(EMERGENCY_SQUAWKS.map((sq) => this.ask<V2>(`/v2/sqk/${sq}`)));
    const list = answers.flatMap(listOf);
    const before = new Set(this.emergencies);
    this.emergencies.clear();
    for (const raw of list) if (typeof raw.hex === 'string') this.emergencies.add(raw.hex.toLowerCase());
    this.take(list, now, (a) => before.has(a.hex) && a.dst == null, changed);
    for (const hex of before) if (!this.emergencies.has(hex)) changed.add(hex);
    if (changed.size || before.size !== this.emergencies.size) { changed.add('emergencies'); this.listeners.forEach((fn) => fn([...changed])); }
  }
  private async fetchRegion() {
    const now = Date.now(), changed = new Set<string>();
    const v = await this.ask<V2>(`/v2/lat/${this.region.lat.toFixed(4)}/lon/${this.region.lon.toFixed(4)}/dist/${Math.min(250, this.region.nm)}`);
    this.take(listOf(v), now, (a) => a.dst != null, changed);
    if (changed.size) this.listeners.forEach((fn) => fn([...changed]));
  }
  private async fetchSky() {
    const s = await this.get<States>(`${this.opensky}/states/all`);
    this.sky = skyOf(s, Date.now());
    this.listeners.forEach((fn) => fn(['sky']));
  }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }
}
