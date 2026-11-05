import { t as core } from '@zumer/pulse';

// The fleet app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where a fleet has its own.
  connecting: 'Listening to the fleet…',
  things: 'Behind this reading',
  hostError: (message: string) => `The feed: ${message}`,
  noGroup: 'Not on a line',
  status: { 'signed-out': 'not connected', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · 84 trams, recorded',
  liveLabel: (modes: string[], n: number, rate: number) => `HSL Helsinki · ${n} ${modes.join(', ')} · ${rate} messages a minute`,

  // While nothing answers
  lead: 'A fleet as Pulse objects: the trams of Helsinki as they move, from HSL’s public feed. One object per dimension of the service, and one per vehicle on the other axis.',
  nothingYet: (why: string) => `The broker did not answer (${why}). The browser may be offline, or mqtt.hsl.fi blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'Eighty-four trams on eleven lines, recorded: ten of them late, a few crowded, two without a GPS fix.',

  // Readings
  gotIt: 'Got it',
  modes: { tram: 'trams', bus: 'buses', metro: 'metro trains', train: 'trains', ferry: 'ferries', ubus: 'U-buses', robot: 'robot buses' } as Record<string, string>,
  modeOne: { tram: 'Tram', bus: 'Bus', metro: 'Metro', train: 'Train', ferry: 'Ferry', ubus: 'U-bus', robot: 'Robot bus' } as Record<string, string>,
  onTime: 'On time',
  late: (mmss: string) => `${mmss} late`,
  early: (mmss: string) => `${mmss} early`,
  lateWhy: (name: string, to: string, mmss: string) => `${name} to ${to} is ${mmss} behind schedule`,
  earlyWhy: (name: string, to: string, mmss: string) => `${name} to ${to} is running ${mmss} ahead of schedule`,
  fleetLate: (late: number, n: number, what: string, worst: string) => `${late} of ${n} ${what} more than 3 minutes late: ${worst}`,
  crowdedWhy: (name: string, pct: number) => `${name} is ${pct}% full`,
  fleetCrowded: (n: number, names: string) => `${n} crowded: ${names}`,
  noFix: (name: string) => `${name} has no GPS fix`,
  fleetNoFix: (n: number, names: string) => `${n} without a GPS fix: ${names}`,
  // A vehicle's photo, from Wikimedia Commons, always with its credit.
  photoBy: (author: string, license: string) => license === 'public domain' ? `${author}, public domain` : `© ${author}${license ? `, ${license}` : ''}`,
  another: (model: string) => `another ${model}`,
  photoOfModel: (model: string) => `Another ${model}, not this one`,
  lookingForPhoto: 'looking for a photo on Commons…',
  noPhoto: 'no photo of it on Commons',
  onCommons: 'See the photo on Commons',
  compass: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
};
