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

  // What is fine, folded away while something calls
  calmN: (n: number) => `${n} calm`,
  showCalm: 'Show',
  foldCalm: 'Fold the calm',
  showTheCalm: (n: number) => `Show the ${n} that are calm`,
  needsYou: (name: string) => `${name} needs you`,

  between: (lo: string, hi: string, unit: string) => `between ${lo}${unit} and ${hi}${unit}`,

  // The board (board.ts). A shell may replace any of these with its own words
  // (what it calls its things, its groups, its errors): `strings` in BoardOptions.
  connecting: 'Connecting…',
  allCalm: 'All calm.',
  thingsCalling: (n: number, why: string) => `${n} things calling · ${why}`,
  modes: { grid: 'Grid', orbit: 'Orbit', layers: 'Layers', list: 'List' } as Record<string, string>,
  today: 'today',
  monthAria: (what: string, month: string) => `${what} by day, ${month}`,
  loadingMonth: 'Loading the month…',
  monthNone: 'No statistics for this month.',
  viewSelector: 'View',
  latestChanges: 'Latest changes',
  waitingChanges: 'Waiting for changes…',
  alerts: 'Alerts',
  pulse: 'Pulse',
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
  changesAria: (n: number) => `The last 12 hours: ${n} ${n === 1 ? 'change' : 'changes'}, now at the top`,
  dayAria: 'The last 24 hours, now at the top: how much changed each hour',
  hubAria: 'The systems around, the one calling in its color; inside, the last hours',
  agoShort: (h: number) => h < 1 / 60 ? 'now' : h < 1 ? `${Math.round(h * 60)} min ago` : `${Math.round(h)} h ago`,
  stillOpen: 'Still open',
  changesTitle: (h: number) => `The last ${h} hours`,
  nChanges: (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`,
  openChanges: (h: number) => `Open the changes of the last ${h} hours`,
  changesIn24h: (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} in 24 h`,
  lastDays: (n: number, total: string) => `last ${n} days · ${total}`,
  lastDaysAria: (what: string, n: number) => `${what}, the last ${n} days, today at the top`,

  // The gear: what this screen shows
  settings: 'Settings',
  settingsLead: 'Kept in this browser only.',
  settingsTabs: { content: 'Content', board: 'Board', look: 'Look', tune: 'Tuning' } as Record<string, string>,
  contentLead: 'What the board shows: which systems, in which groups, and what each one follows.',
  boardLead: 'How the board is laid out and where it opens.',
  lookLead: 'Colors and how the rings are drawn.',
  tuneLead: 'Distances and sizes, as you move them. The board stays in view while you tune.',
  viewSection: 'View',
  showModes: 'Show the switch between views on the board',
  orbitSection: 'Orbit',
  layersSection: 'Layers',
  ringsSection: 'Rings',
  detailsSection: 'Details',
  customTheme: 'Custom',
  colorsField: 'Your colors',
  colorsHint: 'Starts from the theme that was chosen. The two alert colors are what calls; keep them apart from the rest.',
  colorLabels: { bg: 'Background', ink: 'Text', muted: 'Secondary text', dim: 'Rings at rest', line: 'Lines', minor: 'Alert', critical: 'Critical alert' } as Record<string, string>,
  tuneGroups: { orbit: 'Orbit', time: 'Time in the orbit', layers: 'Layers' } as Record<string, string>,
  tuneLabels: {
    orbit: 'Size of the orbit', tile: 'Thickness of each system\'s ring', align: 'Systems pulled inward', hub: 'Size of the center',
    orbitStep: 'Depth of the systems behind',
    layerGrow: 'Growth from layer to layer', layerEase: 'Spacing: tight behind or tight in front', layerStroke: 'Stroke of the layers behind',
    layerBlur: 'Blur of the layers behind', layerStep: 'Depth between layers', layerZoom: 'Size of the object', layerOpacity: 'Opacity of the layers behind',
    timeGap: 'Gap between the segments and the news', timeSplit: 'Height of the line across the face', timePointer: 'Pointer toward each system',
    timeBar: 'Tallest bar of a calm day',
  } as Record<string, string>,
  resetGroup: 'Reset',
  resetAllTuning: 'Reset all',
  systemsField: 'Systems',
  boardView: 'Board view',
  axisField: 'Group by',
  axes: { systems: 'Systems', groups: 'Groups' } as Record<string, string>,
  axisHint: 'By system, the board is one object per system. By group, each group is one object, with what calls the most in front.',
  noGroup: 'No group',
  openInside: 'Open inside',
  theBoard: 'The board',
  startHint: 'Where it opens the next time this screen loads.',
  groupsField: 'Groups',
  groupsHint: 'Only what is in the ticked groups.',
  channelsField: 'Channels',
  channelsHint: 'What each system shows, and what a channel follows when there is more than one.',
  pickFor: (channel: string) => `What ${channel} follows`,
  layersField: 'Layers',
  layersHint: 'How many systems the Layers view stacks; the rest are named under the object.',
  stackField: 'Layers in a system',
  stackHint: 'How many channels a system stacks as layers, front to back; the rest are named under the object.',
  allSystems: 'All of them',
  lookField: 'Look',
  dialField: 'Dial',
  dialLook: { full: 'Full ring', open: 'Open at the bottom, with its ends' } as Record<string, string>,
  dayField: 'Day ring',
  dayLook: { plain: 'Bars only', marks: 'With hour marks' } as Record<string, string>,
  endsField: 'Ring ends',
  endsLook: { flat: 'Square', rounded: 'Rounded' } as Record<string, string>,
  themeField: 'Theme',
  timeField: 'Time in the orbit',
  timeLook: { off: 'None', changes: 'The changes of the last 12 hours', clock: 'The clock, while all is calm', both: 'Both' } as Record<string, string>,
  monthField: 'Month',
  monthLook: { calendar: 'Calendar, the 1st at the top', rolling: 'Last 30 days, today at the top' } as Record<string, string>,
  themeNames: { graphite: 'Graphite', paper: 'Paper', deep: 'Deep', slate: 'Slate', mist: 'Mist', fog: 'Fog', night: 'Night', custom: 'Custom' } as Record<string, string>,
  themeNotes: { graphite: 'dark', paper: 'light, warm', deep: 'dark, blue', slate: 'light, blue-grey', mist: 'light, bluer', fog: 'light, greyer', night: 'dark, blue-grey', custom: 'your colors' } as Record<string, string>,
  resetSettings: 'Back to defaults',
  done: 'Done',
  close: 'Close',
  copy: 'Copy values',
  copied: 'Copied',
};
