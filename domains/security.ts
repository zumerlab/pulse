import type { Capability } from '../core/capability.ts';

export const security = {
  id: 'security', capabilities: ['alarmMode', 'motion', 'contact'] satisfies Capability[],
} as const;
