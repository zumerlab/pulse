import { validateAction, type Action } from '../../core/action.ts';
import type { Adapter, EventHandler } from '../../core/adapter.ts';
import type { PulseEntity, State } from '../../core/entity.ts';
import { lighting } from '../../domains/lighting.ts';
import { openings } from '../../domains/openings.ts';
import { climate } from '../../domains/climate.ts';
import { security } from '../../domains/security.ts';

/** Simulates hardware only; the registry's log owns Pulse's state. */
export class MockAdapter implements Adapter {
  readonly id = 'mock';
  #listeners = new Set<EventHandler>();
  #entities: PulseEntity[] = [
    { kind: 'device', id: 'light:living', name: 'Living Light', domain: lighting.id,
      source: { adapter: this.id, local: true }, capabilities: [...lighting.capabilities],
      state: { on: true, brightness: 70 } },
    { kind: 'device', id: 'light:kitchen', name: 'Kitchen Light', domain: lighting.id,
      source: { adapter: this.id, local: true }, capabilities: [...lighting.capabilities],
      state: { on: false, brightness: 50 } },
    { kind: 'device', id: 'blind:bedroom', name: 'Bedroom Blind', domain: openings.id,
      source: { adapter: this.id, local: true }, capabilities: ['position'],
      state: { position: 50 } },
    { kind: 'device', id: 'thermostat:living', name: 'Living Thermostat', domain: climate.id,
      source: { adapter: this.id, local: true }, capabilities: [...climate.capabilities],
      state: { temperature: 21.7, targetTemperature: 22, hvacMode: 'heat' } },
    { kind: 'system', id: 'alarm:home', name: 'Home Alarm', domain: security.id,
      source: { adapter: this.id, local: true }, capabilities: ['alarmMode'],
      state: { alarmMode: 'disarmed' } },
  ];

  async discover(): Promise<PulseEntity[]> { return structuredClone(this.#entities); }
  async getState(entityId: string) { return structuredClone(this.#entity(entityId).state); }
  async getCapabilities(entityId: string) { return [...this.#entity(entityId).capabilities]; }

  async execute(entityId: string, action: Action): Promise<void> {
    const entity = this.#entity(entityId);
    validateAction(entity.capabilities, action);
    let patch: State;
    switch (action.type) {
      case 'turnOn': patch = { on: true }; break;
      case 'turnOff': patch = { on: false }; break;
      case 'setBrightness': patch = { brightness: action.value }; break;
      case 'setPosition': patch = { position: action.value }; break;
      case 'setTargetTemperature':
        if (action.value < 5 || action.value > 35) throw new Error('Mock target temperature must be between 5 and 35 °C');
        patch = { targetTemperature: action.value }; break;
      case 'setHvacMode': patch = { hvacMode: action.value }; break;
      case 'armHome': patch = { alarmMode: 'armedHome' }; break;
      case 'armAway': patch = { alarmMode: 'armedAway' }; break;
      case 'disarm': patch = { alarmMode: 'disarmed' }; break;
      default: throw new Error(`Unsupported mock action: ${action.type}`);
    }
    if (Object.entries(patch).every(([key, value]) => Object.is(entity.state[key], value))) return;
    entity.state = { ...entity.state, ...patch };
    for (const handler of [...this.#listeners]) {
      try { handler({ entityId, timestamp: Date.now(), type: 'stateChanged', value: structuredClone(patch) }); }
      catch (error) { console.error('Mock subscriber failed', error); }
    }
  }

  subscribe(handler: EventHandler): () => void {
    this.#listeners.add(handler);
    return () => { this.#listeners.delete(handler); };
  }

  #entity(entityId: string): PulseEntity {
    const entity = this.#entities.find((item) => item.id === entityId);
    if (!entity) throw new Error(`Unknown mock entity: ${entityId}`);
    return entity;
  }
}
