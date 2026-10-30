import { t as core } from '@zumer/pulse';

// The demo's own strings, on top of the object's.
export const t = {
  ...core,
  allCalmUnless: 'All calm, unless something calls.',
  simulateCritical: (system: string) => `Simulate a critical alert in ${system}`,
  simulateAlert: 'Simulate alert',
  resolveAlerts: 'Resolve alerts',
  howLights: 'Tap a light to switch it on or off',
  allOff: 'all off',
};
