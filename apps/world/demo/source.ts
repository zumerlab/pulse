// A day of calamities as a source: the recorded answers of `data.ts` through
// the real parsers of `feeds.ts`, so the app (and its tests) run without the
// feeds. Same shape as the live source.

import type { Status } from '@zumer/pulse';
import { FEEDS, type Thing, type Things, type Where } from '../feeds.ts';
import type { Act, WorldSource } from '../source.ts';
import { t } from '../strings.ts';
import { cyclonesJson, elevatedJson, eruptionsJson, firesJson, floodsJson, noticeJson, quakesJson, tracksJson, usVolcanoesJson } from './data.ts';

export const DEMO_WHERE: Where = { lat: -34.6037, lon: -58.3816, place: 'Buenos Aires' };

// Each feed's recorded answer, by the feed's id.
const ANSWERS: Record<string, (now: number) => unknown> = {
  quakes: quakesJson, 'gdacs:TC': cyclonesJson, 'gdacs:FL': floodsJson, 'gdacs:WF': firesJson, 'gdacs:VO': eruptionsJson,
  tracks: tracksJson, hans: elevatedJson, 'hans-where': usVolcanoesJson,
};

export class DemoSource implements WorldSource {
  readonly things: Things = new Map();
  readonly where = DEMO_WHERE;
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  private listeners = new Set<(changed: Thing[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (changed: Thing[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    const now = Date.now();
    this.things.clear();
    for (const feed of FEEDS) {
      const answer = ANSWERS[feed.id];
      if (!answer) throw new Error(`no recorded answer for the feed ${feed.id}`);
      const json = answer(now);
      for (const th of feed.parse(json, this.where, now)) this.things.set(th.id, th);
      // What it leads to (each volcano's notice), from its recorded answer too.
      for (const next of feed.then?.(json) ?? []) for (const th of next.parse(noticeJson(next.id.slice('notice:'.length), now), this.where, now)) this.things.set(th.id, th);
    }
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.things.values()]));
  }
  stop() { this.things.clear(); this.setStatus('signed-out'); }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
  }
}
