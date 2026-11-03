import { t as core } from '@zumer/pulse';

// The drones app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where a swarm has its own.
  connecting: 'Listening to the swarm…',
  things: 'Behind this reading',
  hostError: (message: string) => `mavlink2rest: ${message}`,
  noGroup: 'No type',
  status: { 'signed-out': 'not connected', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  disconnect: 'Disconnect',
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · six copters, recorded',
  liveLabel: (server: string, n: number) => `${server} · ${n} ${n === 1 ? 'vehicle' : 'vehicles'}`,

  // Connecting
  connectLead: 'A swarm of drones as Pulse objects: ArduPilot vehicles, the simulator’s or the real ones, through mavlink2rest. The swarm around home, and each drone as an object with arm, takeoff, mode and return as its actions.',
  serverField: 'mavlink2rest',
  serverHint: 'Where mavlink2rest answers: http://127.0.0.1:8088 beside the simulator, or the companion computer’s address.',
  connect: 'Connect',
  howToStart: 'Start a simulated swarm',
  startCommand: 'sim_vehicle.py -v ArduCopter --count 4 --auto-sysid --out udp:127.0.0.1:14550\nmavlink2rest --connect udpin:127.0.0.1:14550 --server 127.0.0.1:8088',
  startHint: 'ArduPilot’s SITL with four copters sharing one MAVLink stream, and mavlink2rest serving it over HTTP and WebSocket.',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'Six copters on a survey around home, one running out of battery, one with a poor fix, one on the ground.',
  errNoServer: (url: string, why: string) => `mavlink2rest did not answer at ${url} (${why}).`,

  // Readings
  gotIt: 'Got it',
  bringHome: 'Bring it home',
  bringAllHome: 'Bring them home',
  land: 'Land it',
  modes: { STABILIZE: 'Stabilize', ALT_HOLD: 'Alt hold', AUTO: 'Auto', GUIDED: 'Guided', LOITER: 'Loiter', RTL: 'Return', LAND: 'Land', POSHOLD: 'Pos hold', SMART_RTL: 'Smart return', BRAKE: 'Brake' } as Record<string, string>,
  batteryWhy: (name: string, pct: number) => `${name} is at ${pct}% battery`,
  swarmBattery: (n: number, names: string) => `${n} ${n === 1 ? 'drone is' : 'drones are'} under 20% battery: ${names}`,
  lostWhy: (name: string, s: number) => `${name} has not been heard from for ${s} s`,
  swarmLost: (n: number, names: string) => `${n} ${n === 1 ? 'drone' : 'drones'} out of contact: ${names}`,
  fixWhy: (name: string, sats: number) => `${name} has no 3D fix (${sats} satellites)`,
  swarmFix: (n: number, names: string) => `${n} without a 3D fix: ${names}`,
  farWhy: (name: string, m: number) => `${name} is ${m} m from home`,
  compass: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
};
