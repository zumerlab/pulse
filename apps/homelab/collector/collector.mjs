#!/usr/bin/env node
// The collector: a small Node server that reads the machine it runs on (macOS
// first, Linux as a fallback) and serves what it found as "things" for the
// homelab app. No dependencies. It only answers on 127.0.0.1 unless told
// otherwise, and the few actions it accepts are a fixed list.
//
//   node apps/homelab/collector/collector.mjs            # http://127.0.0.1:5180
//   node apps/homelab/collector/collector.mjs --port 5190 --interval 5
//   node apps/homelab/collector/collector.mjs --once      # one snapshot as JSON, then exit
//   node apps/homelab/collector/collector.mjs --host 0.0.0.0 --token <secret>   # on the LAN, with a token
//
//   GET  /                         the snapshot: { host, at, things: { id: { name, state, unit, attrs, changed } } }
//   GET  /history?ids=a,b&hours=24 rows of (state, when) per thing for the day rings
//   POST /act  { kind, ... }       one of the actions below
//
// The day of each thing is kept in memory and in ~/.pulse/homelab/history.json
// (written every five minutes), so a restart keeps the rings.

import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const PORT = Number(opt('port', 5180));
const HOST = opt('host', '127.0.0.1');
const INTERVAL = Math.max(1, Number(opt('interval', 3))) * 1000;
const TOKEN = opt('token', '');
const ONCE = args.includes('--once');
const MAC = process.platform === 'darwin';
const HOURS_KEPT = 26;
const STORE_DIR = join(os.homedir(), '.pulse', 'homelab');
const STORE = join(STORE_DIR, 'history.json');

if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !TOKEN && !ONCE) {
  console.error('Listening beyond this machine needs --token <secret>: the app sends it as Authorization: Bearer <secret>.');
  process.exit(1);
}

// ─── Running commands ───────────────────────────────────────────────

// A command's stdout, or '' when it is missing, fails or takes too long. Every
// probe is best effort: a machine without Docker or Homebrew simply lacks those things.
const run = (cmd, argv = [], timeout = 4000) => new Promise((resolve) => {
  execFile(cmd, argv, { timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => resolve(err ? '' : stdout));
});
const lines = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);
// A number out of a command's text; nothing (null, an empty field) stays nothing, not 0.
const num = (s) => { if (s == null) return null; const t = String(s).replace(/[^0-9.-]/g, ''); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : null; };
const round = (v, d = 1) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
const GB = 1024 ** 3;

// ─── The things ─────────────────────────────────────────────────────

// id → { name, state, unit, attrs, changed } ; `changed` is when the state last changed (ms).
const things = new Map();
const put = (id, name, state, unit = '', attrs = {}) => {
  if (state == null || state === '') return;
  const was = things.get(id), now = Date.now();
  const changed = !was || was.state !== state ? now : was.changed;
  things.set(id, { name, state, unit, attrs, changed });
  remember(id, state, now, was?.state !== state);
};
// Things not seen in this round are gone (a volume ejected, a container removed).
const sweep = (prefix, seen) => { for (const id of things.keys()) if (id.startsWith(prefix) && !seen.has(id)) things.delete(id); };

// ─── History: rows of (state, when) per thing ───────────────────────

// Numeric things take a row every minute; others only when they change.
let rows = {};
const lastRow = {};
try { rows = JSON.parse(readFileSync(STORE, 'utf8')); } catch { rows = {}; }
function remember(id, state, now, changed) {
  const sec = now / 1000, numeric = typeof state === 'number';
  if (!numeric && !changed) return;
  if (numeric && lastRow[id] && sec - lastRow[id] < 60) return;
  lastRow[id] = sec;
  (rows[id] ??= []).push({ s: String(state), lu: Math.round(sec) });
  const cutoff = sec - HOURS_KEPT * 3600;
  while (rows[id].length > 1 && rows[id][1].lu < cutoff) rows[id].shift();
}
function save() {
  try { mkdirSync(STORE_DIR, { recursive: true }); writeFileSync(STORE, JSON.stringify(rows)); } catch { /* read-only home: the day lives in memory */ }
}

