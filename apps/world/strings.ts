import { t as core } from '@zumer/pulse';

// The world app's own strings, on top of the object's.
const lower = (s: string) => s.toLowerCase();
export const t = {
  ...core,
  // The board's words, where the world has its own.
  connecting: 'Reading the feeds…',
  things: 'Behind this reading',
  hostError: (message: string) => `The feeds: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'reading', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · a day of calamities',
  liveLabel: (place: string) => `Calamities, from ${place}`,
  here: 'here',
  useLocation: 'Use my location',

  // While nothing answers
  lead: 'The calamities of the world as five objects: earthquakes, cyclones, floods, wildfires and volcanoes, the worst of each and the nearest to you. Public feeds (USGS, GDACS, NASA), no server, no sign-in.',
  nothingYet: (feeds: string[]) => `None of the feeds answered yet: ${feeds.join(', ')}. The browser may be offline, or the feeds blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A recorded day with a big earthquake at sea, a typhoon, a flood near Buenos Aires, a large wildfire and a volcano erupting.',

  // Readings
  seeOn: (where: string) => `See it on ${where}`,
  atSea: 'at sea: see tsunami.gov',
  quakeWhy: (mag: string, place: string, ago: string) => `M ${mag} ${place}, ${ago}`,
  nearQuake: (mag: string, km: number, place: string) => `M ${mag} ${km} km from you: ${place}`,
  nearHazard: (what: string, km: number, place: string) => `${km} km from ${place}: ${what}`,
  cycloneWhy: (name: string, country: string, alert: string, kmh: string, category: string) => `${name}: GDACS ${lower(alert)} alert, ${lower(category)}, winds of ${kmh} km/h${country ? ` · ${country}` : ''}`,
  floodWhy: (name: string, alert: string, lasted: string) => `${name}: GDACS ${lower(alert)} alert, for ${lasted}`,
  fireWhy: (name: string, alert: string, area: string, lasted: string) => `${name}: GDACS ${lower(alert)} alert, ${area} burnt in ${lasted}`,
  eruptionWhy: (name: string, country: string, alert: string, ago: string) => `${name}${country ? `, ${country}` : ''}: GDACS ${lower(alert)} alert, ${ago}`,
  volcanoWhy: (name: string, observatory: string, color: string, level: string) => `Aviation code ${lower(color)} at ${name}, alert level ${lower(level)} (${observatory})`,
  readNotice: 'Read the notice on USGS',
  volcanoPicture: (name: string) => `${name}, from its observatory`,
  belowSea: (m: string) => `${m} m below the sea`,
  threat: (level: string) => `${level} threat`,
  levels: (red: number, orange: number) => (red || orange ? [red && `${red} red`, orange && `${orange} orange`].filter(Boolean).join(' · ') : 'all green'),
};
