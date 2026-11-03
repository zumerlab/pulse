// What the UI needs from Prometheus, and the implementation over its HTTP
// API (and Alertmanager's): every channel's PromQL asked on one clock, the
// targets, the alerts; a silence posted back. Prometheus allows any origin
// by default, so the browser asks it directly. The object (@zumer/pulse)
// never sees this: `model.ts` turns the samples into readings and `host.ts`
// wraps it as the board's host.

import type { Action, Status } from '@zumer/pulse';
import { type ChannelConfig, type FleetConfig, NODE_EXPORTER } from './config.ts';
import { t } from './strings.ts';

// One value per host for a channel, as the last query left it.
export type Sample = { value: number; at: number };
export type Series = Map<string, Sample>;                 // host → sample
export type Target = { host: string; job: string; up: boolean; error: string; at: number };
// An alert as Alertmanager (or Prometheus) reports it; `silenced` when Alertmanager says so.
export type Alert = { id: string; name: string; host: string; severity: string; summary: string; since: number; silenced: boolean; labels: Record<string, string> };
// An action for the source: silence an alert for a while (Alertmanager).
export type Act = Action & { kind: 'silence'; alert: string; hours: number };

export interface PromSource {
  readonly config: FleetConfig;
  readonly series: Map<string, Series>;                   // "system/channel" → host → sample
  readonly targets: Map<string, Target>;                  // host → target
  readonly alerts: Alert[];
  readonly canSilence: boolean;
  readonly status: Status;
  readonly error: string;
  readonly label: string;
  onChange(fn: (ids: string[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  act(a: Act): Promise<unknown>;
  // A channel's last `hours` hours for a host, one value an hour, oldest first.
  history(key: string, host: string, hours: number): Promise<(number | null)[]>;
  start(): void;
  stop(): void;
}

const SERVER = 'pulse-prometheus-server', AM = 'pulse-prometheus-alertmanager';
export const DEFAULT_SERVER = 'https://prometheus.demo.prometheus.io';
export const lastServer = () => { try { return localStorage.getItem(SERVER) ?? DEFAULT_SERVER; } catch { return DEFAULT_SERVER; } };
export const lastAlertmanager = () => { try { return localStorage.getItem(AM) ?? ''; } catch { return ''; } };
export const remember = (server: string, am: string) => { try { localStorage.setItem(SERVER, server); if (am) localStorage.setItem(AM, am); else localStorage.removeItem(AM); } catch { /* only to remember */ } };

type Vector = { status: string; data?: { resultType: string; result: { metric: Record<string, string>; value: [number, string] }[] }; error?: string };
type Matrix = { status: string; data?: { result: { metric: Record<string, string>; values: [number, string][] }[] } };
type Targets = { status: string; data?: { activeTargets: { labels: Record<string, string>; health: string; lastError: string; lastScrape: string }[] } };
type PromAlerts = { status: string; data?: { alerts: { labels: Record<string, string>; annotations: Record<string, string>; state: string; activeAt: string }[] } };
type AmAlert = { labels: Record<string, string>; annotations: Record<string, string>; startsAt: string; fingerprint: string; status: { state: string; silencedBy: string[] } };

export const channelId = (sys: string, ch: string) => `${sys}/${ch}`;
export const hostId = (host: string) => `host:${host}`;
export const alertOf = (labels: Record<string, string>, annotations: Record<string, string>, since: string, silenced: boolean, id?: string): Alert => ({
  id: id ?? `${labels.alertname}@${labels.instance ?? ''}`, name: labels.alertname ?? 'alert', host: labels.instance ?? '', severity: labels.severity ?? '',
  summary: annotations.summary ?? annotations.description ?? annotations.message ?? '', since: Date.parse(since) || Date.now(), silenced, labels,
});

// Prometheus over HTTP: every channel's query, the targets and the alerts on
// the configuration's clock; Alertmanager's alerts instead when it is named,
// and its silences as the action.
export class HttpSource implements PromSource {
  readonly series = new Map<string, Series>();
  readonly targets = new Map<string, Target>();
  alerts: Alert[] = [];
  status: Status = 'signed-out';
  error = '';
  private timer = 0;
  private stopped = true;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();
  readonly url: string;
  readonly alertmanager: string;
  readonly config: FleetConfig;

  constructor(url: string, alertmanager = '', config: FleetConfig = NODE_EXPORTER) { this.url = url.replace(/\/+$/, ''); this.alertmanager = alertmanager.replace(/\/+$/, ''); this.config = config; }

  get label() { return t.liveLabel(this.url.replace(/^https?:\/\//, ''), this.targets.size); }
  get canSilence() { return !!this.alertmanager; }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status, error = '') {
    if (status === this.status && error === this.error) return;
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }

  start() {
    this.stop();
    this.stopped = false;
    this.setStatus('connecting');
    void this.poll();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  private async get<T>(base: string, path: string, params: Record<string, string>): Promise<T> {
    const q = new URLSearchParams(params);
    const res = await fetch(`${base}${path}?${q}`, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = await res.json() as T & { status?: string; error?: string };
    if (body.status && body.status !== 'success') throw new Error(body.error ?? body.status);
    return body;
  }

  private channels() { return this.config.systems.flatMap((sys) => sys.channels.map((ch) => ({ id: channelId(sys.id, ch.key), ch }))); }

  // Everything at once; what changed goes to the listeners. Nothing yet and
  // nothing answering is an error the shell shows; something shown, a lapse.
  private async poll() {
    const changed = new Set<string>(), now = Date.now();
    let answered = false, why = '';
    const results = await Promise.allSettled([
      ...this.channels().map(async ({ id, ch }) => {
        const v = await this.get<Vector>(this.url, '/api/v1/query', { query: ch.query });
        const series: Series = new Map();
        for (const r of v.data?.result ?? []) {
          const host = r.metric[ch.by ?? 'instance'] ?? Object.values(r.metric)[0] ?? '';
          const value = Number(r.value[1]);
          if (host && Number.isFinite(value)) series.set(host, { value, at: r.value[0] * 1000 });
        }
        const was = this.series.get(id);
        for (const [host, s] of series) if (was?.get(host)?.value !== s.value) changed.add(hostId(host));
        for (const host of was?.keys() ?? []) if (!series.has(host)) changed.add(hostId(host));
        this.series.set(id, series);
        answered = true;
      }),
      (async () => {
        const tg = await this.get<Targets>(this.url, '/api/v1/targets', { state: 'active' });
        const seen = new Set<string>();
        for (const x of tg.data?.activeTargets ?? []) {
          const host = x.labels.instance ?? '', up = x.health === 'up';
          if (!host) continue;
          seen.add(host);
          const was = this.targets.get(host);
          if (!was || was.up !== up) changed.add(hostId(host));
          this.targets.set(host, { host, job: x.labels.job ?? '', up, error: x.lastError ?? '', at: Date.parse(x.lastScrape) || now });
        }
        for (const host of [...this.targets.keys()]) if (!seen.has(host)) { this.targets.delete(host); changed.add(hostId(host)); }
        answered = true;
      })(),
      (async () => {
        const next: Alert[] = this.alertmanager
          ? ((await (await fetch(`${this.alertmanager}/api/v2/alerts?active=true`, { signal: AbortSignal.timeout(15_000) })).json()) as AmAlert[])
            .map((a) => alertOf(a.labels, a.annotations, a.startsAt, a.status.state === 'suppressed' || a.status.silencedBy.length > 0, a.fingerprint))
          : ((await this.get<PromAlerts>(this.url, '/api/v1/alerts', {})).data?.alerts ?? []).filter((a) => a.state === 'firing').map((a) => alertOf(a.labels, a.annotations, a.activeAt, false));
        const before = JSON.stringify(this.alerts.map((a) => [a.id, a.silenced]));
        this.alerts = next.sort((a, b) => a.since - b.since);
        if (before !== JSON.stringify(this.alerts.map((a) => [a.id, a.silenced]))) { changed.add('alerts'); for (const a of next) if (a.host) changed.add(hostId(a.host)); }
      })(),
    ]);
    for (const r of results) if (r.status === 'rejected') why = r.reason instanceof Error ? r.reason.message : String(r.reason);
    if (this.stopped) return;
    if (answered) this.setStatus('live');
    else if (this.series.size || this.targets.size) this.setStatus('offline');
    else this.setStatus('error', t.errNoServer(this.url, why || 'no answer'));
    if (changed.size) this.listeners.forEach((fn) => fn([...changed]));
    this.timer = window.setTimeout(() => void this.poll(), Math.max(5, this.config.every ?? 15) * 1000);
  }

  // A silence on Alertmanager: the alert's name and instance, for `hours`.
  async act(a: Act) {
    if (a.kind !== 'silence') throw new Error(`unknown action ${String((a as { kind: string }).kind)}`);
    if (!this.alertmanager) throw new Error('no Alertmanager to silence on');
    const alert = this.alerts.find((x) => x.id === a.alert);
    if (!alert) throw new Error('that alert is gone');
    const matchers = [{ name: 'alertname', value: alert.name, isRegex: false, isEqual: true }, ...(alert.host ? [{ name: 'instance', value: alert.host, isRegex: false, isEqual: true }] : [])];
    const now = new Date(), end = new Date(now.getTime() + a.hours * 3_600_000);
    const res = await fetch(`${this.alertmanager}/api/v2/silences`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchers, startsAt: now.toISOString(), endsAt: end.toISOString(), createdBy: 'pulse', comment: `Silenced from Pulse for ${a.hours} h` }) });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
    // Alertmanager marks it suppressed on its next evaluation; ask again soon.
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.poll(), 1500);
  }

  // A channel's day for a host: query_range, one point an hour.
  async history(key: string, host: string, hours: number) {
    const ch = this.channels().find((c) => c.id === key)?.ch;
    if (!ch) return [];
    const end = Math.floor(Date.now() / 1000), start = end - hours * 3600;
    const label = ch.by ?? 'instance';
    const m = await this.get<Matrix>(this.url, '/api/v1/query_range', { query: ch.query, start: String(start), end: String(end), step: '3600' });
    const row = (m.data?.result ?? []).find((r) => r.metric[label] === host);
    const out: (number | null)[] = Array.from({ length: hours }, () => null);
    for (const [ts, v] of row?.values ?? []) { const i = Math.floor((ts - start) / 3600); if (i >= 0 && i < hours) out[i] = Number(v); }
    return out;
  }
}

// A JSON at a URL as the configuration, or the default.
export async function loadConfig(url: string | null): Promise<FleetConfig> {
  if (!url) return NODE_EXPORTER;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const cfg = await res.json() as FleetConfig;
  if (!Array.isArray(cfg.systems)) throw new Error('no systems');
  return cfg;
}
export type { ChannelConfig };
