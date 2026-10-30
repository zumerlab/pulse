// Every string the prototypes show, in one place. English is the only language
// today. Another language is another object with the same shape plus a way to
// pick it; the demo data (system and channel names, alert texts in
// `systems.ts` and `model.ts`) would switch along with it.

export const LOCALE = 'en-US';

export const num = (n: number, digits = 1) => n.toLocaleString(LOCALE, { maximumFractionDigits: digits });
export const time = (d: Date) =>
  d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const t = {
  // Navigation
  board: 'Board',
  open: (name: string) => `Open ${name}`,
  details: (name: string) => `${name} details`,
  bringToFront: (name: string) => `Bring ${name} to the front`,
  systems: 'Systems',
  view3d: 'View in 3D',
  viewFlat: 'View flat',

  // Board with simulated data
  allCalmUnless: 'All calm, unless something calls.',
  simulateCritical: (system: string) => `Simulate a critical alert in ${system}`,
  simulateAlert: 'Simulate alert',
  resolveAlerts: 'Resolve alerts',

  // Strip under the object
  inFront: (channel: string) => `${channel} in front`,
  behind: (n: number) => `+${n} behind`,
  howDial: 'Drag the ring · tap the center for more',
  howLights: 'Tap a light to switch it on or off',
  howSegments: 'Tap a segment to change it',
  moreWaiting: (n: number) => `${count(n, 'more alert')} waiting`,
  mute: 'Mute',
  inProgress: 'in progress…',
  sending: 'sending…',
  noEntities: 'No entities for this system.',
  alertIn: (channel: string, why: string) => `Alert in ${channel}: ${why}`,
  dialOf: (dial: string, channel: string) => `${dial} for ${channel}`,
  allOff: 'all off',
  nOfM: (n: number, m: number) => `${n} of ${m}`,

  // Board over Home Assistant
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
  nAlerts: (n: number) => count(n, 'alert'),
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
