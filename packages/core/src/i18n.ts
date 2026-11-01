// The strings of the radial object, in one place. English is the only
// language today. Another language is another object with the same shape plus
// a way to pick it; the apps extend this dictionary with their own strings and
// their demo data (system and channel names, alert texts) would switch along.
//
// The locale (numbers, times) does follow the source: Home Assistant tells the
// user's language and the app passes it on with setLocale.

let locale = 'en-US';
export const setLocale = (tag?: string) => { locale = tag || 'en-US'; };
export const localeOf = () => locale;

export const num = (n: number, digits = 1) => n.toLocaleString(locale, { maximumFractionDigits: digits });
export const time = (d: Date) =>
  d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const listOf = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

export const t = {
  // Navigation
  board: 'Board',
  open: (name: string) => `Open ${name}`,
  openHint: 'Open',
  details: (name: string) => `${name} details`,
  bringToFront: (name: string) => `Bring ${name} to the front`,
  layerIndex: 'Layers, front to back',
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
  hueOf: (name: string) => `Hue of ${name}`,
  saturationOf: (name: string) => `Saturation of ${name}`,
  nOptions: (n: number) => count(n, 'option'),
  scrollbarOf: (name: string) => `Scroll ${name}`,
};
