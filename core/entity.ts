import type { Capability } from './capability.ts';
import type { Device } from './device.ts';
import type { System } from './system.ts';

export type Domain = 'lighting' | 'openings' | 'climate' | 'security' | 'cameras' | 'media';
export type State = Record<string, unknown>;

export interface Source {
  adapter: string;
  protocol?: string;
  provider?: string;
  local: boolean;
}

export interface Entity {
  id: string;
  name: string;
  domain: Domain;
  source: Source;
  capabilities: Capability[];
  state: State;
}

export type PulseEntity = Device | System;
