// A PulseSource with no Home Assistant behind it: the homes of
// demo.home-assistant.io, with entities that answer service calls the way the
// frontend's demo does. Same object, same model, same data path as the
// WebSocket: `states` in, `call` out.

import type { HassEntity } from 'home-assistant-js-websocket';
import type { Call, HassState, PulseSource, States, Status } from '../source.ts';
import { t } from '../strings.ts';
import { getEntity, type Area, type Floor, type MockEntity } from './entities.ts';
import { energy } from './homes/energy.ts';
import { DEFAULT_HOME, homeById, type Home } from './homes/index.ts';

// A command takes a moment to come back, as it would from a real Home
// Assistant: the UI shows "sending" meanwhile.
const ROUND_TRIP_MS = 120;

export class DemoSource implements PulseSource {
  readonly states: States = new Map();
  status: Status = 'signed-out';
  error = '';
  version = '';
  unit = '°C';
  home: Home | null = null;
  areas: Area[] = [];
  floors: Floor[] = [];
  private entities = new Map<string, MockEntity>();
  private changed = new Map<string, HassState>();
  private flushing = false;
  private listeners = new Set<(changed: HassState[]) => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
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
    for (const input of [...energy, ...data.entities]) {
      const e = getEntity(input);
      e.sink = sink;
      this.entities.get(e.entityId)?.dispose();
      this.entities.set(e.entityId, e);
      this.states.set(e.entityId, e.toState());
    }
    this.version = `${t.demo} · ${home.name}`;
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.states.values()]));
  }

  stop(notify = true) {
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    this.states.clear();
    this.changed.clear();
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

  async call({ domain, service, data }: Call) {
    if (this.status !== 'live') throw new Error(t.errNoConnection);
    const { entity_id, ...rest } = data;
    const ids = Array.isArray(entity_id) ? (entity_id as string[]) : entity_id ? [entity_id as string] : [];
    await new Promise((r) => setTimeout(r, ROUND_TRIP_MS));
    for (const id of ids) await this.entities.get(id)?.handleService(domain, service, rest);
  }
}
