// A MacBook that is not there: a snapshot with a few things calling, moving a
// little every few seconds and answering the collector's actions, so the app
// (and its tests) run without a collector. Same shape as the collector's.

import type { HistoryRow, Status } from '@zumer/pulse';
import type { Act, HostInfo, MachineSource, Snapshot, Thing, Things } from '../source.ts';
import { t } from '../strings.ts';

const H = 3_600_000;
const ago = (hours: number) => Date.now() - hours * H;

export const MACBOOK: Snapshot = {
  host: { name: 'martin-mbp', model: 'MacBookPro18,3', version: 'macOS 26.1', platform: 'darwin', arch: 'arm64' },
  at: Date.now(), interval: 3,
  things: {
    'host.uptime': { name: 'Uptime', state: 93.4, unit: 'h', attrs: { since: new Date(ago(93.4)).toISOString() }, changed: ago(0.01) },
    'cpu.load': { name: 'CPU', state: 23, unit: '%', attrs: { cores: 10, model: 'Apple M1 Pro', load1: 2.31, load5: 2.02, load15: 1.9 }, changed: ago(0.001) },
    'cpu.thermal': { name: 'Thermal headroom', state: 100, unit: '%', attrs: { scheduler_limit: 100 }, changed: ago(30) },
    'mem.used': { name: 'Memory', state: 71, unit: '%', attrs: { used_gb: 22.7, total_gb: 32, free_pct: 29 }, changed: ago(0.001) },
    'mem.pressure': { name: 'Memory pressure', state: 42, unit: '%', attrs: { free_pct: 58 }, changed: ago(0.001) },
    'mem.swap': { name: 'Swap', state: 1.3, unit: 'GB', attrs: { total_gb: 4 }, changed: ago(0.2) },
    'proc.top': { name: 'Busiest process', state: 'Google Chrome', unit: '', attrs: { count: 612, top: [
      { name: 'Google Chrome', cpu: 38.2, mem: 6.1 }, { name: 'node', cpu: 12.4, mem: 2.3 }, { name: 'WindowServer', cpu: 9.8, mem: 1.9 },
      { name: 'Code Helper', cpu: 6.1, mem: 3.4 }, { name: 'Docker', cpu: 3.2, mem: 4.8 }, { name: 'Spotify', cpu: 1.1, mem: 1.2 }] }, changed: ago(0.05) },
    'disk.root': { name: 'Macintosh HD', state: 93, unit: '%', attrs: { mount: '/', free_gb: 69.4, total_gb: 994.7 }, changed: ago(4) },
    'disk.backup': { name: 'Backup', state: 61, unit: '%', attrs: { mount: '/Volumes/Backup', free_gb: 780, total_gb: 2000 }, changed: ago(61) },
    'disk.media': { name: 'Media', state: 48, unit: '%', attrs: { mount: '/Volumes/Media', free_gb: 2080, total_gb: 4000 }, changed: ago(9) },
    'backup.timemachine': { name: 'Time Machine', state: 61, unit: 'h', attrs: { last: new Date(ago(61)).toISOString(), running: false, percent: null }, changed: ago(1) },
    'net.internet': { name: 'Internet', state: 14, unit: 'ms', attrs: { target: '1.1.1.1' }, changed: ago(0.001) },
    'net.wifi': { name: 'Wi‑Fi', state: -58, unit: 'dBm', attrs: { ssid: 'Casa', channel: '5GHz 44 (80MHz)', rate_mbps: 866, phy: '802.11ax', interface: 'en0' }, changed: ago(0.01) },
    'net.throughput': { name: 'Throughput', state: 6.4, unit: 'Mbit/s', attrs: { down_mbit: 5.9, up_mbit: 0.5 }, changed: ago(0.001) },
    'net.lan': { name: 'Devices on the network', state: 23, unit: '', attrs: { sample: ['192.168.1.1', '192.168.1.20', '192.168.1.31'] }, changed: ago(0.5) },
    'battery.level': { name: 'Battery', state: 84, unit: '%', attrs: { state: 'charging', remaining: '0:41', cycles: 312, health_pct: 89, temperature_c: 31 }, changed: ago(0.05) },
    'power.source': { name: 'Power', state: 'AC', unit: '', attrs: {}, changed: ago(1.2) },
    'docker.homeassistant': { name: 'homeassistant', state: 'running', unit: '', attrs: { image: 'ghcr.io/home-assistant/home-assistant:stable', status: 'Up 3 days', ports: '' }, changed: ago(93) },
    'docker.mosquitto': { name: 'mosquitto', state: 'running', unit: '', attrs: { image: 'eclipse-mosquitto:2', status: 'Up 3 days', ports: '0.0.0.0:1883->1883/tcp' }, changed: ago(93) },
    'docker.zigbee2mqtt': { name: 'zigbee2mqtt', state: 'exited', unit: '', attrs: { image: 'koenkk/zigbee2mqtt', status: 'Exited (1) 2 hours ago', ports: '' }, changed: ago(2) },
    'docker.uptime-kuma': { name: 'uptime-kuma', state: 'running', unit: '', attrs: { image: 'louislam/uptime-kuma:1', status: 'Up 3 days (healthy)', ports: '0.0.0.0:3001->3001/tcp' }, changed: ago(93) },
    'docker.grafana': { name: 'grafana', state: 'running', unit: '', attrs: { image: 'grafana/grafana', status: 'Up 2 days', ports: '0.0.0.0:3000->3000/tcp' }, changed: ago(50) },
    'service.postgresql_16': { name: 'postgresql@16', state: 'started', unit: '', attrs: { user: 'martin', exit_code: 0 }, changed: ago(93) },
    'service.redis': { name: 'redis', state: 'started', unit: '', attrs: { user: 'martin', exit_code: 0 }, changed: ago(93) },
    'update.os': { name: 'macOS updates', state: 1, unit: '', attrs: { titles: ['macOS Tahoe 26.1.1-25B78'] }, changed: ago(20) },
    'update.brew': { name: 'Homebrew', state: 7, unit: '', attrs: { formulae: ['node', 'git', 'ffmpeg', 'python@3.13', 'gh', 'ripgrep', 'jq'], casks: [] }, changed: ago(5) },
    'security.filevault': { name: 'FileVault', state: 'on', unit: '', attrs: {}, changed: ago(93) },
    'security.firewall': { name: 'Firewall', state: 'on', unit: '', attrs: {}, changed: ago(93) },
    'security.gatekeeper': { name: 'Gatekeeper', state: 'on', unit: '', attrs: {}, changed: ago(93) },
    'bt.magic_keyboard': { name: 'Magic Keyboard', state: 12, unit: '%', attrs: { connected: true, type: 'Keyboard' }, changed: ago(0.4) },
    'bt.magic_trackpad': { name: 'Magic Trackpad', state: 67, unit: '%', attrs: { connected: true, type: 'Trackpad' }, changed: ago(3) },
    'bt.airpods_pro': { name: 'AirPods Pro', state: 88, unit: '%', attrs: { connected: false, type: 'Headphones', left: 90, right: 86, case: 71 }, changed: ago(8) },
  },
};

