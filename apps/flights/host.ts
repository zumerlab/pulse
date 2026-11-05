// A SkySource as the PulseHost the board reads: the sky's systems bound to
// the source, every aircraft as a thing and as an object of its own (opened
// from a list), the categories as the gear's groups and the region's aircraft
// as the board's other axis, a link as the action.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { AC, aircraftObject, aircraftSystems, groupsOf, systemsOf } from './model.ts';
import type { Act, SkySource } from './source.ts';

// The sky within the groups in force: the region's aircraft of those kinds
// (the gear keeps some, or the board reads one kind as an object of its
// own), their squawks; what is in no group (a squawk far away, the whole
// sky) does not count there.
function within(src: SkySource, groups: string[] | null): SkySource {
  if (!groups) return src;
  const keep = new Set(groups);
  const aircraft = new Map([...src.aircraft].filter(([hex]) => keep.has(hex)));
  const emergencies = new Set([...src.emergencies].filter((hex) => keep.has(hex)));
  return new Proxy(src, { get: (target, key) => (key === 'aircraft' ? aircraft : key === 'emergencies' ? emergencies : key === 'sky' ? null : key === 'scoped' ? true : Reflect.get(target, key)) });
}

export function hostOf(src: SkySource): PulseHost {
  const bind = (sys: { id: string; title: string; channels: { key: string; name: string; glyph: string; read: (s: SkySource) => ReturnType<System['channels'][number]['read']> }[] }): System => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (ctx) => ch.read(within(src, ctx?.groups ?? null)) })),
  });
  const ac = (id: string) => (id.startsWith(AC) ? src.aircraft.get(id.slice(AC.length)) : undefined);
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.aircraft.size > 0 || !!src.sky; },
    systems: systemsOf(src).map(bind),
    // An emergency appearing is news; an aircraft moving is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((ids) => fn(ids.map((id) => ({ id: id === 'emergencies' || id === 'sky' ? id : AC + id, logged: id === 'emergencies' })))),
    onStatus: (fn) => src.onStatus(fn),
    onStructure: (fn) => src.onChange(() => fn()),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => { const a = ac(id); return a ? `${a.flight}${a.type ? ` (${a.type})` : ''}` : id === 'emergencies' ? 'Emergency squawks' : id === 'sky' ? 'OpenSky' : id; },
    whereIs: (id) => { const a = ac(id); return a?.dst != null ? `${Math.round(a.dst)} nm` : undefined; },
    stateOf: (id) => {
      const a = ac(id);
      if (a) return a.ground ? 'on the ground' : `${a.alt != null ? `${Math.round(a.alt).toLocaleString()} ft` : ''}${a.gs != null ? ` · ${Math.round(a.gs)} kn` : ''}${a.squawk ? ` · ${a.squawk}` : ''}`.replace(/^ · /, '');
      if (id === 'emergencies') return `${src.emergencies.size} squawking`;
      if (id === 'sky') return src.sky ? `${src.sky.airborne.toLocaleString()} airborne` : '';
      return '';
    },
    changedAt: (id) => ac(id)?.at ?? (id === 'sky' ? src.sky?.at : undefined),
    url: (path) => path,
    groups: () => groupsOf(src),
    byGroup: (chosen, hidden) => aircraftSystems(src, chosen, hidden).map(bind),
    // An aircraft tapped in a list or on a ring: its own object, the same as on the groups axis.
    objectOf: (id) => { const sys = aircraftObject(src, id); return sys ? bind(sys) : null; },
  };
}
