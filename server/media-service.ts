import type { Action } from '../core/action.ts';
import type { PulseEntity } from '../core/entity.ts';
import type { PulseEvent } from '../core/event.ts';
import { Registry } from '../core/registry.ts';
import type { DiscoveredDevice } from '../adapters/lan/types.ts';
import { UpnpAdapter } from '../adapters/upnp/index.ts';

export interface MediaSnapshot {
  status: 'ready' | 'starting' | 'error'; entities: PulseEntity[]; events: PulseEvent[]; error?: string;
}
export class MediaService {
  #adapter: UpnpAdapter;
  #registry: Registry;
  #startup?: Promise<void>;
  #closing?: Promise<void>;
  #closed = false;
  #state: MediaSnapshot['status'] = 'starting';
  #listeners = new Set<(snapshot: MediaSnapshot) => void>();
  constructor(storagePath: string) {
    this.#adapter = new UpnpAdapter(storagePath);
    this.#registry = new Registry([this.#adapter]);
    this.#registry.subscribe(() => this.#notify());
  }
  start(): Promise<void> {
    return this.#startup ??= this.#registry.discover().then(() => { this.#state = 'ready'; }, () => { this.#state = 'error'; }).then(() => this.#notify());
  }
  snapshot(): MediaSnapshot {
    return { status: this.#state, entities: this.#registry.list(), events: this.#registry.getEvents(),
      ...(this.#state === 'error' ? { error: 'No se pudieron cargar los televisores guardados.' } : {}) };
  }
  async add(candidate: DiscoveredDevice): Promise<void> {
    await this.start(); this.#assertReady();
    await this.#adapter.add(candidate);
  }
  async execute(entityId: string, action: Action): Promise<void> {
    await this.start(); this.#assertReady();
    await this.#registry.execute(entityId, action);
  }
  subscribe(handler: (snapshot: MediaSnapshot) => void): () => void {
    this.#listeners.add(handler); return () => { this.#listeners.delete(handler); };
  }
  close(): Promise<void> { return this.#closing ??= this.#close(); }
  async #close() {
    this.#closed = true; this.#listeners.clear();
    await this.#startup; await this.#adapter.close(); this.#registry.dispose();
  }
  #assertReady() { if (this.#closed || this.#state !== 'ready') throw new Error('Los controles de TV no están disponibles.'); }
  #notify() {
    if (this.#closed) return;
    const snapshot = this.snapshot();
    for (const handler of this.#listeners) {
      try { handler(structuredClone(snapshot)); } catch { /* A disconnected browser cannot stop local controls. */ }
    }
  }
}
