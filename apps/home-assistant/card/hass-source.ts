// PulseSource over the `hass` object a custom card receives: Home Assistant
// already holds the connection and pushes a new `hass` on every change.
import type { Call, HassState, PulseSource, States, Status } from '../source.ts';
import { t } from '../strings.ts';
import type { HomeAssistant } from './hass.ts';

export class HassSource implements PulseSource {
  readonly states: States = new Map();
  status: Status = 'connecting';
  error = '';
  version = '';
  unit = '°';
  private hass: HomeAssistant | null = null;
  private listeners = new Set<(changed: HassState[]) => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  url(path: string) { return /^https?:/.test(path) ? path : this.hass ? this.hass.hassUrl(path) : path; }

  // Each `hass` carries the whole state; the frontend keeps the objects of the
  // entities that did not change, so a diff by reference finds the changed ones.
  setHass(hass: HomeAssistant) {
    this.hass = hass;
    this.version = hass.config?.version ?? '';
    this.unit = hass.config?.unit_system?.temperature ?? '°';
    const changed: HassState[] = [];
    for (const [id, e] of Object.entries(hass.states)) {
      if (this.states.get(id) !== e) { this.states.set(id, e); changed.push(e); }
    }
    for (const id of [...this.states.keys()]) if (!(id in hass.states)) this.states.delete(id);
    const status: Status = hass.connected === false ? 'offline' : 'live';
    if (status !== this.status) {
      this.status = status;
      this.statusListeners.forEach((fn) => fn());
    }
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
  }

  call({ domain, service, data }: Call) {
    if (!this.hass) return Promise.reject(new Error(t.errNoConnection));
    const { entity_id, ...rest } = data;
    return this.hass.callService(domain, service, rest, entity_id ? { entity_id: entity_id as string | string[] } : undefined);
  }
}