const jitter = (v: number, step: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round((v + (Math.random() - 0.5) * 2 * step) * 10) / 10));

export class DemoSource implements MachineSource {
  readonly things: Things = new Map();
  host: HostInfo | null = null;
  status: Status = 'signed-out';
  error = '';
  private timer = 0;
  private listeners = new Set<(changed: Thing[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (changed: Thing[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    this.host = MACBOOK.host;
    this.things.clear();
    for (const [id, raw] of Object.entries(MACBOOK.things)) this.things.set(id, { id, ...raw, attrs: { ...raw.attrs } });
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.things.values()]));
    this.timer = window.setInterval(() => this.tick(), 3000);
  }
  stop() { clearInterval(this.timer); this.things.clear(); this.setStatus('signed-out'); }

  // The machine breathes: the numbers that move every few seconds move.
  private tick() {
    const now = Date.now(), changed: Thing[] = [];
    const move = (id: string, step: number, lo: number, hi: number) => {
      const th = this.things.get(id);
      if (!th || typeof th.state !== 'number') return;
      const next = { ...th, state: jitter(th.state, step, lo, hi), changed: now };
      this.things.set(id, next);
      changed.push(next);
    };
    move('cpu.load', 6, 4, 70); move('mem.used', 1, 60, 80); move('net.internet', 4, 6, 40); move('net.throughput', 2, 0.1, 40);
    const tm = this.things.get('backup.timemachine');
    if (tm?.state === 'running') {
      const pct = Math.min(100, (tm.attrs.percent as number) + 25);
      const next: Thing = pct >= 100 ? { ...tm, state: 0.1, attrs: { ...tm.attrs, running: false, percent: null, last: new Date().toISOString() }, changed: now }
        : { ...tm, attrs: { ...tm.attrs, percent: pct }, changed: tm.changed };
      this.things.set(tm.id, next);
      changed.push(next);
    }
    this.listeners.forEach((fn) => fn(changed));
  }

