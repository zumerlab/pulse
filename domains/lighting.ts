import type { Capability } from '../core/capability.ts';

export const lighting = {
  id: 'lighting', capabilities: ['onOff', 'brightness'] satisfies Capability[],
} as const;
