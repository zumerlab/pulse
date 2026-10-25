import type { Action } from '../../core/action.ts';
import type { Capability } from '../../core/capability.ts';
import type { Domain, State } from '../../core/entity.ts';

export interface MatterEndpoint {
  id: string;
  name: string;
  domain: Domain;
  capabilities: Capability[];
  state: State;
}

/** Addresses come only from the server's latest LAN discovery, never from request input. */
export interface PairingTarget {
  addresses: string[];
  port: number;
  discriminator?: number;
}

export interface MatterDriver {
  start(onReport: (entityId: string, state: State) => void): Promise<MatterEndpoint[]>;
  commission(target: PairingTarget, code: string): Promise<MatterEndpoint[]>;
  execute(entityId: string, action: Action): Promise<void>;
  close(): Promise<void>;
}
