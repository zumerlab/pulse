import { validateAction, type Action } from '../../core/action.ts';
import type { Adapter, EventHandler } from '../../core/adapter.ts';
import type { PulseEntity, State } from '../../core/entity.ts';
import type { PulseEvent } from '../../core/event.ts';
import type { MatterDriver, MatterEndpoint, PairingTarget } from './types.ts';

/** The protocol driver reports hardware state; this adapter never applies actions optimistically. */
export class MatterAdapter implements Adapter {
  readonly id = 'matter';
  #driver: MatterDriver;
  #entities = new Map<string, PulseEntity>();
  #pending = new Map<string, State>();
  #listeners = new Set<EventHandler>();
  #discovery?: Promise<PulseEntity[]>;
  #closed = false;

  constructor(driver: MatterDriver) { this.#driver = driver; }

  discover(): Promise<PulseEntity[]> {
    this.#discovery ??= this.#driver.start((id, state) => this.#report(id, state))
      .then((endpoints) => { this.#add(endpoints, false); return this.#list(); });
    return this.#discovery.then(() => this.#list());
  }

  async pair(target: PairingTarget, code: string): Promise<number> {
    await this.discover();
    const endpoints = await this.#driver.commission(target, code);
    if (this.#closed) return 0;
    this.#add(endpoints, true);
    return endpoints.length;
  }

  async getState(id: string): Promise<State> { return structuredClone(this.#entity(id).state); }
  async getCapabilities(id: string) { return [...this.#entity(id).capabilities]; }
  async execute(id: string, action: Action): Promise<void> {
    const entity = this.#entity(id);
    if (this.#closed || entity.state.online === false) throw new Error('El dispositivo no está disponible.');
    validateAction(entity.capabilities, action);
    await this.#driver.execute(id, structuredClone(action));
  }
  subscribe(handler: EventHandler): () => void {
    this.#listeners.add(handler);
    return () => { this.#listeners.delete(handler); };
  }
  async close(): Promise<void> {
    this.#closed = true;
    this.#listeners.clear();
    this.#pending.clear();
    await this.#driver.close();
  }
  #list() { return structuredClone([...this.#entities.values()]); }
  #entity(id: string): PulseEntity {
    const entity = this.#entities.get(id);
    if (!entity) throw new Error('Dispositivo desconocido.');
    return entity;
  }
  #add(endpoints: MatterEndpoint[], notify: boolean) {
    for (const endpoint of endpoints) {
      const entity: PulseEntity = {
        ...structuredClone(endpoint), kind: 'device', source: { adapter: this.id, protocol: 'Matter', local: true },
        state: { ...structuredClone(endpoint.state), ...this.#pending.get(endpoint.id) },
      };
      this.#pending.delete(entity.id);
      if (this.#entities.has(entity.id)) { this.#report(entity.id, entity.state); continue; }
      this.#entities.set(entity.id, entity);
      if (notify) this.#emit({ type: 'discovered', entityId: entity.id, value: entity, timestamp: Date.now() });
    }
  }
  #report(id: string, state: State) {
    if (this.#closed) return;
    const entity = this.#entities.get(id);
    if (!entity) {
      if (this.#pending.size < 256 || this.#pending.has(id)) this.#pending.set(id, { ...this.#pending.get(id), ...structuredClone(state) });
      return;
    }
    const patch = Object.fromEntries(Object.entries(state)
      .filter(([key, value]) => JSON.stringify(entity.state[key]) !== JSON.stringify(value)));
    if (!Object.keys(patch).length) return;
    Object.assign(entity.state, structuredClone(patch));
    this.#emit({ type: 'stateChanged', entityId: id, value: patch, timestamp: Date.now() });
  }
  #emit(event: PulseEvent) {
    for (const listener of this.#listeners) listener(structuredClone(event));
  }
}
