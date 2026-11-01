// The strings of the radial object, in one place. English is the only
// language today. Another language is another object with the same shape plus
// a way to pick it; the apps extend this dictionary with their own strings and
// their demo data (system and channel names, alert texts) would switch along.

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

  // Strip under the object
  inFront: (channel: string) => `${channel} in front`,
  behind: (n: number) => `+${n} behind`,
  moreWaiting: (n: number) => `${count(n, 'more alert')} waiting`,
  mute: 'Mute',
  inProgress: 'in progress…',
  sending: 'sending…',
  noEntities: 'No entities for this system.',
  alertIn: (channel: string, why: string) => `Alert in ${channel}: ${why}`,
  dialOf: (dial: string, channel: string) => `${dial} for ${channel}`,
  nOfM: (n: number, m: number) => `${n} of ${m}`,

  // Primitives
  low: 'low', high: 'high',
  handleOf: (end: string, dial: string) => `${end} end of ${dial}`,
  last24h: 'last 24 hours',
  now: 'now',
  hoursAgo: (n: number) => n === 1 ? '1 hour ago' : `${n} hours ago`,
  hAgo: (n: number) => `${n} h ago`,
  sinceTime: (at: string) => `since ${at}`,
  hueSat: (h: number, s: number) => `hue ${h}°, saturation ${s}%`,
  between: (lo: string, hi: string, unit: string) => `between ${lo}${unit} and ${hi}${unit}`,

  // The board (board.ts). A shell may replace any of these with its own words
  // (what it calls its things, its errors): `strings` in BoardOptions.
  connecting: 'Connecting…',
  allCalm: 'All calm.',
  thingsCalling: (n: number, why: string) => `${n} things calling · ${why}`,
  modes: { grid: 'Grid', orbit: 'Orbit', layers: 'Layers' },
  viewSelector: 'View',
  latestChanges: 'Latest changes',
  waitingChanges: 'Waiting for changes…',
  alerts: 'Alerts',
  pulse: 'Pulse',
  thePulse: 'The pulse',
  alertNof: (i: number, n: number) => `Alert ${i} of ${n}`,
  nAlerts: (n: number) => count(n, 'alert'),
  openShort: 'Open',
  things: 'Behind this reading',
  showSquare: 'Show square',
  showRound: 'Show round',
  live: 'Live',
  snapshot: 'Snapshot',
  historyLoading: 'Loading the last 24 hours…',
  historyNone: 'No history for the last 24 hours.',
  outsideIn: (first: number) => first ? `The rings, outside in (the first ${first}):` : 'The rings, outside in:',
  dayOf: (channel: string) => `The last 24 hours of ${channel}`,
  colorOf: (name: string) => `Color of ${name}`,
  lowOf: (label: string) => `Low ${label}`,
  highOf: (label: string) => `High ${label}`,
  hostError: (message: string) => `Did not go through: ${message}`,
  didNotRespond: (names: string[]) => `${listOf(names)} did not respond.`,
  retry: 'Retry',

  // The gear: what this screen shows
  settings: 'Settings',
  settingsLead: 'What this screen shows. Kept in this browser only.',
  systemsField: 'Systems',
  boardView: 'Board view',
  openInside: 'Open inside',
  theBoard: 'The board',
  startHint: 'Where it opens the next time this screen loads.',
  groupsField: 'Groups',
  groupsHint: 'Only what is in the ticked groups.',
  channelsField: 'Channels',
  channelsHint: 'What each system shows, and what a channel follows when there is more than one.',
  pickFor: (channel: string) => `What ${channel} follows`,
  lookField: 'Look',
  dialField: 'Dial',
  dialLook: { full: 'Full ring', open: 'Open at the bottom, with its ends' } as Record<string, string>,
  dayField: 'Day ring',
  dayLook: { plain: 'Bars only', marks: 'With hour marks' } as Record<string, string>,
  resetSettings: 'Back to defaults',
  done: 'Done',
  close: 'Close',

  // Tuning panel (development only)
  tuning: 'Tuning',
  copy: 'Copy',
  copied: 'Copied',
  resetTuning: 'Back to code values',
};
