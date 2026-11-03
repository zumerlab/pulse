// A PromSource as the PulseHost the board reads: the configuration's systems
// bound to the source, every host as a thing, the jobs as the gear's groups
// and the hosts as the board's other axis, the silence as the action.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { groupsOf, hostSystems, systemsOf } from './model.ts';
import { type Act, type PromSource, channelId } from './source.ts';

const bind = (src: PromSource, sys: { id: string; title: string; channels: { key: string; name: string; glyph: string; read: (s: PromSource) => ReturnType<System['channels'][number]['read']> }[] }): System => ({
  id: sys.id, title: sys.title,
  channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src) })),
});

export function hostOf(src: PromSource): PulseHost {
  // A channel's unit; a ratio when the configuration says nothing.
  const unitOf = (key: string) => src.config.systems.flatMap((s) => s.channels.map((c) => ({ id: channelId(s.id, c.key), c }))).find((x) => x.id === key)?.c.unit ?? 'ratio';
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.series.size > 0 || src.targets.size > 0; },
    systems: systemsOf(src).map((sys) => bind(src, sys)),
    // A target going down or an alert changing is news; a value moving is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((ids) => fn(ids.map((id) => ({ id, logged: id === 'alerts' })))),
    onStatus: (fn) => src.onStatus(fn),
    onStructure: (fn) => src.onChange(() => fn()),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => id.startsWith('host:') ? id.slice(5).replace(/:\d+$/, '') : id.startsWith('alert:') ? id.slice(6).replace(/@.*$/, '') : id,
    whereIs: (id) => id.startsWith('host:') ? src.targets.get(id.slice(5))?.job : undefined,
    stateOf: (id) => {
      if (id === 'alerts') return `${src.alerts.filter((a) => !a.silenced).length} firing`;
      if (id.startsWith('alert:')) { const a = src.alerts.find((x) => `alert:${x.id}` === id); return a ? (a.silenced ? 'silenced' : 'firing') : ''; }
      const tg = src.targets.get(id.slice(5));
      return tg ? (tg.up ? 'up' : 'down') : '';
    },
    changedAt: (id) => id.startsWith('host:') ? src.targets.get(id.slice(5))?.at : id === 'alerts' ? src.alerts.at(-1)?.since : undefined,
    url: (path) => path,
    // A host's day of a channel: "system/channel@host".
    history: async (id, hours) => {
      const at = id.lastIndexOf('@');
      if (at < 0) return [];
      const key = id.slice(0, at), unit = unitOf(key);
      const values = await src.history(key, id.slice(at + 1), hours);
      return values.map((v) => (v == null ? null : unit === 'ratio' ? v * 100 : v));
    },
    unitOf: (id) => { const at = id.lastIndexOf('@'); const u = at < 0 ? undefined : unitOf(id.slice(0, at)); return u === 'ratio' || u === 'percent' ? '%' : u === 'bytes/s' ? ' B/s' : u === 'bytes' ? ' B' : ''; },
    groups: () => groupsOf(src),
    byGroup: (chosen, hidden) => hostSystems(src, chosen, hidden).map((sys) => bind(src, sys)),
  };
}
