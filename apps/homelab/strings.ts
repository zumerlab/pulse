import { t as core } from '@zumer/pulse';

// The homelab app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where a machine has its own.
  connecting: 'Reading the machine…',
  things: 'Behind this reading',
  hostError: (message: string) => `The collector: ${message}`,
  status: { 'signed-out': 'not connected', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  disconnect: 'Disconnect',
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · a MacBook',

  // Connecting
  connectLead: 'Your machine as one object per system. Start the collector on it, then connect.',
  collectorField: 'Collector address',
  collectorHint: 'Where the collector answers. On this machine: http://127.0.0.1:5180.',
  tokenField: 'Token (only if the collector was started with --token)',
  connect: 'Connect',
  howToStart: 'Start the collector',
  startCommand: 'node apps/homelab/collector/collector.mjs',
  startHint: 'From the Pulse checkout, on the machine to watch. It needs Node.js 22 or newer and nothing else.',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'A MacBook with a few things calling, right here, no collector needed.',
  errNoCollector: (url: string, why: string) => `No collector answered at ${url} (${why}).`,
  errUnauthorized: 'The collector refused the token.',
};
