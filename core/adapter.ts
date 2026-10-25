import type { Action } from './action.ts';
import type { Capability } from './capability.ts';
import type { PulseEntity, State } from './entity.ts';
import type { PulseEvent } from './event.ts';

export type EventHandler = (event: PulseEvent) => void;

export interface Adapter {
  readonly id: string;
  discover(): Promise<PulseEntity[]>;
  getState(entityId: string): Promise<State>;
  getCapabilities(entityId: string): Promise<Capability[]>;
  execute(entityId: string, action: Action): Promise<void>;
  subscribe(handler: EventHandler): () => void;
}
