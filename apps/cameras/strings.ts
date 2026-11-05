import { t as core } from '@zumer/pulse';

// The cameras app's own strings, on top of the object's.
export const t = {
  ...core,
  connecting: 'Looking at the roads…',
  things: 'Behind this reading',
  noGroup: 'Elsewhere',
  hostError: (message: string) => `TfL: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'reading', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  demoLabel: (city: string) => `Demo · ${city}, recorded`,
  liveLabel: (city: string, incidents: number, cameras: number) => `${city} · ${incidents} incident${incidents === 1 ? '' : 's'} · ${cameras.toLocaleString('en-US')} cameras`,

  lead: 'A city’s roads as Pulse objects: what is happening on them now with the nearest traffic camera, live where it streams, what the signs and the corridors say, and the cameras themselves. The Bay Area from Caltrans and the CHP, London from TfL, read from the browser.',
  nothingYet: (why: string) => `The feeds did not answer (${why}). The browser may be offline, or the feeds blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'The Bay Area’s incidents and signs as recorded, with the cameras’ live streams; London on a recorded evening (?city=london): a building fire closing Seven Sisters Road with the fire engines on camera.',

  gotIt: 'Got it',
  watchClip: 'Watch the last clip',
  noCamera: 'no camera within 600 m',
  incidentWhy: (what: string, where: string) => `${what}: ${where}`,
  cameraWhy: (name: string, what: string, state: string) => `The camera at ${name}, watching ${what}, ${state}`,
  signWhy: (where: string, what: string) => `The sign at ${where} says ${what}`,
  roadWhy: (name: string, what: string) => `${name}: ${what}`,
  dark: 'is not answering',
  frozen: (ago: string) => `has shown the same picture for ${ago}`,
  ago: (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; },
};
