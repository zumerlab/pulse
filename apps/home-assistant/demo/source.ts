// A PulseSource with no Home Assistant behind it: the homes of
// demo.home-assistant.io, with entities that answer service calls the way the
// frontend's demo does. Same object, same model, same data path as the
// WebSocket: `states` in, `call` out.

import type { HassEntity } from 'home-assistant-js-websocket';
import { emptyRegistry, type Call, type Change, type HassState, type PulseSource, type Registry, type States, type Status } from '../source.ts';
import { t } from '../strings.ts';
import { getEntity, type Area, type Floor, type MockEntity } from './entities.ts';
import { energy } from './homes/energy.ts';
import { DEFAULT_HOME, homeById, type Home } from './homes/index.ts';

// The same numbers every time for the same entity: a hash of its id seeds them.
function seeded(key: string) {
  let seed = 0;
  for (const c of key) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
// What a state flips to in a made-up history.
const OTHER_STATE: Record<string, string> = {
  on: 'off', off: 'on', open: 'closed', closed: 'open', locked: 'unlocked', unlocked: 'locked',
  playing: 'paused', paused: 'playing', idle: 'playing', heat: 'off', cool: 'off', heat_cool: 'off', auto: 'off', dry: 'off', fan_only: 'off',
};

// A command takes a moment to come back, as it would from a real Home
// Assistant: the UI shows "sending" meanwhile.
const ROUND_TRIP_MS = 120;

export class DemoSource implements PulseSource {
  readonly states: States = new Map();
  registry: Registry = emptyRegistry();
  status: Status = 'signed-out';
  error = '';
  version = '';
  unit = '°C';
  language = 'en-US';
  home: Home | null = null;
  areas: Area[] = [];
  floors: Floor[] = [];
  private entities = new Map<string, MockEntity>();
  private changed = new Map<string, HassState>();
  private flushing = false;
  private listeners = new Set<(changed: HassState[]) => void>();
  private registryListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onRegistry(fn: () => void) { this.registryListeners.add(fn); return () => this.registryListeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  // The demos' pictures (cameras, people) are served by demo.home-assistant.io.
  url(path: string) { return /^https?:/.test(path) ? path : `https://demo.home-assistant.io${path}`; }

  private setStatus(status: Status) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn());
  }

  async start(id = DEFAULT_HOME) {
    this.stop(false);
    const home = homeById(id) ?? homeById(DEFAULT_HOME)!;
    this.home = home;
    this.setStatus('connecting');
    const data = await home.load();
    if (this.home !== home) return;      // another start() won meanwhile
    this.areas = data.areas ?? [];
    this.floors = data.floors ?? [];
    const sink = { updateState: (s: HassEntity) => this.queue(s) };
    // The home's own entities win over the shared energy sensors.
    const registry = emptyRegistry();
    for (const input of [...energy, ...data.entities]) {
      const e = getEntity(input);
      e.sink = sink;
      this.entities.get(e.entityId)?.dispose();
      this.entities.set(e.entityId, e);
      this.states.set(e.entityId, e.toState());
      registry.entities.set(e.entityId, { entity_id: e.entityId, area_id: input.area_id, device_id: input.device_id, platform: input.platform });
    }
    // What the demo config says about the home: areas and floors (only `home` has them).
    for (const a of this.areas) registry.areas.set(a.area_id, a);
    for (const f of this.floors) registry.floors.set(f.floor_id, f);
    this.registry = registry;
    this.version = `${t.demo} · ${home.name}`;
    this.setStatus('live');
    this.registryListeners.forEach((fn) => fn());
    this.listeners.forEach((fn) => fn([...this.states.values()]));
  }

  stop(notify = true) {
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    this.states.clear();
    this.changed.clear();
    this.registry = emptyRegistry();
    this.home = null;
    this.version = '';
    if (notify) this.setStatus('signed-out');
  }

  // Entities report one change at a time; the UI gets them batched per tick,
  // like the WebSocket's diffs.
  private queue(s: HassState) {
    this.states.set(s.entity_id, s);
    this.changed.set(s.entity_id, s);
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => {
      this.flushing = false;
      const list = [...this.changed.values()];
      this.changed.clear();
      this.listeners.forEach((fn) => fn(list));
    });
  }

  // The demo has no recorder: a day is made up around the current value, the
  // same one every time for the same entity (a hash of its id seeds it).
  async history(entity: string, hours: number) {
    const e = this.states.get(entity), v = Number(e?.state);
    if (!e || !Number.isFinite(v)) return Array.from({ length: hours }, () => null);
    const rand = seeded(entity);
    const phase = rand() * Math.PI * 2, swing = 0.1 + rand() * 0.2, noise = rand() * 0.06;
    const base = v || 1;
    return Array.from({ length: hours }, (_, i) => {
      const x = (i + 1) / hours;                // 1 at the current hour
      const wave = Math.sin(x * Math.PI * 2 + phase) - Math.sin(Math.PI * 2 + phase);
      const value = base * (1 + swing * wave * (1 - x) + (rand() - 0.5) * noise);
      return Math.round((i === hours - 1 ? v : value) * 100) / 100;
    });
  }

  // A day of changes made up the same way: a few flips between the current
  // state and its opposite, ending in the current one.
  async changes(entities: string[], hours: number) {
    const out: Record<string, Change[]> = {};
    for (const id of entities) {
      const e = this.states.get(id);
      if (!e) { out[id] = []; continue; }
      const rand = seeded(`${id}/changes`);
      const other = OTHER_STATE[e.state] ?? (id.startsWith('climate.') ? 'heat' : 'off');
      const flips = Math.floor(rand() * 5);
      const times = Array.from({ length: flips }, () => 0.3 + rand() * (hours - 1)).sort((a, b) => b - a);
      let state = flips % 2 === 0 ? e.state : other;
      const list: Change[] = [{ state, ago: hours }];
      for (const ago of times) { state = state === e.state ? other : e.state; list.push({ state, ago }); }
      out[id] = list;
    }
    return out;
  }

  // A month of days made up around a daily figure: the entity's value is a
  // running total, so the day is a slice of it, weekdays heavier than weekends.
  async statistics(entity: string, days?: number) {
    const e = this.states.get(entity), v = Number(e?.state);
    const now = new Date(), today = now.getDate();
    const length = days ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (!e || !Number.isFinite(v)) return Array.from({ length }, () => null);
    const rand = seeded(`${entity}/month`);
    const perDay = Math.max(0.5, v / 30);
    // The date of slot i: the days of this month, or the last `days` days ending today.
    const dateOf = (i: number) => days ? new Date(now.getFullYear(), now.getMonth(), today - (days - 1 - i)) : new Date(now.getFullYear(), now.getMonth(), i + 1);
    return Array.from({ length }, (_, i) => {
      const d = dateOf(i);
      if (d > now) return null;
      const dow = d.getDay(), isToday = d.toDateString() === now.toDateString();
      const weekend = dow === 0 || dow === 6 ? 0.7 : 1;
      const value = perDay * weekend * (0.7 + rand() * 0.6) * (isToday ? now.getHours() / 24 + 0.05 : 1);
      return Math.round(value * 100) / 100;
    });
  }

  async call({ domain, service, data }: Call) {
    if (this.status !== 'live') throw new Error(t.errNoConnection);
    const { entity_id, ...rest } = data;
    const ids = Array.isArray(entity_id) ? (entity_id as string[]) : entity_id ? [entity_id as string] : [];
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    for (const id of ids) await this.entities.get(id)?.handleService(domain, service, rest);
  }
}
