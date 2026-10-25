import type { Capability } from '../core/capability.ts';

export const cameras = {
  id: 'cameras', capabilities: ['videoStream', 'motion'] satisfies Capability[],
} as const;
