import { t as core } from '@zumer/pulse';

// The ISS app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where the station has its own.
  connecting: 'Listening to the station…',
  things: 'Behind this reading',
  noGroup: 'Elsewhere',
  hostError: (message: string) => `The feeds: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'listening', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  useLocation: 'Use my location',
  here: 'here',
  demoLabel: 'Demo · a recorded pass',
  liveLabel: (aboard: number | null, aos: boolean | null) => `ISS${aboard ? ` · ${aboard} aboard` : ''}${aos == null ? '' : aos ? ' · signal' : ' · loss of signal'}`,

  // While nothing answers
  lead: 'The International Space Station as Pulse objects: its air, water, power, attitude and links from NASA’s public telemetry, where it is and who is aboard, and the launches coming up. Read from the browser.',
  nothingYet: (why: string) => `None of the feeds answered (${why}). The browser may be offline, or the feeds blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A recorded pass over Asia at night: the CO₂ creeping up in Node 3, the gyroscopes near saturation, a wing without voltage, a Falcon 9 within the hour.',

  // Readings
  gotIt: 'Got it',
  watch: 'Watch it',
  watchStation: 'Watch the station live',
  watchLaunch: (live: boolean) => (live ? 'Watch it live' : 'Watch the webcast'),
  asOf: (ago: string) => `as of ${ago} ago`,
  ago: (ms: number) => {
    const m = Math.round(ms / 60_000);
    if (m < 1) return 'moments';
    if (m < 60) return `${m} min`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
  },
  // To the second only in the last ten minutes, and never in a row: a list does not change under a finger every second.
  countdown: (ms: number, coarse = false) => {
    const s = Math.round(Math.abs(ms) / 1000), d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60);
    const sign = ms >= 0 ? 'T−' : 'T+';
    if (d >= 1) return `${sign}${d} d ${h} h`;
    if (h >= 1) return `${sign}${h} h ${String(m).padStart(2, '0')} min`;
    return coarse || Math.abs(ms) >= 600_000 ? `${sign}${m} min` : `${sign}${m}:${String(s % 60).padStart(2, '0')}`;
  },
  pressureWhy: (p: string, drop: string) => `Cabin pressure at ${p}${drop ? `, down ${drop} in ten minutes` : ''}`,
  co2Why: (where: string, v: string) => `${where} CO₂ at ${v}, above the crew’s comfort`,
  o2Why: (where: string, v: string) => `${where} O₂ at ${v}`,
  tempWhy: (v: string) => `Cabin at ${v}`,
  tankWhy: (tank: string, v: string, what: string) => `${tank} at ${v}, ${what}`,
  cmgWhy: (v: string) => `CMG momentum at ${v}: the thrusters will have to desaturate the gyroscopes`,
  gyrosWhy: (n: number) => `${n} of 4 control moment gyroscopes in use`,
  attitudeWhy: (what: string) => `Attitude: ${what}`,
  modeWhy: (mode: string) => `The station is in ${mode} mode`,
  wingWhy: (wings: string) => `${wings} without voltage while the others have it`,
  losWhy: (ago: string) => `No signal from the station for ${ago}`,
  launchWhy: (name: string, when: string, where: string) => `${name} ${when} from ${where}`,
  walkWhy: (name: string, ago: string) => `${name}, under way for ${ago}`,
};
