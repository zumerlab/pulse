import { listOf, num, type Alert, type Reading, type Seg, type TrackSpec } from '@zumer/pulse';
import type { Act, Things, Thing } from './source.ts';

// Every channel is read from the things the collector reports: there are no
// hand-written states. An alert comes out of a rule over the data and its
// action is one the collector accepts. If the thing is missing (no battery,
// no Docker), the channel does not appear: another machine builds its own object.

export type Channel = { key: string; name: string; glyph: string; read: (s: Things) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  chip: 'M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3 M6 6h12v12H6z M9 9h6v6H9z',
  memory: 'M3 8h18v8H3z M7 8v8 M11 8v8 M15 8v8 M6 16v2 M10 16v2 M14 16v2 M18 16v2',
  swap: 'M7 7h10l-3-3 M17 7l-3 3 M17 17H7l3 3 M7 17l3-3',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  disk: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 3v4 M12 17v4',
  drive: 'M4 6h16v12H4z M4 14h16 M8 17h.01 M16 17h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 3',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  wifi: 'M2 9a15 15 0 0 1 20 0 M5 13a10 10 0 0 1 14 0 M8.5 16.5a5 5 0 0 1 7 0 M12 20h.01',
  arrows: 'M7 4v16 M7 20l-3-3 M7 20l3-3 M17 20V4 M17 4l-3 3 M17 4l3 3',
  devices: 'M4 5h10v8H4z M9 13v3 M6 16h6 M16 9h4v10h-4z M18 17h.01',
  battery: 'M3 8h15v8H3z M18 10h2v4h-2z M6 11v2',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  box: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4l1.4-1.4 M17 7l1.4-1.4',
  download: 'M12 3v12 M12 15l-4-4 M12 15l4-4 M4 17v3h16v-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  bluetooth: 'M7 7l10 10-5 4V3l5 4L7 17',
};

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const n = (x: unknown) => (typeof x === 'number' ? x : Number(x));
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const attr = <T = unknown>(th: Thing, k: string) => th.attrs[k] as T | undefined;
const ofPrefix = (s: Things, prefix: string) => [...s.values()].filter((th) => th.id.startsWith(prefix)).sort((a, b) => a.name.localeCompare(b.name));
const act = (kind: string, id: string, name?: string): Act => ({ ids: [id], kind, ...(name ? { name } : {}) });
const list = (names: string[]) => listOf(names);
const gb = (v: unknown) => `${num(n(v), 1)} GB`;
const got = (level: 1 | 2, big: string, label: string, why: string): Alert => ({ level, big, label, why, verb: 'Got it', acts: [] });

