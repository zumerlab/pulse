// The stormy day as a source: the recorded answers of `data.ts` through the
// real parsers of `feeds.ts`, the solar wind drifting every few seconds, so the
// app (and its tests) run without the feeds. Same shape as the live source.

import type { HistoryRow, Status } from '@zumer/pulse';
import { DEFAULT_SERVICES, air, kp, mag, plasma, quakes, scales, serviceOf, status, weather, xrays, type Service, type Thing, type Things, type Where } from '../feeds.ts';
import type { Act, WorldSource } from '../source.ts';
import { t } from '../strings.ts';
import { airJson, kpJson, magJson, plasmaJson, quakesJson, scalesJson, statusJson, weatherJson, xraysJson } from './data.ts';

export const DEMO_WHERE: Where = { lat: -34.6037, lon: -58.3816, place: 'Buenos Aires' };

export class DemoSource implements WorldSource {
  readonly things: Things = new Map();
  readonly rows = new Map<string, HistoryRow[]>();
  readonly where = DEMO_WHERE;
  readonly services: Service[] = DEFAULT_SERVICES.map(serviceOf);
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  private timer = 0;
  private listeners = new Set<(changed: Thing[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (changed: Thing[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    const now = Date.now();
    this.things.clear();
    const answers: [typeof scales, unknown][] = [
      [scales, scalesJson(now)], [kp, kpJson(now)], [plasma, plasmaJson(now)], [mag, magJson(now)], [xrays, xraysJson(now)], [quakes, quakesJson(now)],
      [weather(this.where), weatherJson(now)], [air(this.where), airJson(now)],
      ...this.services.map((s): [typeof scales, unknown] => [status(s), statusJson(s.slug, now)]),
    ];
    for (const [feed, json] of answers) {
      const parsed = feed.parse(json, this.where, now);
      for (const th of parsed.things) this.things.set(th.id, th);
      for (const [id, r] of Object.entries(parsed.rows ?? {})) this.rows.set(id, r);
    }
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.things.values()]));
    this.timer = window.setInterval(() => this.tick(), 5000);
  }
  stop() { clearInterval(this.timer); this.things.clear(); this.setStatus('signed-out'); }

  // The sun breathes: the wind and the field move a little.
  private tick() {
    const now = Date.now(), changed: Thing[] = [];
    const move = (id: string, step: number, lo: number, hi: number, digits = 0) => {
      const th = this.things.get(id);
      if (!th || typeof th.state !== 'number') return;
      const f = 10 ** digits;
      const next = { ...th, state: Math.min(hi, Math.max(lo, Math.round((th.state + (Math.random() - 0.5) * 2 * step) * f) / f)), changed: now };
      this.things.set(id, next);
      changed.push(next);
    };
    move('sun.wind', 6, 605, 655); move('sun.bz', 1, -17, -11, 1);
    this.listeners.forEach((fn) => fn(changed));
  }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }

  async history(ids: string[], hours: number) {
    const since = Date.now() / 1000 - hours * 3600;
    return Object.fromEntries(ids.map((id) => [id, (this.rows.get(id) ?? []).filter((r) => r.lu >= since - 3 * 3600)]));
  }
}
