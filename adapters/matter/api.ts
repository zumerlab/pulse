import type { PulseEntity } from '../../core/entity.ts';
import type { PulseEvent } from '../../core/event.ts';

export interface MatterSnapshot {
  status: 'starting' | 'ready' | 'error';
  error?: string;
  entities: PulseEntity[];
  events: PulseEvent[];
  pairing: {
    status: 'idle' | 'pairing' | 'success' | 'error';
    candidateId?: string;
    message?: string;
  };
}
