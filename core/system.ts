import type { Entity } from './entity.ts';

/** An external controller exposed to Pulse as one unit. */
export interface System extends Entity {
  kind: 'system';
}
