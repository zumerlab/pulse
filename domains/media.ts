import type { Capability } from '../core/capability.ts';

export const media = {
  id: 'media', capabilities: ['volume', 'mute'] satisfies Capability[],
} as const;
