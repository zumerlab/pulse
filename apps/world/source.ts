// What the UI needs from the world, and the implementation over the public
// feeds: each feed on its own clock, straight from the browser (they allow any
// origin), no server in between. The object (@zumer/pulse) never sees this:
// `model.ts` turns the things into readings and `host.ts` wraps it as the
// board's host.

import type { Action, Status } from '@zumer/pulse';
import { FEEDS, type Feed, type Thing, type Things, type Where } from './feeds.ts';
import { t } from './strings.ts';

export type { Thing, Things, Where } from './feeds.ts';
// An action of the world: nothing to command out there; a link to open.
export type Act = Action & { kind: 'open'; url: string };

export interface WorldSource {
  readonly things: Things;
  readonly where: Where;
  readonly status: Status;
  readonly error: string;
  readonly label: string;           // where the data comes from, for the connection line
  readonly failed: string[];        // the feeds that did not answer last time
  onChange(fn: (changed: Thing[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  start(): void;
  stop(): void;
}

export const DEFAULT_WHERE: Where = { lat: -34.6037, lon: -58.3816, place: 'Buenos Aires' };

// The feeds over HTTP, each asked again on its own interval. A feed that fails
// keeps what it last said; nothing yet from any of them is an error the shell
// shows; some of them failing is 'live' with the rest.
export class LiveSource implements WorldSource {
  readonly things: Things = new Map();
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  private feeds: Feed[] = FEEDS;
  private timers = new Map<string, number>();
  private listeners = new Set<(changed: Thing[]) => void>();
  private statusListeners = new Set<() => void>();
  private stopped = true;
  readonly where: Where;

  constructor(where: Where) { this.where = where; }

  get label() { return t.liveLabel(this.where.place); }
  onChange(fn: (changed: Thing[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
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
    for (const f of this.feeds) void this.poll(f);
  }
  stop() {
    this.stopped = true;
    for (const id of this.timers.values()) clearTimeout(id);
    this.timers.clear();
  }

  private async poll(feed: Feed) {
    if (this.stopped) return;
    const ok = await fetch(feed.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        // GDACS answers 204, with no body, when no event matches.
        const text = await res.text(), json = text.trim() ? JSON.parse(text) as unknown : null;
        this.take(feed.parse(json, this.where, Date.now()));
        // What this answer leads to is asked once, now (the notices of the volcanoes it lists).
        for (const next of feed.then?.(json) ?? []) void this.once(next);
        return true;
      }).catch(() => false);
    if (this.stopped) return;
    this.failed = ok ? this.failed.filter((x) => x !== feed.name) : [...new Set([...this.failed, feed.name])];
    if (this.things.size) this.setStatus(this.failed.length === this.feeds.length ? 'offline' : 'live');
    else if (this.failed.length === this.feeds.length) this.setStatus('error', t.nothingYet(this.failed));
    // A failed feed is asked again sooner.
    this.timers.set(feed.id, window.setTimeout(() => void this.poll(feed), ok ? feed.every : Math.min(feed.every, 60_000)));
  }

  // A feed asked once: what it says joins the rest; if it fails, the rest stand.
  private async once(feed: Feed) {
    await fetch(feed.url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } })
      .then(async (res) => { if (res.ok && !this.stopped) { const text = await res.text(); this.take(feed.parse(text.trim() ? JSON.parse(text) : null, this.where, Date.now())); } })
      .catch(() => undefined);
  }

  // Only what changed reaches the listeners.
  private take(things: Thing[]) {
    const changed: Thing[] = [];
    for (const th of things) {
      const was = this.things.get(th.id);
      if (!was || was.state !== th.state || was.changed !== th.changed || JSON.stringify(was.attrs) !== JSON.stringify(th.attrs)) {
        this.things.set(th.id, th);
        changed.push(th);
      }
    }
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
  }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }
}
