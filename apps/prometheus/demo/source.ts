// Twenty-four hosts that are not there: five jobs of a small platform as
// Prometheus would answer the default configuration's queries, two targets
// down, a disk nearly full, a hot CPU, three alerts firing, the values
// breathing every few seconds and a silence taken in the browser. Same
// shape as the HTTP source.

import type { Status } from '@zumer/pulse';
import { type FleetConfig, NODE_EXPORTER } from '../config.ts';
import { type Act, type Alert, type PromSource, type Series, type Target, channelId, hostId } from '../source.ts';
import { t } from '../strings.ts';

const JOBS: [string, string, number][] = [['web', 'node', 8], ['api', 'node', 6], ['db', 'node', 3], ['cache', 'node', 2], ['worker', 'node', 5]];
const DOWN = new Set(['worker-04:9100', 'web-07:9100']);
const seeded = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };

// Every host's values for every channel of the default configuration.
function yard() {
  const series = new Map<string, Series>(), targets = new Map<string, Target>();
  const now = Date.now();
  let k = 0;
  for (const [job, , n] of JOBS) {
    for (let i = 1; i <= n; i++) {
      k++;
      const host = `${job}-${String(i).padStart(2, '0')}:9100`, r = seeded(k);
      const up = !DOWN.has(host);
      targets.set(host, { host, job, up, error: up ? '' : 'context deadline exceeded', at: now - (up ? 8000 : 400_000) });
      if (!up) continue;
      const put = (id: string, value: number) => { if (!series.has(id)) series.set(id, new Map()); series.get(id)!.set(host, { value, at: now }); };
      const hot = host === 'api-03:9100', fullDisk = host === 'web-05:9100', tightMem = host === 'db-02:9100';
      put(channelId('cpu', 'usage'), hot ? 0.97 : 0.1 + r * 0.5);
      put(channelId('cpu', 'load'), hot ? 1.6 : 0.1 + r * 0.6);
      put(channelId('cpu', 'steal'), job === 'worker' ? 0.02 + r * 0.03 : 0);
      put(channelId('memory', 'used'), tightMem ? 0.93 : 0.3 + seeded(k * 3) * 0.4);
      put(channelId('memory', 'swap'), tightMem ? 0.61 : seeded(k * 5) * 0.1);
      put(channelId('disk', 'root'), fullDisk ? 0.96 : 0.2 + seeded(k * 7) * 0.5);
      put(channelId('disk', 'io'), job === 'db' ? 0.3 + r * 0.4 : r * 0.1);
      put(channelId('network', 'rx'), (job === 'web' ? 20e6 : job === 'db' ? 8e6 : 2e6) * (0.5 + r));
      put(channelId('network', 'tx'), (job === 'web' ? 60e6 : job === 'db' ? 5e6 : 1e6) * (0.5 + seeded(k * 11)));
      put(channelId('network', 'errors'), host === 'cache-02:9100' ? 0.4 : 0);
    }
  }
  const alerts: Alert[] = [
    { id: 'HighCPU@api-03:9100', name: 'HighCPU', host: 'api-03:9100', severity: 'warning', summary: 'api-03 has had the CPU over 90% for 15 minutes', since: now - 38 * 60_000, silenced: false, labels: { alertname: 'HighCPU', instance: 'api-03:9100', severity: 'warning' } },
    { id: 'DiskAlmostFull@web-05:9100', name: 'DiskAlmostFull', host: 'web-05:9100', severity: 'critical', summary: 'The root filesystem of web-05 is 96% full', since: now - 2 * 3_600_000, silenced: false, labels: { alertname: 'DiskAlmostFull', instance: 'web-05:9100', severity: 'critical' } },
    { id: 'TargetDown@worker-04:9100', name: 'TargetDown', host: 'worker-04:9100', severity: 'critical', summary: 'worker-04 has not been scraped for 5 minutes', since: now - 6 * 60_000, silenced: false, labels: { alertname: 'TargetDown', instance: 'worker-04:9100', severity: 'critical' } },
    { id: 'TargetDown@web-07:9100', name: 'TargetDown', host: 'web-07:9100', severity: 'critical', summary: 'web-07 has not been scraped for 5 minutes', since: now - 40 * 60_000, silenced: true, labels: { alertname: 'TargetDown', instance: 'web-07:9100', severity: 'critical' } },
  ];
  return { series, targets, alerts };
}

export class DemoSource implements PromSource {
  readonly config: FleetConfig = NODE_EXPORTER;
  readonly series = new Map<string, Series>();
  readonly targets = new Map<string, Target>();
  alerts: Alert[] = [];
  readonly canSilence = true;
  status: Status = 'signed-out';
  error = '';
  private timer = 0;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    const y = yard();
    this.series.clear(); this.targets.clear();
    for (const [k, v] of y.series) this.series.set(k, v);
    for (const [k, v] of y.targets) this.targets.set(k, v);
    this.alerts = y.alerts;
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.targets.keys()].map(hostId).concat('alerts')));
    this.timer = window.setInterval(() => this.tick(), 5000);
  }
  stop() { clearInterval(this.timer); this.series.clear(); this.targets.clear(); this.alerts = []; this.setStatus('signed-out'); }

  // The platform breathes: CPU, load and the network move; what calls stays where it is.
  private tick() {
    const now = Date.now(), changed = new Set<string>();
    for (const [id, m] of this.series) {
      const rel = id.startsWith('cpu/') ? 0.08 : id.startsWith('network/') ? 0.15 : 0;
      if (!rel) continue;
      for (const [host, s] of m) {
        if (host === 'api-03:9100') continue;
        const next = Math.max(0, s.value * (1 + (Math.random() - 0.5) * rel));
        m.set(host, { value: id.endsWith('usage') ? Math.min(0.75, next) : next, at: now });
        changed.add(hostId(host));
      }
    }
    this.listeners.forEach((fn) => fn([...changed]));
  }

  // A silence, taken a moment later like Alertmanager would.
  async act(a: Act) {
    await new Promise((r) => setTimeout(r, 400));
    if (a.kind !== 'silence') throw new Error('unknown action');
    const alert = this.alerts.find((x) => x.id === a.alert);
    if (!alert) throw new Error('that alert is gone');
    alert.silenced = true;
    this.listeners.forEach((fn) => fn(['alerts', hostId(alert.host)]));
  }

  // A day of a channel for a host: a wave around the value.
  async history(key: string, host: string, hours: number) {
    const v = this.series.get(key)?.get(host)?.value ?? 0;
    const rel = key.startsWith('cpu/') ? 0.5 : key.startsWith('network/') ? 0.6 : 0.05;
    return Array.from({ length: hours }, (_, i) => Math.max(0, v * (1 + rel * Math.sin((i - hours) / 24 * Math.PI * 2 + 1)) + (Math.random() - 0.5) * v * rel * 0.2));
  }
}
