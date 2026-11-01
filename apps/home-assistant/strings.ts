import { t as core } from '@zumer/pulse';

// The Home Assistant app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where Home Assistant has its own.
  connecting: 'Connecting to your home…',
  entitiesInHA: 'Entities in Home Assistant',
  haError: (message: string) => `Home Assistant: ${message}`,
  areasField: 'Areas',
  areasHint: 'Only what is in the ticked areas; an entity with no area stays out.',
  entityFor: (channel: string) => `Entity for ${channel}`,
  signOut: 'Sign out',
  status: { 'signed-out': 'signed out', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,

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

  // Demo homes (the ones of demo.home-assistant.io, no Home Assistant needed)
  demo: 'demo',
  demoLead: 'No Home Assistant at hand? Explore one of the homes of demo.home-assistant.io, right here.',
  demoHome: 'Demo home',
  exploreDemo: 'Explore the demo',
  leaveDemo: 'Leave the demo',
  browseHomes: 'See every demo home, with a preview',

  // The index (gallery.html)
  galleryLead: 'Your home, as one object per system. Pick where to look.',
  yourHALead: 'Sign in with your Home Assistant account; the object is built from your own entities.',
  demoApp: 'Pulse demo',
  demoAppLead: 'The object over simulated systems: home, car, pet, health and server, with alerts to trigger.',
  demoHomes: 'Demo homes',
  demoHomesLead: 'The six homes of demo.home-assistant.io, with entities that answer the ring. No Home Assistant needed.',
  homeFoot: (entities: number, systems: number) => `${entities} entities · ${systems} ${systems === 1 ? 'system' : 'systems'}`,
};
