import type { PulseEntity, State } from './entity.ts';

interface EventBase {
  entityId: string;
  timestamp: number;
}

export type PulseEvent = EventBase & (
  | { type: 'discovered'; value: PulseEntity }
  | { type: 'stateChanged'; value: State }
);

/** Replay in append order; timestamps are informational, never a sort key. */
export function projectEvents(events: readonly PulseEvent[]): PulseEntity[] {
  const entities = new Map<string, PulseEntity>();
  for (const event of events) {
    if (event.type === 'discovered') {
      if (event.value.id !== event.entityId || entities.has(event.entityId)) {
        throw new Error(`Invalid discovery: ${event.entityId}`);
      }
      entities.set(event.entityId, structuredClone(event.value));
    } else {
      const entity = entities.get(event.entityId);
      if (!entity) throw new Error(`Unknown entity: ${event.entityId}`);
      entity.state = { ...entity.state, ...structuredClone(event.value) };
    }
  }
  return [...entities.values()];
}
