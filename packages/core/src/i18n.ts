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
  howDial: 'Drag the ring · tap the center for more',
  howSegments: 'Tap a segment to change it',
  moreWaiting: (n: number) => `${count(n, 'more alert')} waiting`,
  mute: 'Mute',
  inProgress: 'in progress…',
  sending: 'sending…',
  noEntities: 'No entities for this system.',
  alertIn: (channel: string, why: string) => `Alert in ${channel}: ${why}`,
  dialOf: (dial: string, channel: string) => `${dial} for ${channel}`,
  nOfM: (n: number, m: number) => `${n} of ${m}`,
};