const SYSTEMS: System[] = [
  { id: 'compute', title: 'Compute', channels: [
    { key: 'load', name: 'CPU', glyph: g.chip, read: (s) => {
      const th = s.get('cpu.load');
      if (!th || !isNum(th.state)) return null;
      const load = th.state, top = s.get('proc.top');
      const cores = attr<number>(th, 'cores');
      return { kind: 'p', v: clamp(load / 100), ids: ['cpu.load'], big: `${num(load, 0)}%`, history: 'cpu.load',
        label: `${cores ? `${cores} cores · ` : ''}load ${num(attr<number>(th, 'load1') ?? 0, 2)}`,
        alert: load >= 90 ? got(1, `${num(load, 0)}%`, 'CPU', `CPU at ${num(load, 0)}%${top ? ` · ${String(top.state)} is the busiest` : ''}`) : undefined };
    } },
    { key: 'memory', name: 'Memory', glyph: g.memory, read: (s) => {
      const th = s.get('mem.used');
      if (!th || !isNum(th.state)) return null;
      const pressure = s.get('mem.pressure'), free = attr<number>(th, 'free_pct') ?? 100 - th.state;
      const tight = (pressure && isNum(pressure.state) && pressure.state >= 90) || free < 8;
      return { kind: 'p', v: clamp(th.state / 100), ids: pressure ? ['mem.used', 'mem.pressure'] : ['mem.used'], big: `${num(th.state, 0)}%`, history: 'mem.used',
        label: `${gb(attr(th, 'used_gb'))} of ${gb(attr(th, 'total_gb'))}`,
        alert: tight ? got(1, `${num(free, 0)}% free`, 'memory', `Memory is tight: ${num(free, 0)}% free`) : undefined };
    } },
    { key: 'swap', name: 'Swap', glyph: g.swap, read: (s) => {
      const th = s.get('mem.swap');
      if (!th || !isNum(th.state)) return null;
      const total = attr<number>(th, 'total_gb') ?? 0;
      return { kind: 'p', v: clamp(total ? th.state / total : th.state / 8), ids: ['mem.swap'], big: th.state ? gb(th.state) : 'None', history: 'mem.swap',
        label: total ? `of ${gb(total)} swap` : 'swap in use' };
    } },
    { key: 'thermal', name: 'Thermal', glyph: g.thermo, read: (s) => {
      const headroom = s.get('cpu.thermal'), temp = s.get('cpu.temperature');
      if (temp && isNum(temp.state)) {
        return { kind: 'p', v: clamp(temp.state / 100), ids: headroom ? ['cpu.temperature', 'cpu.thermal'] : ['cpu.temperature'], big: `${num(temp.state, 0)}°C`, history: 'cpu.temperature',
          label: headroom && isNum(headroom.state) && headroom.state < 100 ? `CPU slowed to ${headroom.state}%` : 'CPU temperature',
          alert: temp.state >= 95 ? got(2, `${num(temp.state, 0)}°C`, 'too hot', `CPU at ${num(temp.state, 0)}°C`)
            : temp.state >= 85 || (headroom && isNum(headroom.state) && headroom.state < 70) ? got(1, `${num(temp.state, 0)}°C`, 'hot', `CPU at ${num(temp.state, 0)}°C${headroom && isNum(headroom.state) && headroom.state < 100 ? `, slowed to ${headroom.state}%` : ''}`) : undefined };
      }
      if (!headroom || !isNum(headroom.state)) return null;
      const speed = headroom.state;
      return { kind: 'p', v: clamp(speed / 100), ids: ['cpu.thermal'], big: speed < 100 ? `${speed}%` : 'Cool', history: 'cpu.thermal',
        label: speed < 100 ? 'of the CPU speed allowed' : 'no thermal limit',
        alert: speed < 70 ? got(1, `${speed}%`, 'throttling', `The CPU is slowed to ${speed}% by heat`) : undefined };
    } },
    { key: 'processes', name: 'Processes', glyph: g.list, read: (s) => {
      const th = s.get('proc.top');
      if (!th) return null;
      const top = (attr<{ name: string; cpu: number; mem: number }[]>(th, 'top') ?? []).slice(0, 6);
      if (!top.length) return null;
      const segs: Seg[] = top.map((p, i) => ({ label: `${p.name} ${num(p.cpu, 0)}%`, on: p.cpu >= 5, id: `proc.top#${i}` }));
      return { kind: 's', segs, ids: ['proc.top'], big: top[0].name, label: `${num(top[0].cpu, 0)}% CPU · ${attr<number>(th, 'count') ?? '?'} processes` };
    } },
  ] },

  { id: 'storage', title: 'Storage', channels: [
    { key: 'volumes', name: 'Volumes', glyph: g.disk, read: (s) => {
      const disks = ofPrefix(s, 'disk.').filter((d) => isNum(d.state));
      if (!disks.length) return null;
      const full = disks.filter((d) => n(d.state) >= 90).sort((a, b) => n(b.state) - n(a.state));
      const ordered = [...full, ...disks.filter((d) => !full.includes(d))].slice(0, 8);
      const segs: Seg[] = ordered.map((d) => ({ label: `${d.name} ${num(n(d.state), 0)}%`, on: n(d.state) < 90, id: d.id }));
      const root = disks.find((d) => d.id === 'disk.root') ?? disks[0];
      const worst = full[0];
      return { kind: 's', segs, ids: disks.map((d) => d.id), big: `${disks.length} ${disks.length === 1 ? 'volume' : 'volumes'}`, history: (worst ?? root).id,
        label: `${gb(attr(root, 'free_gb'))} free on ${root.name}`,
        alert: worst ? { level: n(worst.state) >= 97 ? 2 : 1, big: `${num(n(worst.state), 0)}%`, label: worst.name, fail: full.map((d) => ordered.indexOf(d)).filter((i) => i >= 0),
          why: `${worst.name} is ${num(n(worst.state), 0)}% full (${gb(attr(worst, 'free_gb'))} left)`, verb: 'Got it', acts: [] } : undefined };
    } },
    { key: 'main', name: 'Main disk', glyph: g.drive, read: (s) => {
      const th = s.get('disk.root') ?? ofPrefix(s, 'disk.')[0];
      if (!th || !isNum(th.state)) return null;
      return { kind: 'p', v: clamp(th.state / 100), ids: [th.id], big: `${num(th.state, 0)}%`, name: th.name, history: th.id,
        label: `${gb(attr(th, 'free_gb'))} of ${gb(attr(th, 'total_gb'))} free` };
    } },
    { key: 'backup', name: 'Backup', glyph: g.clock, read: (s) => {
      const th = s.get('backup.timemachine');
      if (!th) return null;
      const running = th.state === 'running', hours = isNum(th.state) ? th.state : null;
      const last = attr<string>(th, 'last');
      const segs: Seg[] = [{ label: 'Time Machine', on: running || (hours != null && hours < 24), id: th.id, act: running ? undefined : act('backup.start', th.id) }];
      return { kind: 's', segs, ids: [th.id], name: 'Time Machine',
        big: running ? 'Backing up' : hours == null ? 'Unknown' : hours < 1 ? 'Just now' : `${num(hours, 0)} h ago`,
        label: running ? `${num(attr<number>(th, 'percent') ?? 0, 0)}% done` : last ? `last on ${new Date(last).toLocaleDateString()}` : 'no backup found',
        alert: hours != null && hours >= 48 ? { level: 1, big: `${num(hours, 0)} h`, label: 'since the last backup', fail: [0],
          why: `No Time Machine backup for ${num(hours, 0)} hours`, verb: 'Back up now', acts: [act('backup.start', th.id)] } : undefined };
    } },
  ] },

  { id: 'network', title: 'Network', channels: [
    { key: 'internet', name: 'Internet', glyph: g.globe, read: (s) => {
      const th = s.get('net.internet');
      if (!th) return null;
      const ms = isNum(th.state) ? th.state : null;
      return { kind: 'p', v: ms == null ? 0 : clamp(ms / 200), ids: [th.id], big: ms == null ? 'Down' : `${num(ms, 0)} ms`, label: `to ${String(attr(th, 'target') ?? 'the internet')}`, history: th.id,
        alert: ms == null ? got(2, 'Down', 'internet', `No internet: ${String(attr(th, 'target') ?? 'the outside')} does not answer`)
          : ms > 150 ? got(1, `${num(ms, 0)} ms`, 'slow', `The internet is slow: ${num(ms, 0)} ms to ${String(attr(th, 'target'))}`) : undefined };
    } },
    { key: 'wifi', name: 'Wi‑Fi', glyph: g.wifi, read: (s) => {
      const th = s.get('net.wifi');
      if (!th) return null;
      if (th.state === 'off') return { kind: 'p', v: 0, ids: [th.id], big: 'Off', label: 'Wi‑Fi is off' };
      const rssi = isNum(th.state) ? th.state : null, ssid = String(attr(th, 'ssid') ?? 'connected');
      return { kind: 'p', v: rssi == null ? 1 : clamp((rssi + 90) / 60), ids: [th.id], big: ssid, history: rssi != null ? th.id : undefined,
        label: rssi == null ? 'connected' : `${rssi} dBm${attr(th, 'channel') ? ` · ${String(attr(th, 'channel'))}` : ''}`,
        alert: rssi != null && rssi <= -80 ? got(1, `${rssi} dBm`, 'weak signal', `Weak Wi‑Fi signal on ${ssid}`) : undefined };
    } },
    { key: 'throughput', name: 'Throughput', glyph: g.arrows, read: (s) => {
      const th = s.get('net.throughput');
      if (!th || !isNum(th.state)) return null;
      return { kind: 'p', v: clamp(th.state / 100), ids: [th.id], big: `${num(th.state, th.state < 10 ? 1 : 0)} Mbit/s`, history: th.id,
        label: `↓ ${num(attr<number>(th, 'down_mbit') ?? 0, 1)} · ↑ ${num(attr<number>(th, 'up_mbit') ?? 0, 1)}` };
    } },
    { key: 'lan', name: 'Devices', glyph: g.devices, read: (s) => {
      const th = s.get('net.lan');
      if (!th || !isNum(th.state)) return null;
      return { kind: 'p', v: clamp(th.state / 50), ids: [th.id], big: `${th.state}`, label: `${th.state === 1 ? 'device' : 'devices'} on the network`, history: th.id };
    } },
  ] },

  { id: 'power', title: 'Power', channels: [
    { key: 'battery', name: 'Battery', glyph: g.battery, read: (s) => {
      const th = s.get('battery.level');
      if (!th || !isNum(th.state)) return null;
      const pct = th.state, state = String(attr(th, 'state') ?? ''), remaining = attr<string>(th, 'remaining');
      const draining = state === 'discharging';
      return { kind: 'p', v: clamp(pct / 100), ids: [th.id], big: `${num(pct, 0)}%`, history: th.id,
        label: `${state}${remaining && remaining !== '(no estimate)' ? ` · ${remaining} left` : ''}`,
        alert: draining && pct <= 10 ? got(2, `${num(pct, 0)}%`, 'battery', `Battery at ${num(pct, 0)}%, discharging`)
          : draining && pct <= 20 ? got(1, `${num(pct, 0)}%`, 'battery', `Battery at ${num(pct, 0)}%, discharging`) : undefined };
    } },
    { key: 'health', name: 'Battery health', glyph: g.heart, read: (s) => {
      const th = s.get('battery.level');
      const health = th && attr<number>(th, 'health_pct');
      if (!th || health == null) return null;
      const temp = attr<number>(th, 'temperature_c');
      return { kind: 'p', v: clamp(health / 100), ids: [th.id], big: `${num(health, 0)}%`,
        label: `${attr<number>(th, 'cycles') ?? '?'} cycles${temp != null ? ` · ${num(temp, 0)}°C` : ''}`,
        alert: health < 70 ? got(1, `${num(health, 0)}%`, 'battery health', `The battery holds ${num(health, 0)}% of its design capacity`) : undefined };
    } },
    { key: 'source', name: 'Power source', glyph: g.bolt, read: (s) => {
      const th = s.get('power.source');
      if (!th) return null;
      const segs: Seg[] = [{ label: 'AC', on: th.state === 'AC', id: th.id }, { label: 'Battery', on: th.state === 'battery', id: th.id }];
      return { kind: 'c', segs, ids: [th.id], big: th.state === 'AC' ? 'Plugged in' : 'On battery', label: 'power source' };
    } },
    { key: 'uptime', name: 'Uptime', glyph: g.clock, read: (s) => {
      const th = s.get('host.uptime');
      if (!th || !isNum(th.state)) return null;
      const h = th.state, since = attr<string>(th, 'since');
      return { kind: 'p', v: clamp(h / 720), ids: [th.id], big: h >= 48 ? `${num(h / 24, 0)} d` : `${num(h, h < 10 ? 1 : 0)} h`,
        label: since ? `since ${new Date(since).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}` : 'up' };
    } },
  ] },

  { id: 'services', title: 'Services', channels: [
    { key: 'containers', name: 'Containers', glyph: g.box, read: (s) => {
      const all = ofPrefix(s, 'docker.');
      if (!all.length) return null;
      const bad = all.filter((c) => c.state === 'unhealthy' || (c.state === 'exited' && !/Exited \(0\)/.test(String(attr(c, 'status') ?? ''))));
      const ordered = [...bad, ...all.filter((c) => !bad.includes(c))].slice(0, 8);
      const segs: Seg[] = ordered.map((c) => ({ label: c.name, on: c.state === 'running', id: c.id,
        act: c.state === 'running' ? undefined : act('docker.start', c.id, c.name) }));
      const running = all.filter((c) => c.state === 'running');
      const worst = bad[0];
      return { kind: 's', segs, ids: all.map((c) => c.id), big: `${running.length} of ${all.length}`,
        label: running.length === all.length ? 'all running' : `${list(all.filter((c) => c.state !== 'running').map((c) => c.name))} ${all.length - running.length === 1 ? 'is' : 'are'} not running`,
        alert: worst ? { level: 1, big: worst.state === 'unhealthy' ? 'Unhealthy' : 'Exited', label: worst.name, fail: bad.map((c) => ordered.indexOf(c)).filter((i) => i >= 0),
          why: `${worst.name} ${worst.state === 'unhealthy' ? 'is unhealthy' : `exited: ${String(attr(worst, 'status') ?? '')}`}`,
          verb: worst.state === 'unhealthy' ? 'Restart' : 'Start', acts: [act(worst.state === 'unhealthy' ? 'docker.restart' : 'docker.start', worst.id, worst.name)] } : undefined,
        tracks: all.slice(0, 8).map((c): TrackSpec => ({ id: c.id, on: (st) => st === 'running', now: c.state === 'running', tone: c.state === 'running' ? undefined : 'warn',
          act: c.state === 'running' ? undefined : act('docker.start', c.id, c.name) })) };
    } },
    { key: 'brew', name: 'Homebrew services', glyph: g.gear, read: (s) => {
      const all = ofPrefix(s, 'service.');
      if (!all.length) return null;
      const failed = all.filter((x) => x.state === 'error');
      const ordered = [...failed, ...all.filter((x) => !failed.includes(x))].slice(0, 8);
      const segs: Seg[] = ordered.map((x) => ({ label: x.name, on: x.state === 'started', id: x.id, act: act('service.restart', x.id, x.name) }));
      const started = all.filter((x) => x.state === 'started');
      return { kind: 's', segs, ids: all.map((x) => x.id), big: `${started.length} of ${all.length}`, label: started.length === all.length ? 'all started' : 'started',
        alert: failed.length ? { level: 1, big: 'Error', label: list(failed.map((x) => x.name)), fail: failed.map((x) => ordered.indexOf(x)),
          why: `${list(failed.map((x) => x.name))} ${failed.length === 1 ? 'exited with an error' : 'exited with errors'}`, verb: 'Restart', acts: failed.map((x) => act('service.restart', x.id, x.name)) } : undefined,
        tracks: all.slice(0, 8).map((x): TrackSpec => ({ id: x.id, on: (st) => st === 'started', now: x.state === 'started', tone: x.state === 'started' ? undefined : 'warn' })) };
    } },
  ] },

  { id: 'care', title: 'Updates & security', channels: [
    { key: 'updates', name: 'Updates', glyph: g.download, read: (s) => {
      const os = s.get('update.os'), brew = s.get('update.brew');
      const items = [os && { th: os, label: os.name }, brew && { th: brew, label: 'Homebrew' }].filter((x): x is { th: Thing; label: string } => !!x && isNum(x.th.state));
      if (!items.length) return null;
      const segs: Seg[] = items.map((x) => ({ label: `${x.label}${n(x.th.state) ? ` (${x.th.state})` : ''}`, on: n(x.th.state) === 0, id: x.th.id }));
      const total = items.reduce((a, x) => a + n(x.th.state), 0);
      const pending = items.filter((x) => n(x.th.state) > 0);
      return { kind: 's', segs, ids: items.map((x) => x.th.id), big: total ? `${total} pending` : 'Up to date',
        label: total ? list(pending.map((x) => `${x.th.state} ${x.label.toLowerCase()}`)) : list(items.map((x) => x.label.toLowerCase())),
        alert: total ? { level: 1, big: `${total} new`, label: 'updates', fail: pending.map((x) => items.indexOf(x)),
          why: `${total} ${total === 1 ? 'update' : 'updates'} waiting: ${list(pending.map((x) => `${x.label} ${x.th.state}`))}`, verb: 'Got it', acts: [] } : undefined };
    } },
    { key: 'protection', name: 'Protection', glyph: g.shield, read: (s) => {
      const all = ofPrefix(s, 'security.');
      if (!all.length) return null;
      const segs: Seg[] = all.map((x) => ({ label: x.name, on: x.state === 'on', id: x.id }));
      const off = all.filter((x) => x.state !== 'on');
      return { kind: 's', segs, ids: all.map((x) => x.id), big: off.length ? `${off.length} off` : 'All on', label: off.length ? list(off.map((x) => x.name)) : list(all.map((x) => x.name)),
        alert: off.length ? { level: 1, big: 'Off', label: list(off.map((x) => x.name)), fail: off.map((x) => all.indexOf(x)),
          why: `${list(off.map((x) => x.name))} ${off.length === 1 ? 'is' : 'are'} off`, verb: 'Got it', acts: [] } : undefined };
    } },
  ] },

  { id: 'peripherals', title: 'Peripherals', channels: [
    { key: 'bluetooth', name: 'Bluetooth batteries', glyph: g.bluetooth, read: (s) => {
      const all = ofPrefix(s, 'bt.').filter((x) => isNum(x.state));
      if (!all.length) return null;
      const low = all.filter((x) => n(x.state) < 20).sort((a, b) => n(a.state) - n(b.state));
      const ordered = [...low, ...all.filter((x) => !low.includes(x))].slice(0, 8);
      const segs: Seg[] = ordered.map((x) => ({ label: `${x.name} ${num(n(x.state), 0)}%`, on: n(x.state) >= 20, id: x.id }));
      const lowest = [...all].sort((a, b) => n(a.state) - n(b.state))[0];
      const connected = all.filter((x) => attr(x, 'connected')).length;
      return { kind: 's', segs, ids: all.map((x) => x.id), big: low.length ? `${low.length} low` : `${num(n(lowest.state), 0)}% lowest`,
        label: low.length ? list(low.map((x) => x.name)) : `${connected} of ${all.length} connected`,
        alert: low.length ? { level: 1, big: `${num(n(low[0].state), 0)}%`, label: low[0].name.toLowerCase(), fail: low.map((x) => ordered.indexOf(x)).filter((i) => i >= 0),
          why: low.length > 1 ? `${low.length} devices under 20%: ${list(low.map((x) => x.name))}` : `${low[0].name} battery at ${num(n(low[0].state), 0)}%`, verb: 'Got it', acts: [] } : undefined };
    } },
  ] },
];

export const systems: System[] = SYSTEMS;
