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
  demoLabel: 'Demo · a recorded evening',
  liveLabel: (incidents: number, cameras: number) => `London · ${incidents} incident${incidents === 1 ? '' : 's'} · ${cameras.toLocaleString('en-US')} cameras`,
  credit: 'Powered by TfL Open Data',

  lead: 'London’s roads as Pulse objects: what is happening on them now with the picture of the nearest traffic camera, the main corridors, the works, and the cameras themselves. Transport for London’s open data, read from the browser.',
  nothingYet: (why: string) => `TfL did not answer (${why}). The browser may be offline, or the feeds blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A recorded evening in London: a building fire closing Seven Sisters Road with the fire engines on camera, a breakdown on the A40, a camera switched off over another.',

  gotIt: 'Got it',
  watchClip: 'Watch the last clip',
  noCamera: 'no camera within 600 m',
  incidentWhy: (what: string, where: string) => `${what}: ${where}`,
  cameraWhy: (name: string, what: string, state: string) => `The camera at ${name}, watching ${what}, ${state}`,
  roadWhy: (name: string, what: string) => `${name}: ${what}`,
  dark: 'is not answering',
  frozen: (ago: string) => `has shown the same picture for ${ago}`,
  ago: (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; },
};
