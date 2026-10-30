import { t as core } from '@zumer/pulse';

// The Home Assistant app's own strings, on top of the object's.
export const t = {
  ...core,
  connecting: 'Connecting to your home…',
  allCalm: 'All calm.',
  thingsCalling: (n: number, why: string) => `${n} things calling · ${why}`,
  status: { connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  modes: { grid: 'Grid', orbit: 'Orbit', layers: 'Layers' },
  viewSelector: 'View',
  latestChanges: 'Latest changes',
  waitingChanges: 'Waiting for changes…',
  alerts: 'Alerts',
  pulse: 'Pulse',
  homePulse: 'Home pulse',
  alertNof: (i: number, n: number) => `Alert ${i} of ${n}`,
  nAlerts: (n: number) => `${n} ${n === 1 ? 'alert' : 'alerts'}`,
  openShort: 'Open',
  entitiesInHA: 'Entities in Home Assistant',
  backyardCamera: 'Backyard camera',
  haError: (message: string) => `Home Assistant: ${message}`,

  // Tuning panel (development only)
  tuning: 'Tuning',
  copy: 'Copy',
  copied: 'Copied',
  resetTuning: 'Back to code values',
};