// ─── Probes ─────────────────────────────────────────────────────────

// CPU: the share of busy time since the last sample (os.cpus deltas), the load averages, the model.
let cpuWas = null;
function cpu() {
  const cpus = os.cpus();
  const sum = cpus.reduce((a, c) => { for (const k in c.times) a[k] = (a[k] ?? 0) + c.times[k]; return a; }, {});
  const total = Object.values(sum).reduce((a, b) => a + b, 0);
  let pct = null;
  if (cpuWas) {
    const dt = total - cpuWas.total, idle = sum.idle - cpuWas.idle;
    if (dt > 0) pct = round(100 * (1 - idle / dt), 0);
  }
  cpuWas = { total, idle: sum.idle };
  const [l1, l5, l15] = os.loadavg();
  if (pct != null) put('cpu.load', 'CPU', pct, '%', { cores: cpus.length, model: cpus[0]?.model, load1: round(l1, 2), load5: round(l5, 2), load15: round(l15, 2) });
}

async function memory() {
  const total = os.totalmem();
  if (MAC) {
    const vm = await run('vm_stat');
    const page = num(/page size of (\d+)/.exec(vm)?.[1]) ?? 16384;
    const pages = (k) => num(new RegExp(`${k}:\\s+(\\d+)`).exec(vm)?.[1]) ?? 0;
    const free = pages('Pages free') + pages('Pages speculative');
    const inactive = pages('Pages inactive') + pages('Pages purgeable');
    const used = total - (free + inactive) * page;
    put('mem.used', 'Memory', round(100 * used / total, 0), '%', { used_gb: round(used / GB), total_gb: round(total / GB), free_pct: round(100 * (free + inactive) * page / total, 0) });
    const swap = await run('sysctl', ['-n', 'vm.swapusage']);
    const m = /used = ([\d.]+)M/.exec(swap), tot = /total = ([\d.]+)M/.exec(swap);
    if (m) put('mem.swap', 'Swap', round(num(m[1]) / 1024, 2), 'GB', { total_gb: round((num(tot?.[1]) ?? 0) / 1024, 2) });
    const pressure = await run('memory_pressure', ['-Q'], 3000);
    const freePct = num(/free percentage: (\d+)/.exec(pressure)?.[1]);
    if (freePct != null) put('mem.pressure', 'Memory pressure', 100 - freePct, '%', { free_pct: freePct });
  } else {
    const info = readFile('/proc/meminfo');
    const kb = (k) => num(new RegExp(`${k}:\\s+(\\d+)`).exec(info)?.[1]) ?? 0;
    const avail = kb('MemAvailable') * 1024, used = total - avail;
    put('mem.used', 'Memory', round(100 * used / total, 0), '%', { used_gb: round(used / GB), total_gb: round(total / GB), free_pct: round(100 * avail / total, 0) });
    const swapTotal = kb('SwapTotal'), swapFree = kb('SwapFree');
    if (swapTotal) put('mem.swap', 'Swap', round((swapTotal - swapFree) / 1024 / 1024, 2), 'GB', { total_gb: round(swapTotal / 1024 / 1024, 2) });
  }
}
const readFile = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

