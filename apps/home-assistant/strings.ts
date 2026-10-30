import { t as core } from '@zumer/pulse';

// The Home Assistant app's own strings, on top of the object's.
export const t = {
  ...core,
  connecting: 'Connecting to your home…',
  allCalm: 'All calm.',
  thingsCalling: (n: number, why: string) => `${n} things calling · ${why}`,
  status: { 'signed-out': 'signed out', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
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
  signOut: 'Sign out',

  // Sign in
  loginLead: 'Your home, as one object per system. Sign in with your Home Assistant account to begin.',
  yourHA: 'Your Home Assistant',
  signIn: 'Sign in with Home Assistant',
  tokenInstead: 'Use a long-lived access token instead',
  tokenLabel: 'Long-lived access token',
  tokenHint: 'For wall panels and kiosks. Create one in Home Assistant under your profile › Security.',
  connect: 'Connect',
  errCannotConnect: 'Could not reach Home Assistant at that address.',
  errInvalidAuth: 'Home Assistant did not accept the credentials. Sign in again.',
  errHostRequired: 'Enter the address of your Home Assistant.',
  errHttpsToHttp: 'A page served over HTTPS cannot sign in to a Home Assistant over HTTP.',
  errAuthCallback: 'The sign-in did not complete. Try again.',
  errNoConnection: 'No connection to Home Assistant.',

  // Tuning panel (development only)
  tuning: 'Tuning',
  copy: 'Copy',
  copied: 'Copied',
  resetTuning: 'Back to code values',
};
