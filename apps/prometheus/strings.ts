import { t as core } from '@zumer/pulse';

// The Prometheus app's own strings, on top of the object's.
export const t = {
  ...core,
  // The board's words, where a fleet of hosts has its own.
  connecting: 'Querying Prometheus…',
  things: 'Behind this reading',
  hostError: (message: string) => `Prometheus: ${message}`,
  noGroup: 'No job',
  status: { 'signed-out': 'not connected', connecting: 'connecting', live: 'live', offline: 'offline, retrying', error: 'error' } as Record<string, string>,
  disconnect: 'Disconnect',
  leaveDemo: 'Leave the demo',
  demoLabel: 'Demo · 24 hosts, recorded',
  liveLabel: (server: string, hosts: number) => `${server} · ${hosts} hosts`,

  // Connecting
  connectLead: 'Your hosts as Pulse objects, read from Prometheus with PromQL: the fleet by dimension (targets, CPU, memory, disk, network, alerts), and one object per host.',
  serverField: 'Prometheus',
  serverHint: 'The server’s address: http://localhost:9090, or Prometheus’s public demo. It must allow the page’s origin (it does by default).',
  alertmanagerField: 'Alertmanager (optional)',
  alertmanagerHint: 'With it, the alerts come from Alertmanager and can be silenced for an hour from the ring. Without it, Prometheus’s own alerts, read only.',
  connect: 'Connect',
  exploreDemo: 'Explore the demo instead',
  demoHint: 'Twenty-four hosts that are not there: two targets down, a disk nearly full, a hot CPU, three alerts firing.',
  errNoServer: (url: string, why: string) => `Prometheus did not answer at ${url} (${why}).`,
  errConfig: (url: string, why: string) => `The configuration at ${url} could not be read (${why}).`,

  // Readings
  gotIt: 'Got it',
  silence: 'Silence for an hour',
  targetsDown: (n: number, names: string) => `${n} ${n === 1 ? 'target is' : 'targets are'} down: ${names}`,
  overWhy: (n: number, what: string, names: string) => `${n} ${n === 1 ? 'host' : 'hosts'} with ${what}: ${names}`,
  hostWhy: (host: string, what: string, value: string) => `${host}: ${what} at ${value}`,
  alertsWhy: (n: number, names: string) => `${n} ${n === 1 ? 'alert' : 'alerts'} firing: ${names}`,
  severity: { critical: 2, error: 2, page: 2, warning: 1, warn: 1, info: 0, none: 0 } as Record<string, 0 | 1 | 2>,
};