// Disks: every mounted volume a person would care about (the system ones hidden).
async function disks() {
  const out = await run('df', MAC ? ['-k'] : ['-k', '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'overlay', '-x', 'squashfs']);
  const seen = new Set();
  for (const l of lines(out).slice(1)) {
    const parts = l.split(/\s+/);
    if (parts.length < 6) continue;
    const mount = parts.slice(MAC ? 8 : 5).join(' ');
    const size = num(parts[1]) * 1024, used = num(parts[2]) * 1024, avail = num(parts[3]) * 1024;
    if (!size || !mount.startsWith('/')) continue;
    if (MAC && mount !== '/' && !mount.startsWith('/Volumes/')) continue;
    if (MAC && /^\/Volumes\/(Recovery|Preboot|VM|Update|xarts|iSCPreboot|Hardware)/.test(mount)) continue;
    if (!MAC && (mount.startsWith('/boot') || mount.startsWith('/snap') || mount.startsWith('/run') || mount.startsWith('/sys') || mount.startsWith('/dev') || mount.startsWith('/proc'))) continue;
    const name = mount === '/' ? (MAC ? 'Macintosh HD' : 'Root') : mount.split('/').pop();
    const id = `disk.${mount === '/' ? 'root' : slug(name)}`;
    seen.add(id);
    put(id, name, round(100 * used / (used + avail), 0), '%', { mount, free_gb: round(avail / GB), total_gb: round(size / GB) });
  }
  sweep('disk.', seen);
}

// Network: bytes per second over all interfaces since the last sample, the Wi‑Fi, the internet, the LAN.
let netWas = null;
async function network() {
  let rx = 0, tx = 0;
  if (MAC) {
    const out = await run('netstat', ['-ib']);
    for (const l of lines(out).slice(1)) {
      const p = l.split(/\s+/);
      // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes
      if (p.length >= 10 && /^[a-z]/.test(p[0]) && !p[0].startsWith('lo') && /<Link/.test(p[2])) { rx += num(p[6]) ?? 0; tx += num(p[9]) ?? 0; }
    }
  } else {
    for (const l of lines(readFile('/proc/net/dev')).slice(2)) {
      const [name, rest] = l.split(':'); if (!rest || name.trim() === 'lo') continue;
      const p = rest.trim().split(/\s+/); rx += num(p[0]) ?? 0; tx += num(p[8]) ?? 0;
    }
  }
  const now = Date.now();
  if (netWas) {
    const dt = (now - netWas.at) / 1000;
    if (dt > 0 && rx >= netWas.rx && tx >= netWas.tx) {
      const down = 8 * (rx - netWas.rx) / dt / 1e6, up = 8 * (tx - netWas.tx) / dt / 1e6;
      put('net.throughput', 'Throughput', round(down + up, 2), 'Mbit/s', { down_mbit: round(down, 2), up_mbit: round(up, 2) });
    }
  }
  netWas = { rx, tx, at: now };
}
async function internet() {
  const out = await run('ping', MAC ? ['-c', '1', '-W', '1500', '1.1.1.1'] : ['-c', '1', '-W', '2', '1.1.1.1'], 4000);
  const ms = num(/time=([\d.]+)/.exec(out)?.[1]);
  put('net.internet', 'Internet', ms ?? 'unreachable', ms != null ? 'ms' : '', { target: '1.1.1.1' });
}
async function wifi() {
  if (!MAC) return;
  const out = await run('system_profiler', ['SPAirPortDataType', '-json'], 15000);
  try {
    const ifaces = JSON.parse(out).SPAirPortDataType?.[0]?.spairport_airport_interfaces ?? [];
    const cur = ifaces.map((i) => i.spairport_current_network_information).find(Boolean);
    const iface = ifaces.find((i) => i.spairport_current_network_information);
    if (!cur) { put('net.wifi', 'Wi‑Fi', 'off', '', { interface: ifaces[0]?._name }); return; }
    const rssi = num(/-?\d+/.exec(String(cur.spairport_signal_noise ?? ''))?.[0]);
    put('net.wifi', 'Wi‑Fi', rssi ?? 'on', rssi != null ? 'dBm' : '', { ssid: cur._name, channel: cur.spairport_network_channel, rate_mbps: cur.spairport_network_rate, phy: cur.spairport_network_phymode, interface: iface?._name });
  } catch { /* no Wi‑Fi report */ }
}
async function lan() {
  const out = await run('arp', ['-a'], 5000);
  const hosts = lines(out).filter((l) => /\(\d+\.\d+\.\d+\.\d+\)/.test(l) && !/incomplete|ff:ff:ff:ff:ff:ff/.test(l));
  put('net.lan', 'Devices on the network', hosts.length, '', { sample: hosts.slice(0, 12).map((l) => l.split(' ')[0] === '?' ? /\(([\d.]+)\)/.exec(l)?.[1] : l.split(' ')[0]) });
}

// Power: the battery (level, charging, time, cycles, health, temperature) and the source.
async function power() {
  if (MAC) {
    const batt = await run('pmset', ['-g', 'batt']);
    const pct = num(/(\d+)%/.exec(batt)?.[1]);
    if (pct == null) { put('power.source', 'Power', 'AC', '', {}); return; }
    const state = /discharging/.test(batt) ? 'discharging' : /charged/.test(batt) ? 'charged' : /charging/.test(batt) ? 'charging' : 'not charging';
    const remaining = /(\d+:\d+) remaining/.exec(batt)?.[1];
    const reg = await run('ioreg', ['-rn', 'AppleSmartBattery']);
    const field = (k) => num(new RegExp(`"${k}" = (-?\\d+)`).exec(reg)?.[1]);
    const cycles = field('CycleCount'), design = field('DesignCapacity'), max = field('AppleRawMaxCapacity') ?? field('MaxCapacity'), temp = field('Temperature');
    put('battery.level', 'Battery', pct, '%', { state, remaining, cycles, health_pct: design && max ? round(100 * max / design, 0) : null, temperature_c: temp != null ? round(temp / 100) : null });
    put('power.source', 'Power', /AC Power/.test(batt) ? 'AC' : 'battery', '', {});
  } else {
    const cap = readFile('/sys/class/power_supply/BAT0/capacity').trim(), status = readFile('/sys/class/power_supply/BAT0/status').trim().toLowerCase();
    if (cap) put('battery.level', 'Battery', num(cap), '%', { state: status || 'unknown', remaining: undefined, cycles: num(readFile('/sys/class/power_supply/BAT0/cycle_count')), health_pct: null, temperature_c: null });
    const ac = readFile('/sys/class/power_supply/AC/online').trim() || readFile('/sys/class/power_supply/ACAD/online').trim();
    put('power.source', 'Power', ac === '0' ? 'battery' : 'AC', '', {});
  }
}
async function thermal() {
  if (!MAC) {
    const t = num(readFile('/sys/class/thermal/thermal_zone0/temp'));
    if (t != null && t > 0) put('cpu.temperature', 'CPU temperature', round(t / 1000, 0), '°C', {});
    return;
  }
  const out = await run('pmset', ['-g', 'therm']);
  const speed = num(/CPU_Speed_Limit\s*=\s*(\d+)/.exec(out)?.[1]);
  if (speed != null) put('cpu.thermal', 'Thermal headroom', speed, '%', { scheduler_limit: num(/CPU_Scheduler_Limit\s*=\s*(\d+)/.exec(out)?.[1]) });
  // Temperatures need a helper (smctemp, osx-cpu-temp): used when one is installed.
  const smc = await run('smctemp', ['-c'], 3000) || await run('osx-cpu-temp', [], 3000);
  const t = num(smc);
  if (t != null && t > 0) put('cpu.temperature', 'CPU temperature', round(t, 0), '°C', {});
}

// Processes: the busiest by CPU, and how many.
async function processes() {
  const out = await run('ps', MAC ? ['-Aceo', 'pcpu,pmem,comm', '-r'] : ['-eo', 'pcpu,pmem,comm', '--sort=-pcpu']);
  const all = lines(out).slice(1).map((l) => { const [cpu, mem, ...name] = l.split(/\s+/); return { name: name.join(' '), cpu: num(cpu) ?? 0, mem: num(mem) ?? 0 }; });
  const top = all.filter((p) => p.name).slice(0, 6);
  if (!top.length) return;
  put('proc.top', 'Busiest process', top[0].name, '', { top, count: all.length });
}

// Docker containers (when Docker is installed and running).
async function docker() {
  const out = await run('docker', ['ps', '-a', '--format', '{{json .}}'], 6000);
  const seen = new Set();
  for (const l of lines(out)) {
    try {
      const c = JSON.parse(l);
      const state = /unhealthy/.test(c.Status) ? 'unhealthy' : c.State === 'running' ? 'running' : c.State;
      const id = `docker.${slug(c.Names)}`; seen.add(id);
      put(id, c.Names, state, '', { image: c.Image, status: c.Status, ports: c.Ports });
    } catch { /* not a container line */ }
  }
  sweep('docker.', seen);
}

// Homebrew services and outdated formulae; macOS updates. The slow ones run rarely.
async function brewServices() {
  if (!MAC) return;
  const out = await run('brew', ['services', 'list', '--json'], 20000);
  const seen = new Set();
  try {
    for (const s of JSON.parse(out)) { const id = `service.${slug(s.name)}`; seen.add(id); put(id, s.name, s.status, '', { user: s.user, exit_code: s.exit_code }); }
  } catch { return; }
  sweep('service.', seen);
}
async function brewOutdated() {
  const out = await run('brew', ['outdated', '--json=v2'], 60000);
  try { const j = JSON.parse(out); const n = (j.formulae?.length ?? 0) + (j.casks?.length ?? 0); put('update.brew', 'Homebrew', n, '', { formulae: j.formulae?.map((f) => f.name).slice(0, 12), casks: j.casks?.map((c) => c.name).slice(0, 12) }); } catch { /* no Homebrew */ }
}
async function macUpdates() {
  if (!MAC) {
    const out = await run('sh', ['-c', 'apt list --upgradable 2>/dev/null | tail -n +2 | wc -l'], 60000);
    const n = num(out); if (n != null && out) put('update.os', 'System updates', n, '', {});
    return;
  }
  const out = await run('softwareupdate', ['-l'], 120000);
  if (!out) return;
  const titles = lines(out).filter((l) => l.startsWith('* Label:')).map((l) => l.replace('* Label:', '').trim());
  put('update.os', 'macOS updates', titles.length, '', { titles });
}
async function timeMachine() {
  if (!MAC) return;
  const latest = (await run('tmutil', ['latestbackup'], 10000)).trim();
  const status = await run('tmutil', ['status'], 5000);
  const running = /Running = 1/.test(status);
  if (!latest && !running) return;
  const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(latest);
  const at = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : null;
  const hours = at ? round((Date.now() - at) / 3_600_000) : null;
  put('backup.timemachine', 'Time Machine', running ? 'running' : hours ?? 'unknown', running ? '' : 'h', { last: at ? new Date(at).toISOString() : null, running, percent: num(/Percent = "?([\d.]+)/.exec(status)?.[1]) });
}
async function bluetooth() {
  if (!MAC) return;
  const out = await run('system_profiler', ['SPBluetoothDataType', '-json'], 15000);
  const seen = new Set();
  try {
    const root = JSON.parse(out).SPBluetoothDataType?.[0] ?? {};
    for (const group of [root.device_connected ?? [], root.device_not_connected ?? []]) {
      for (const entry of group) for (const [name, d] of Object.entries(entry)) {
        const pct = num(d.device_batteryLevelMain ?? d.device_batteryLevel ?? d.device_batteryLevelLeft);
        if (pct == null) continue;
        const id = `bt.${slug(name)}`; seen.add(id);
        put(id, name, pct, '%', { connected: group === root.device_connected, type: d.device_minorType, left: num(d.device_batteryLevelLeft), right: num(d.device_batteryLevelRight), case: num(d.device_batteryLevelCase) });
      }
    }
  } catch { return; }
  sweep('bt.', seen);
}
async function security() {
  if (!MAC) return;
  const fv = await run('fdesetup', ['status']);
  if (fv) put('security.filevault', 'FileVault', /On\./.test(fv) ? 'on' : 'off', '', {});
  const fw = await run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']);
  if (fw) put('security.firewall', 'Firewall', /enabled/.test(fw) ? 'on' : 'off', '', {});
  const gk = await run('spctl', ['--status']);
  if (gk) put('security.gatekeeper', 'Gatekeeper', /enabled/.test(gk) ? 'on' : 'off', '', {});
}
async function hostInfo() {
  const name = os.hostname().replace(/\.local$/, '');
  let model, version;
  if (MAC) {
    model = (await run('sysctl', ['-n', 'hw.model'])).trim();
    const sw = await run('sw_vers');
    version = `macOS ${/ProductVersion:\s+(\S+)/.exec(sw)?.[1] ?? ''}`.trim();
  } else {
    version = /PRETTY_NAME="([^"]+)"/.exec(readFile('/etc/os-release'))?.[1] ?? `${os.type()} ${os.release()}`;
    model = readFile('/sys/firmware/devicetree/base/model').replace(/\0/g, '').trim() || readFile('/sys/devices/virtual/dmi/id/product_name').trim();
  }
  put('host.uptime', 'Uptime', round(os.uptime() / 3600), 'h', { since: new Date(Date.now() - os.uptime() * 1000).toISOString() });
  return { name, model, version, platform: process.platform, arch: os.arch() };
}

// ─── Rounds ─────────────────────────────────────────────────────────

let host = { name: os.hostname() };
const every = (ms, fn) => { let last = 0; return async () => { if (Date.now() - last < ms) return; last = Date.now(); await fn(); }; };
const slow = [
  every(60_000, wifi), every(60_000, lan), every(60_000, bluetooth), every(120_000, brewServices), every(300_000, timeMachine),
  every(3_600_000, brewOutdated), every(6 * 3_600_000, macUpdates), every(3_600_000, security),
];
async function round_() {
  host = await hostInfo();
  await Promise.all([memory(), disks(), network(), internet(), power(), thermal(), processes(), docker()]);
  cpu();
  for (const fn of slow) await fn();
}
const snapshot = () => ({ host, at: Date.now(), interval: INTERVAL / 1000, things: Object.fromEntries(things) });

// ─── Actions ────────────────────────────────────────────────────────

// Each action names what it touches, so the app knows what to watch.
const ACTIONS = {
  'docker.start': ({ name }) => run('docker', ['start', String(name)], 30000),
  'docker.stop': ({ name }) => run('docker', ['stop', String(name)], 60000),
  'docker.restart': ({ name }) => run('docker', ['restart', String(name)], 60000),
  'service.restart': ({ name }) => MAC ? run('brew', ['services', 'restart', String(name)], 60000) : run('systemctl', ['restart', String(name)], 60000),
  'backup.start': () => MAC ? run('tmutil', ['startbackup'], 10000) : Promise.resolve(''),
};
const safeName = (s) => /^[A-Za-z0-9_.@-]{1,64}$/.test(String(s ?? ''));

// ─── Server ─────────────────────────────────────────────────────────

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const authorized = (req) => !TOKEN || req.headers.authorization === `Bearer ${TOKEN}`;

if (ONCE) {
  await round_();
  await new Promise((r) => setTimeout(r, 1200));
  await round_();
  console.log(JSON.stringify(snapshot(), null, 1));
  process.exit(0);
}

await round_();
setInterval(() => { round_().catch(() => {}); }, INTERVAL);
setInterval(save, 300_000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { save(); process.exit(0); });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && url.pathname === '/') return json(res, 200, snapshot());
  if (req.method === 'GET' && url.pathname === '/history') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
    const hours = Math.min(HOURS_KEPT, Math.max(1, Number(url.searchParams.get('hours') ?? 24)));
    const start = Date.now() / 1000 - hours * 3600;
    const out = {};
    for (const id of ids) {
      const all = rows[id] ?? [];
      const i = Math.max(0, all.findIndex((r) => r.lu > start) - 1);
      out[id] = i < 0 ? [] : all.slice(i);
    }
    return json(res, 200, { rows: out, hours });
  }
  if (req.method === 'POST' && url.pathname === '/act') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 10_000) return json(res, 413, { error: 'too large' }); }
    let a;
    try { a = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
    const fn = ACTIONS[a?.kind];
    if (!fn) return json(res, 400, { error: `unknown action ${String(a?.kind)}` });
    if (a.name !== undefined && !safeName(a.name)) return json(res, 400, { error: 'bad name' });
    await fn(a);
    await round_();
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, HOST, () => {
  console.log(`Pulse collector for ${host.name} (${host.version ?? process.platform}) on http://${HOST}:${PORT}  ·  ${things.size} things, every ${INTERVAL / 1000} s`);
  console.log(`Open the homelab app with ?collector=http://${HOST === '0.0.0.0' ? os.hostname() : HOST}:${PORT}`);
});