  // The collector's actions, answered a moment later like a real round trip.
  async act(a: Act) {
    await new Promise((r) => setTimeout(r, 400));
    const now = Date.now(), changed: Thing[] = [];
    if (a.kind === 'docker.start' || a.kind === 'docker.restart') {
      const th = this.things.get(a.ids[0]);
      if (th) { const next = { ...th, state: 'running', attrs: { ...th.attrs, status: 'Up 1 second' }, changed: now }; this.things.set(th.id, next); changed.push(next); }
    } else if (a.kind === 'backup.start') {
      const th = this.things.get('backup.timemachine');
      if (th) { const next = { ...th, state: 'running', attrs: { ...th.attrs, running: true, percent: 0 }, changed: now }; this.things.set(th.id, next); changed.push(next); }
    } else if (a.kind === 'service.restart') {
      const th = this.things.get(a.ids[0]);
      if (th) { const next = { ...th, state: 'started', attrs: { ...th.attrs, exit_code: 0 }, changed: now }; this.things.set(th.id, next); changed.push(next); }
    } else throw new Error(`unknown action ${a.kind}`);
    this.listeners.forEach((fn) => fn(changed));
  }

  // A day of each thing: numbers as a daily wave around the current value,
  // words as the moments they changed (what the collector would have kept).
  async history(ids: string[], hours: number) {
    const now = Date.now() / 1000, out: Record<string, HistoryRow[]> = {};
    for (const id of ids) {
      const th = this.things.get(id);
      if (!th) { out[id] = []; continue; }
      if (typeof th.state === 'number') {
        const rows: HistoryRow[] = [];
        // A swing around the current value, as a share of it: a busy day for the
        // CPU, a flat one for a disk; the wave ends near now.
        const rel = id === 'cpu.load' ? 0.6 : id === 'net.internet' || id === 'net.throughput' ? 0.4 : id.startsWith('disk.') ? 0.03 : id.startsWith('battery.') ? 0.12 : 0.25;
        for (let m = hours * 60; m >= 0; m -= 10) {
          const tt = now - m * 60, phase = (now - tt) / 3600;
          const v = th.state * (1 + rel * Math.sin(phase / 24 * Math.PI * 2) * (id === 'battery.level' ? -1 : 1)) + (Math.random() - 0.5) * th.state * rel * 0.3;
          rows.push({ s: String(Math.round(Math.max(0, v) * 10) / 10), lu: Math.round(tt) });
        }
        out[id] = rows;
      } else {
        const since = th.changed / 1000;
        const before = id === 'docker.zigbee2mqtt' ? 'running' : id.startsWith('docker.') ? 'exited' : th.state;
        out[id] = since > now - hours * 3600 ? [{ s: before, lu: Math.round(now - hours * 3600) }, { s: String(th.state), lu: Math.round(since) }] : [{ s: String(th.state), lu: Math.round(now - hours * 3600) }];
      }
    }
    return out;
  }
}
