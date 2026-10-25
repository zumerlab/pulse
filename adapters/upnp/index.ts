import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Adapter, EventHandler } from '../../core/adapter.ts';
import { validateAction, type Action } from '../../core/action.ts';
import type { PulseEntity, State } from '../../core/entity.ts';
import type { PulseEvent } from '../../core/event.ts';
import type { DiscoveredDevice } from '../lan/types.ts';
import { inspectRenderer, pinnedUrl, readRenderer, writeRenderer, type Renderer } from './client.ts';

type SavedDevice = { candidate: DiscoveredDevice; entity: PulseEntity };
type LinkedDevice = SavedDevice & { renderer?: Renderer };

/** Local renderer metadata persists; every displayed change still enters the event log. */
export class UpnpAdapter implements Adapter {
  readonly id = 'upnp';
  #path: string;
  #devices = new Map<string, LinkedDevice>();
  #listeners = new Set<EventHandler>();
  #startup?: Promise<PulseEntity[]>;
  #work: Promise<unknown> = Promise.resolve();
  #timer?: ReturnType<typeof setInterval>;
  #polling = false;
  #closed = false;
  constructor(storagePath: string) { this.#path = storagePath; }
  discover(): Promise<PulseEntity[]> { return this.#startup ??= this.#discover(); }
  async #discover(): Promise<PulseEntity[]> {
    let contents: string;
    try { contents = await readFile(this.#path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; contents = '{"version":1,"devices":[]}'; }
    if (contents.length > 262_144) throw new Error('El archivo de dispositivos es demasiado grande.');
    const saved = JSON.parse(contents) as { version: number; devices: SavedDevice[] };
    if (saved.version !== 1 || !Array.isArray(saved.devices) || saved.devices.length > 64) throw new Error('Archivo de dispositivos no válido.');
    for (const item of saved.devices) {
      const { entity, candidate } = item;
      if (!entity || entity.kind !== 'device' || entity.domain !== 'media' || entity.source?.adapter !== this.id
        || !/^upnp:[a-f0-9]{24}$/.test(entity.id) || typeof entity.name !== 'string'
        || !Array.isArray(entity.capabilities) || !entity.capabilities.length
        || entity.capabilities.some((capability) => !['volume', 'mute'].includes(capability))
        || !candidate || !Array.isArray(candidate.addresses) || !candidate.upnp) throw new Error('Dispositivo guardado no válido.');
      pinnedUrl(candidate.upnp.descriptionUrl, candidate);
      if (this.#devices.has(entity.id)) throw new Error('Dispositivo guardado duplicado.');
      entity.state = { online: false }; // Offline restoration never pretends an old reading is live.
      const entry: LinkedDevice = { candidate, entity };
      try {
        entry.renderer = await inspectRenderer(candidate);
        this.#checkIdentity(entry, entry.renderer);
        entity.state = entry.renderer.state;
      } catch { entry.renderer = undefined; }
      this.#devices.set(entity.id, entry);
    }
    if (!this.#closed) {
      this.#timer = setInterval(() => {
        if (this.#polling || this.#closed) return;
        this.#polling = true;
        void this.#enqueue(() => this.#refresh()).catch(() => {}).finally(() => { this.#polling = false; });
      }, 10_000);
      this.#timer.unref();
    }
    return structuredClone([...this.#devices.values()].map((item) => item.entity));
  }
  async add(candidate: DiscoveredDevice): Promise<void> {
    await this.discover();
    return this.#enqueue(async () => {
      const renderer = await inspectRenderer(candidate);
      const existing = this.#devices.get(renderer.id);
      if (!existing && this.#devices.size >= 64) throw new Error('Pulse admite hasta 64 televisores locales.');
      if (existing) this.#checkIdentity(existing, renderer);
      const entity: PulseEntity = existing?.entity ?? {
        id: renderer.id, name: renderer.name, kind: 'device', domain: 'media',
        source: { adapter: this.id, protocol: 'UPnP', local: true }, capabilities: renderer.capabilities, state: renderer.state,
      };
      const entry = { candidate: structuredClone(candidate), entity, renderer };
      await this.#persist([...this.#devices.values()].filter((item) => item.entity.id !== entity.id).concat(entry));
      if (this.#closed) return;
      this.#devices.set(entity.id, entry);
      if (existing) this.#report(entry, renderer.state);
      else this.#emit({ type: 'discovered', entityId: entity.id, timestamp: Date.now(), value: entity });
    });
  }
  async getState(id: string): Promise<State> { return structuredClone(this.#device(id).entity.state); }
  async getCapabilities(id: string) { return [...this.#device(id).entity.capabilities]; }
  execute(id: string, action: Action): Promise<void> {
    return this.#enqueue(async () => {
      const entry = this.#device(id);
      validateAction(entry.entity.capabilities, action);
      if (!entry.renderer || entry.entity.state.online !== true) throw new Error('El televisor no está disponible. Enciéndelo y vuelve a intentar.');
      try {
        let state: State;
        if (action.type === 'setVolume') state = await writeRenderer(entry.renderer, 'volume', action.value);
        else if (action.type === 'setMute') state = await writeRenderer(entry.renderer, 'mute', action.value);
        else throw new Error('Acción no compatible.');
        this.#report(entry, state);
      } catch {
        entry.renderer = undefined;
        this.#report(entry, { online: false });
        throw new Error('No se pudo confirmar el cambio en el televisor.');
      }
    });
  }
  subscribe(handler: EventHandler): () => void { this.#listeners.add(handler); return () => { this.#listeners.delete(handler); }; }
  async close(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#timer);
    this.#listeners.clear();
    await this.#startup?.catch(() => {});
    await this.#work;
  }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#work.then(() => { if (this.#closed) throw new Error('Los controles locales están cerrados.'); return operation(); });
    this.#work = result.catch(() => {});
    return result;
  }
  #device(id: string): LinkedDevice {
    const entry = this.#devices.get(id);
    if (!entry) throw new Error('Televisor desconocido.');
    return entry;
  }
  #checkIdentity(entry: LinkedDevice, renderer: Renderer) {
    if (entry.entity.id !== renderer.id || entry.entity.capabilities.some((capability) => !renderer.capabilities.includes(capability))) {
      throw new Error('El dispositivo guardado cambió de identidad o de controles.');
    }
  }
  async #refresh() {
    for (const entry of this.#devices.values()) {
      if (this.#closed) return;
      try {
        if (!entry.renderer) {
          const renderer = await inspectRenderer(entry.candidate);
          this.#checkIdentity(entry, renderer);
          entry.renderer = renderer;
          this.#report(entry, renderer.state);
        } else this.#report(entry, await readRenderer(entry.renderer));
      } catch { entry.renderer = undefined; this.#report(entry, { online: false }); }
    }
  }
  #report(entry: LinkedDevice, state: State) {
    if (this.#closed) return;
    const patch = Object.fromEntries(Object.entries(state).filter(([key, value]) => entry.entity.state[key] !== value));
    if (!Object.keys(patch).length) return;
    Object.assign(entry.entity.state, patch);
    this.#emit({ type: 'stateChanged', entityId: entry.entity.id, timestamp: Date.now(), value: patch });
  }
  #emit(event: PulseEvent) { for (const listener of this.#listeners) listener(structuredClone(event)); }
  async #persist(devices: SavedDevice[]) {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.#path), 0o700);
    const temporary = `${this.#path}.tmp`;
    const data = { version: 1, devices: devices.map(({ candidate, entity }) => ({ candidate, entity })) };
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, this.#path);
  }
}
