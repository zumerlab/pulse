import type { Action } from '../core/action.ts';
import { Registry } from '../core/registry.ts';
import { MatterAdapter } from '../adapters/matter/index.ts';
import type { MatterDriver, PairingTarget } from '../adapters/matter/types.ts';
import type { MatterSnapshot } from '../adapters/matter/api.ts';

/** One controller and append-only event log per local server session. */
export class MatterService {
  #factory: () => Promise<MatterDriver>;
  #adapter?: MatterAdapter;
  #registry?: Registry;
  #startup?: Promise<void>;
  #job?: Promise<void>;
  #closing?: Promise<void>;
  #closed = false;
  #state: MatterSnapshot = { status: 'starting', entities: [], events: [], pairing: { status: 'idle' } };
  #listeners = new Set<(snapshot: MatterSnapshot) => void>();

  constructor(factory: () => Promise<MatterDriver>) { this.#factory = factory; }
  snapshot(): MatterSnapshot {
    return structuredClone({ ...this.#state, entities: this.#registry?.list() ?? [], events: this.#registry?.getEvents() ?? [] });
  }
  start(): Promise<void> {
    this.#startup ??= this.#start();
    return this.#startup;
  }
  async #start() {
    try {
      const driver = await this.#factory();
      if (this.#closed) { await driver.close(); return; }
      this.#adapter = new MatterAdapter(driver);
      this.#registry = new Registry([this.#adapter]);
      this.#registry.subscribe(() => this.#notify());
      await this.#registry.discover();
      if (!this.#closed) this.#state.status = 'ready';
    } catch {
      this.#state.status = 'error';
      this.#state.error = 'No se pudo iniciar Matter. Revisa la conexión local y vuelve a iniciar Pulse.';
    }
    this.#notify();
  }
  pair(candidateId: string, target: PairingTarget, code: string): void {
    if (this.#closed || this.#state.status !== 'ready' || !this.#adapter) throw new Error('Matter todavía no está disponible.');
    if (this.#job) throw new Error('Ya hay una vinculación en curso.');
    this.#state.pairing = { status: 'pairing', candidateId, message: 'Vinculando el dispositivo… Puede tardar hasta un minuto.' };
    this.#notify();
    this.#job = Promise.resolve().then(() => this.#adapter!.pair(target, code)).then((count) => {
      this.#state.pairing = {
        status: 'success', candidateId,
        message: count ? 'Dispositivo vinculado. Sus controles ya están disponibles.'
          : 'Dispositivo vinculado. Pulse todavía no admite sus capacidades; la vinculación quedó guardada.',
      };
    }).catch(() => {
      this.#state.pairing = { status: 'error', candidateId,
        message: 'No se pudo completar la vinculación. Revisa el código y que el dispositivo siga disponible para vincular; vuelve a buscar antes de reintentar.' };
    }).finally(() => { this.#job = undefined; this.#notify(); });
  }
  async execute(id: string, action: Action): Promise<void> {
    if (this.#closed || this.#state.status !== 'ready' || !this.#registry) throw new Error('Matter no está disponible.');
    await this.#registry.execute(id, action);
  }
  subscribe(handler: (snapshot: MatterSnapshot) => void): () => void {
    this.#listeners.add(handler);
    return () => { this.#listeners.delete(handler); };
  }
  close(): Promise<void> { return this.#closing ??= this.#close(); }
  async #close() {
    this.#closed = true;
    this.#listeners.clear();
    // Stop protocol work before releasing the registry. No credentials are cleared.
    await this.#startup;
    await this.#adapter?.close();
    await this.#job;
    this.#registry?.dispose();
  }
  #notify() {
    if (this.#closed) return;
    const snapshot = this.snapshot();
    for (const handler of this.#listeners) {
      try { handler(structuredClone(snapshot)); } catch { /* A disconnected browser cannot stop the controller. */ }
    }
  }
}
