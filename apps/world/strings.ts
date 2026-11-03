import { t as core } from '@zumer/pulse';

// The world app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where the world has its own.
  connecting: 'Reading the feeds…',
  things: 'Behind this reading',
  hostError: (message: string) => `The feeds: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'reading', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · a stormy day',
  liveLabel: (place: string, services: number) => `The sky over ${place} · ${services} services`,
  here: 'here',
  useLocation: 'Use my location',

  // While nothing answers
  lead: 'The world outside as four objects: the sun, the earth, the sky over you and the services you depend on. Public feeds, no server, no sign-in.',
  nothingYet: (feeds: string[]) => `None of the feeds answered yet: ${feeds.join(', ')}. The browser may be offline, or the feeds blocked here.`,
  retry: 'Try again',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A recorded day with a geomagnetic storm, a big earthquake, rain on the way and a service down.',

  // Readings
  gotIt: 'Got it',
  openIncident: 'Open the incident',
  quiet: 'quiet',
  gScale: ['quiet', 'G1 minor storm', 'G2 moderate storm', 'G3 strong storm', 'G4 severe storm', 'G5 extreme storm'],
  gWhy: ['', 'A minor geomagnetic storm: aurora at high latitudes, weak power grid fluctuations', 'A moderate geomagnetic storm: aurora down to mid latitudes, voltage alarms on long power lines',
    'A strong geomagnetic storm: aurora at mid latitudes, satellite drag, GPS errors', 'A severe geomagnetic storm: aurora far south, grid voltage control problems, satellite charging',
    'An extreme geomagnetic storm: grid collapse possible, aurora near the equator'],
  rScale: ['quiet', 'R1 minor blackout', 'R2 moderate blackout', 'R3 strong blackout', 'R4 severe blackout', 'R5 extreme blackout'],
  rWhy: ['', 'An M-class flare: weak HF radio fade on the sunlit side', 'An M5+ flare: limited HF radio blackout on the sunlit side', 'An X-class flare: wide HF radio blackout and GPS degradation on the sunlit side',
    'An X10+ flare: HF radio blackout for hours, navigation errors', 'An X20+ flare: complete HF blackout on the sunlit side'],
  sScale: ['quiet', 'S1 minor', 'S2 moderate', 'S3 strong', 'S4 severe', 'S5 extreme'],
  sWhy: ['', 'A minor radiation storm: slight effects on polar HF radio', 'A moderate radiation storm: passengers on high-latitude flights get a higher dose', 'A strong radiation storm: satellite errors, polar flights rerouted',
    'A severe radiation storm: unavoidable dose on polar flights, satellite memory damage', 'An extreme radiation storm: satellites may be lost, polar routes closed'],
  fastWind: (speed: number) => `Fast solar wind at ${speed} km/s`,
  bzSouth: (bz: number) => `The interplanetary field points south (Bz ${bz} nT): energy flows into the magnetosphere`,
  quakeWhy: (mag: string, place: string, ago: string) => `M ${mag} ${place}, ${ago}`,
  nearQuake: (mag: string, km: number, place: string) => `M ${mag} ${km} km from you: ${place}`,
  freezing: (t: string) => `${t}° outside: freezing`,
  heat: (t: string) => `${t}° outside: extreme heat`,
  gusts: (g: string) => `Gusts of ${g} km/h`,
  rainComing: (p: number, mm: string) => `${p}% chance of rain in the next 6 hours, ${mm} mm`,
  uvHigh: (uv: string) => `UV index ${uv}: very high, cover up`,
  airPoor: (aqi: number, text: string) => `Air quality ${text} (AQI ${aqi})`,
  compass: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  uvLevel: (uv: number) => uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : uv < 11 ? 'very high' : 'extreme',
  aqiLevel: (aqi: number) => aqi < 20 ? 'good' : aqi < 40 ? 'fair' : aqi < 60 ? 'moderate' : aqi < 80 ? 'poor' : aqi < 100 ? 'very poor' : 'extremely poor',
  indicator: { none: 'Operational', minor: 'Degraded', major: 'Partial outage', critical: 'Major outage', maintenance: 'Maintenance' } as Record<string, string>,
  componentStatus: { operational: 'operational', degraded_performance: 'degraded', partial_outage: 'partial outage', major_outage: 'major outage', under_maintenance: 'maintenance' } as Record<string, string>,
};
