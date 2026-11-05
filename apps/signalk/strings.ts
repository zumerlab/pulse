import { t as core } from '@zumer/pulse';

// The Signal K app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where a boat has its own.
  connecting: 'Reading the vessel…',
  things: 'Behind this reading',
  hostError: (message: string) => `The server: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  disconnect: 'Disconnect',
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · Tehuelche',

  // Connecting
  connectLead: 'Your boat as one object per system: navigation, wind, batteries, tanks, engine, autopilot. Point it at a Signal K server, or at the demo one.',
  serverField: 'Signal K server',
  serverHint: 'The server’s address: http://openplotter.local:3000 on board, or https://demo.signalk.org to watch the demo vessel.',
  tokenField: 'Token (only if the server asks for one)',
  connect: 'Connect',
  exploreDemo: 'Explore the recorded yacht instead',
  demoHint: 'A yacht motor-sailing off Mar del Plata with a few things calling, right here, no server needed.',
  errNoServer: (url: string, why: string) => `No Signal K server answered at ${url} (${why}).`,
  errUnauthorized: 'The server refused the token.',

  // Readings
  gotIt: 'Got it',
  port: 'port', starboard: 'starboard',
  compass: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  shallow: (m: string) => `Shallow water: ${m} m under the transducer`,
  strongWind: (kn: string) => `Apparent wind of ${kn} knots`,
  batteryLow: (pct: string) => `House battery at ${pct}%`,
  batteryWeak: (v: string) => `Engine battery at ${v} V`,
  tankLow: (name: string, pct: string) => `${name} at ${pct}%`,
  tankFull: (name: string, pct: string) => `${name} ${pct}% full`,
  engineHot: (c: string) => `Coolant at ${c}°C`,
  oilLow: (bar: string) => `Oil pressure at ${bar} bar with the engine running`,
  dragging: (m: string, max: string) => `The anchor is dragging: ${m} m from the drop, ${max} m allowed`,
  autopilotStates: { standby: 'Standby', auto: 'Auto', wind: 'Wind', route: 'Route' } as Record<string, string>,

  // Traffic: how close each vessel will pass, and when
  clear: 'Clear',
  opening: 'opening',
  passes: (cpa: string, inMin: string) => `passes ${cpa} in ${inMin}`,
  closestPass: (name: string, cpa: string, inMin: string) => `closest pass ${name}, ${cpa} in ${inMin}`,
  noneClosing: (n: number) => `${n} ${n === 1 ? 'vessel' : 'vessels'} within 5 nm, none closing`,
  cpaWhy: (name: string, cpa: string, inMin: string, now: string, dir: string, kts: string | null) => `${name} will pass ${cpa} from you in ${inMin}; now ${now} to the ${dir}${kts ? `, making ${kts} kn` : ''}`,
  closeWhy: (name: string, now: string, dir: string) => `${name} is ${now} off to the ${dir}`,
  vessels: (n: number) => `${n} ${n === 1 ? 'vessel' : 'vessels'}`,
  thisBoat: 'this boat',
  vessel: 'Vessel',
  noDetails: 'no details on its AIS',
  seeOn: (site: string) => `See it on ${site}`,
};
