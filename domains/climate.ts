import type { Capability } from '../core/capability.ts';

export const climate = {
  id: 'climate', capabilities: ['temperature', 'targetTemperature', 'hvacMode'] satisfies Capability[],
} as const;
