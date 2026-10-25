import { validateAction, type Action } from './action.ts';
import type { Adapter, EventHandler } from './adapter.ts';
import type { PulseEntity } from './entity.ts';
import { projectEvents, type PulseEvent } from './event.ts';

export class Registry {
  #adapters: Map<string, Adapter>;
  #events: PulseEvent[] = [];
  #notifications: PulseEvent[] = [];
  #notifying = false;
  #listeners = new Set<EventHandler>();
  #unsubscribers: (() => void)[] = [];
  #discovery?: Promise<PulseEntity[]>;
  #disposed = false;

  constructor(adapters: readonly Adapter[]) {
    this.#adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    if (this.#adapters.size !== adapters.length) throw new Error('Duplicate adapter id');
  }

  async discover(): Promise<PulseEntity[]> {
    this.#assertActive();
    this.#discovery ??= this.#discover().catch((error: unknown) => {
      this.#discovery = undefined;
      throw error;
    });
    await this.#discovery;
    return this.list();
  }

  async #discover(): Promise<PulseEntity[]> {
    const pending: { adapter: Adapter; event: PulseEvent }[] = [];
    const unsubscribers: (() => void)[] = [];
    let ready = false;
    try {
      for (const adapter of this.#adapters.values()) {
        unsubscribers.push(adapter.subscribe((event) => {
          if (this.#disposed) return;
          if (ready) this.#receive(adapter, event);
          else pending.push({ adapter, event: structuredClone(event) });
        }));
      }
      const groups = await Promise.all([...this.#adapters.values()].map(async (adapter) => {
        const entities = await adapter.discover();
        if (entities.some((entity) => entity.source.adapter !== adapter.id)) {
          throw new Error(`Invalid entity owner: ${adapter.id}`);
        }
        return entities;
      }));
      this.#assertActive();
      const initial: PulseEvent[] = groups.flat().map((entity) => ({
        entityId: entity.id, timestamp: Date.now(), type: 'discovered', value: entity,
      }));
      const entities = projectEvents(initial);
      for (const { adapter, event } of pending) {
        if (event.type !== 'stateChanged' || entities.find((entity) => entity.id === event.entityId)?.source.adapter !== adapter.id) {
          throw new Error(`Invalid adapter event: ${adapter.id}`);
        }
      }
      const batch = [...initial, ...pending.map(({ event }) => event)];
      projectEvents(batch); // Validate the complete transaction before publishing anything.
      this.#unsubscribers = unsubscribers;
      ready = true;
      this.#append(batch);
      this.#assertActive();
      return this.list();
    } catch (error) {
      for (const unsubscribe of unsubscribers) unsubscribe();
      throw error;
    }
  }

  list(): PulseEntity[] { return projectEvents(this.#events); }
  getState(entityId: string) { return this.#entity(entityId).state; }
  getCapabilities(entityId: string) { return this.#entity(entityId).capabilities; }
  getEvents(): PulseEvent[] { return structuredClone(this.#events); }

  async execute(entityId: string, action: Action): Promise<void> {
    this.#assertActive();
    const entity = this.#entity(entityId);
    validateAction(entity.capabilities, action);
    await this.#adapters.get(entity.source.adapter)!.execute(entityId, structuredClone(action));
  }

  subscribe(handler: EventHandler): () => void {
    this.#assertActive();
    this.#listeners.add(handler);
    return () => { this.#listeners.delete(handler); };
  }

  dispose(): void {
    this.#disposed = true;
    for (const unsubscribe of this.#unsubscribers) unsubscribe();
    this.#unsubscribers = [];
    this.#listeners.clear();
    this.#notifications = [];
  }

  #entity(entityId: string): PulseEntity {
    const entity = this.list().find((item) => item.id === entityId);
    if (!entity) throw new Error(`Unknown entity: ${entityId}`);
    return entity;
  }

  #receive(adapter: Adapter, event: PulseEvent): void {
    const entity = event.type === 'discovered' ? event.value : this.#entity(event.entityId);
    if (entity.source.adapter !== adapter.id) {
      throw new Error(`Invalid adapter event: ${adapter.id}`);
    }
    // Adapters may discover an entity later, for example after local pairing.
    projectEvents([...this.#events, event]);
    this.#append([event]);
  }

  #append(events: PulseEvent[]): void {
    const saved = structuredClone(events);
    this.#events.push(...saved);
    this.#notifications.push(...saved);
    if (this.#notifying) return;
    this.#notifying = true;
    // A subscriber may execute another action; preserve the log's delivery order.
    while (this.#notifications.length && !this.#disposed) {
      const event = this.#notifications.shift()!;
      for (const handler of [...this.#listeners]) {
        if (this.#disposed) break;
        try { handler(structuredClone(event)); }
        catch (error) { console.error('Pulse subscriber failed', error); }
      }
    }
    this.#notifying = false;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Registry is disposed');
  }
}
