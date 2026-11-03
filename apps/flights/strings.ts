import { t as core } from '@zumer/pulse';

// The flights app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where the sky has its own.
  connecting: 'Listening to the sky…',
  things: 'Behind this reading',
  noGroup: 'No category',
  hostError: (message: string) => `The networks: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'reading', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  useLocation: 'Use my location',
  here: 'here',
  demoLabel: 'Demo · a recorded sky',
  liveLabel: (region: string, n: number, global: number | null) => `${n} aircraft around ${region}${global != null ? ` · ${global.toLocaleString()} in the air worldwide` : ''}`,

  // While nothing answers
  lead: 'The sky as Pulse objects: the aircraft squawking an emergency anywhere in the world, the traffic around a place and what is odd in it, and the whole sky on a globe. Community ADS-B networks and OpenSky, read from the browser.',
  nothingYet: (why: string) => `None of the networks answered (${why}). The browser may be offline, or the networks blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A recorded sky: an airliner squawking 7700 over the Atlantic, Buenos Aires with forty aircraft around it, a fast descent, a lost signal.',

  // Readings
  gotIt: 'Got it',
  seeOnMap: 'See it on the map',
  seeOn: (site: string) => `See it on ${site}`,
  squawk: { '7700': 'general emergency', '7600': 'radio failure', '7500': 'unlawful interference' } as Record<string, string>,
  emergencies: { general: 'general emergency', lifeguard: 'medical', minfuel: 'minimum fuel', nordo: 'no radio', unlawful: 'unlawful interference', downed: 'downed' } as Record<string, string>,
  squawkWhy: (flight: string, type: string, what: string, alt: string, where: string) => `${flight}${type ? ` (${type})` : ''} is squawking ${what}, ${alt}, ${where}`,
  descentWhy: (flight: string, rate: number, alt: number) => `${flight} is descending at ${rate.toLocaleString()} ft/min through ${alt.toLocaleString()} ft`,
  lostWhy: (flight: string, s: number, alt: number) => `${flight} has not been heard from for ${s} s, last at ${alt.toLocaleString()} ft`,
  lowSlowWhy: (flight: string, alt: number, gs: number, nm: number) => `${flight} is at ${alt} ft and ${gs} kn, ${nm} nm from the nearest airport`,
  compass: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
};
