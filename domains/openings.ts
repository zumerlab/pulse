import type { Capability } from '../core/capability.ts';

export const openings = {
  id: 'openings', capabilities: ['position', 'lock', 'contact'] satisfies Capability[],
} as const;
