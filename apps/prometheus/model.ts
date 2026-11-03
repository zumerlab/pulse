import { listOf, num, type Alert as PulseAlert, type Group, type Reading, type Seg } from '@zumer/pulse';
import { type ChannelConfig, type SystemConfig, glyphOf, GLYPHS } from './config.ts';
import { type Act, type Alert, type PromSource, type Sample, channelId, hostId } from './source.ts';
import { t } from './strings.ts';

// The fleet from its configuration, read two ways. On the systems axis one
// object per system of the configuration, each channel a swarm: a tick per
// host, the ones over the line painted, plus the targets and the alerts. On
// the groups axis one object per host with the same channels as bands, its
// target and its alerts. The alerts are the one thing that takes a command:
// a silence for an hour, when Alertmanager is there.

export type Channel = { key: string; name: string; glyph: string; read: (s: PromSource) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
// The alert's key is its label (CPU usage, target): the value in `big` drifts, the alert stays the same.
const got = (level: 1 | 2, big: string, label: string, why: string): PulseAlert => ({ level, big, label, why, key: label, verb: t.gotIt, acts: [] });
const silence = (a: Alert): Act => ({ ids: ['alerts', hostId(a.host)], kind: 'silence', alert: a.id, hours: 1 });
const hostName = (host: string) => host.replace(/:\d+$/, '');

// A value in its unit's words.
export function format(v: number, unit: ChannelConfig['unit'] = 'ratio') {
  if (unit === 'ratio') return `${num(v * 100, v * 100 >= 10 ? 0 : 1)}%`;
  if (unit === 'percent') return `${num(v, v >= 10 ? 0 : 1)}%`;
  if (unit === 'bytes' || unit === 'bytes/s') {
    const units = ['B', 'kB', 'MB', 'GB', 'TB'];
    let i = 0, x = v;
    while (x >= 1000 && i < units.length - 1) { x /= 1000; i++; }
    return `${num(x, x >= 10 ? 0 : 1)} ${units[i]}${unit === 'bytes/s' ? '/s' : ''}`;
  }
  if (unit === 'seconds') return v >= 3600 ? `${num(v / 3600, 1)} h` : v >= 60 ? `${num(v / 60, 0)} min` : `${num(v, 1)} s`;
  return num(v, Math.abs(v) >= 10 ? 0 : 2);
}
// Over (or under) the line: 2 for the critical one, 1 for the warning, 0 for fine.
export const levelOf = (ch: ChannelConfig, v: number): 0 | 1 | 2 => {
  const over = (x?: number) => x != null && (ch.below ? v <= x : v >= x);
  return over(ch.crit) ? 2 : over(ch.warn) ? 1 : 0;
};
const maxOf = (ch: ChannelConfig) => ch.max ?? (ch.unit === 'percent' ? 100 : 1);

// ─── The fleet, by system of the configuration ───

function fleetChannel(sys: SystemConfig, ch: ChannelConfig): Channel {
  const id = channelId(sys.id, ch.key);
  return { key: ch.key, name: ch.name, glyph: glyphOf(ch.glyph), read: (s) => {
    const series = s.series.get(id);
    if (!series?.size) return null;
    const rows = [...series.entries()].map(([host, smp]) => ({ host, v: smp.value, level: levelOf(ch, smp.value) }))
      .sort((a, b) => b.level - a.level || (ch.below ? a.v - b.v : b.v - a.v) || a.host.localeCompare(b.host));
    const bad = rows.filter((r) => r.level), crit = rows.filter((r) => r.level === 2);
    const segs: Seg[] = rows.map((r) => ({ label: `${hostName(r.host)} · ${format(r.v, ch.unit)}`, on: !r.level, id: hostId(r.host) }));
    const worst = rows[0];
    const what = ch.what ?? ch.name.toLowerCase();
    return { kind: 's', segs, ids: rows.map((r) => hostId(r.host)), list: segs,
      big: bad.length ? `${bad.length} over` : format(worst.v, ch.unit),
      label: bad.length ? `${what} · ${listOf(bad.slice(0, 3).map((r) => hostName(r.host)))}` : `${what} at most · ${hostName(worst.host)}`,
      alert: crit.length ? { level: 2, big: `${crit.length} critical`, label: what, key: what, fail: bad.map((_, i) => i), why: t.overWhy(crit.length, `${what} over ${format(ch.crit!, ch.unit)}`, listOf(crit.slice(0, 4).map((r) => `${hostName(r.host)} ${format(r.v, ch.unit)}`))), verb: t.gotIt, acts: [] }
        : bad.length ? { level: 1, big: `${bad.length} warning`, label: what, key: what, fail: bad.map((_, i) => i), why: t.overWhy(bad.length, `${what} over ${format(ch.warn!, ch.unit)}`, listOf(bad.slice(0, 4).map((r) => `${hostName(r.host)} ${format(r.v, ch.unit)}`))), verb: t.gotIt, acts: [] } : undefined };
  } };
}

export const targets: System = { id: 'targets', title: 'Targets', channels: [
  { key: 'up', name: 'Scraped', glyph: GLYPHS.target, read: (s) => {
    const all = [...s.targets.values()].sort((a, b) => Number(a.up) - Number(b.up) || a.job.localeCompare(b.job) || a.host.localeCompare(b.host));
    if (!all.length) return null;
    const down = all.filter((x) => !x.up);
    const segs: Seg[] = all.map((x) => ({ label: `${hostName(x.host)} · ${x.job}${x.up ? '' : ` · ${x.error || 'down'}`}`, on: x.up, id: hostId(x.host) }));
    return { kind: 's', segs, ids: all.map((x) => hostId(x.host)), list: segs, big: down.length ? `${down.length} down` : `${all.length} up`,
      label: down.length ? listOf(down.slice(0, 3).map((x) => hostName(x.host))) : `${new Set(all.map((x) => x.job)).size} jobs`,
      alert: down.length ? { level: down.length >= 3 ? 2 : 1, big: `${down.length} down`, label: 'targets', key: `down:${down.map((x) => x.host).join(',')}`, fail: down.map((_, i) => i), why: t.targetsDown(down.length, listOf(down.slice(0, 4).map((x) => hostName(x.host)))), verb: t.gotIt, acts: [] } : undefined };
  } },
] };

const alertLevel = (a: Alert): 0 | 1 | 2 => t.severity[a.severity.toLowerCase()] ?? 1;
export const alerts: System = { id: 'alerts', title: 'Alerts', channels: [
  { key: 'firing', name: 'Firing', glyph: GLYPHS.bell, read: (s) => {
    const live = s.alerts.filter((a) => !a.silenced), quiet = s.alerts.filter((a) => a.silenced);
    const all = [...live.sort((a, b) => alertLevel(b) - alertLevel(a) || a.since - b.since), ...quiet];
    if (!all.length) return { kind: 's', segs: [], ids: ['alerts'], big: 'None', label: 'nothing firing' };
    const segs: Seg[] = all.map((a) => ({ label: `${a.name}${a.host ? ` · ${hostName(a.host)}` : ''}${a.silenced ? ' · silenced' : a.severity ? ` · ${a.severity}` : ''}`, on: a.silenced, id: `alert:${a.id}`,
      act: !a.silenced && s.canSilence ? silence(a) : undefined }));
    const worst = live[0], level = worst ? alertLevel(worst) : 0;
    return { kind: 's', segs, ids: ['alerts', ...all.map((a) => hostId(a.host))], list: segs, big: live.length ? `${live.length} firing` : `${quiet.length} silenced`,
      label: live.length ? listOf(live.slice(0, 3).map((a) => a.name)) : 'all silenced',
      alert: worst && level ? { level, big: `${live.length} firing`, label: worst.name, key: `firing:${live.map((a) => a.id).join(',')}`, fail: live.map((_, i) => i),
        why: `${t.alertsWhy(live.length, listOf(live.slice(0, 3).map((a) => `${a.name}${a.host ? ` on ${hostName(a.host)}` : ''}`)))}${worst.summary ? `. ${worst.summary}` : ''}`,
        verb: s.canSilence ? t.silence : t.gotIt, acts: s.canSilence ? [silence(worst)] : [] } : undefined };
  } },
] };

export function systemsOf(s: PromSource): System[] {
  return [targets, ...s.config.systems.map((sys) => ({ id: sys.id, title: sys.title, channels: sys.channels.map((ch) => fleetChannel(sys, ch)) })), alerts];
}

// ─── One object per host: the groups axis ───

// The jobs as the gear's groups, each with its hosts.
export function groupsOf(s: PromSource): Group[] {
  const hosts = new Set<string>([...s.targets.keys(), ...[...s.series.values()].flatMap((m) => [...m.keys()])]);
  const byJob = new Map<string, string[]>();
  for (const host of [...hosts].sort()) { const job = s.targets.get(host)?.job ?? ''; byJob.set(job, [...(byJob.get(job) ?? []), host]); }
  return [...byJob.entries()].sort().map(([job, list]) => ({ title: job || t.noGroup, items: list.map((h) => ({ id: h, name: hostName(h) })) }));
}

export function hostSystems(s: PromSource, chosen: string[], hidden: (system: string, channel: string) => boolean): System[] {
  const hosts = new Set<string>([...s.targets.keys(), ...[...s.series.values()].flatMap((m) => [...m.keys()])]);
  return [...hosts].sort().map((host) => {
    const channels: Channel[] = [];
    if (chosen.includes('targets') && !hidden('targets', 'up')) channels.push({ key: 'targets/up', name: 'Target', glyph: GLYPHS.target, read: (src) => {
      const tg = src.targets.get(host);
      if (!tg) return null;
      return { kind: 's', segs: [{ label: 'Scraped', on: tg.up, id: hostId(host) }], ids: [hostId(host)], big: tg.up ? 'Up' : 'Down', label: tg.job,
        alert: tg.up ? undefined : got(2, 'Down', 'target', `${hostName(host)} is not answering Prometheus${tg.error ? `: ${tg.error}` : ''}`) };
    } });
    for (const sys of s.config.systems) {
      if (!chosen.includes(sys.id)) continue;
      for (const ch of sys.channels) {
        if (hidden(sys.id, ch.key)) continue;
        const id = channelId(sys.id, ch.key);
        channels.push({ key: id, name: ch.name, glyph: glyphOf(ch.glyph), read: (src) => {
          const smp: Sample | undefined = src.series.get(id)?.get(host);
          if (!smp) return null;
          const level = levelOf(ch, smp.value), what = ch.what ?? ch.name.toLowerCase();
          return { kind: 'p', v: clamp(smp.value / maxOf(ch)), ids: [hostId(host)], big: format(smp.value, ch.unit), label: what, history: ch.history ? `${id}@${host}` : undefined,
            alert: level ? got(level, format(smp.value, ch.unit), what, t.hostWhy(hostName(host), what, format(smp.value, ch.unit))) : undefined };
        } });
      }
    }
    if (chosen.includes('alerts') && !hidden('alerts', 'firing')) channels.push({ key: 'alerts/firing', name: 'Alerts', glyph: GLYPHS.bell, read: (src) => {
      const mine = src.alerts.filter((a) => a.host === host);
      if (!mine.length) return null;
      const live = mine.filter((a) => !a.silenced);
      const segs: Seg[] = mine.map((a) => ({ label: `${a.name}${a.silenced ? ' · silenced' : a.severity ? ` · ${a.severity}` : ''}`, on: a.silenced, id: `alert:${a.id}`, act: !a.silenced && src.canSilence ? silence(a) : undefined }));
      const worst = live.sort((a, b) => alertLevel(b) - alertLevel(a))[0], level = worst ? alertLevel(worst) : 0;
      return { kind: 's', segs, ids: [hostId(host), 'alerts'], big: live.length ? `${live.length} firing` : 'Silenced', label: listOf(mine.map((a) => a.name)),
        alert: worst && level ? { level, big: worst.name, label: worst.severity || 'firing', fail: live.map((a) => mine.indexOf(a)), why: worst.summary || `${worst.name} is firing on ${hostName(host)}`,
          verb: src.canSilence ? t.silence : t.gotIt, acts: src.canSilence ? [silence(worst)] : [] } : undefined };
    } });
    return { id: hostId(host), title: hostName(host), channels };
  });
}
