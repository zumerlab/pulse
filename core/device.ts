import type { Entity } from './entity.ts';

/** An object Pulse controls directly. */
export interface Device extends Entity {
  kind: 'device';
}
