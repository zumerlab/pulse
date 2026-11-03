// A SwarmSource as the PulseHost the board reads: the swarm's systems bound
// to the source, every drone as a thing, the types as the gear's groups and
// the drones as the board's other axis, the commands as actions.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { DRONE, droneSystems, groupsOf, nameOf, systems, sysidOf } from './model.ts';
import type { Act, SwarmSource } from './source.ts';
import { t } from './strings.ts';

export function hostOf(src: SwarmSource): PulseHost {
  const bind = (sys: { id: string; title: string; channels: { key: string; name: string; glyph: string; read: (d: SwarmSource['drones']) => ReturnType<System['channels'][number]['read']> }[] }): System => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.drones) })),
  });
  const drone = (id: string) => (id.startsWith(DRONE) ? src.drones.get(sysidOf(id)) : undefined);
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.drones.size > 0; },
    systems: systems.map(bind),
    // A mode or an arming changing is news; a position every half second is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((sysids) => fn(sysids.map((s) => ({ id: DRONE + s, logged: false })))),
    onStatus: (fn) => src.onStatus(fn),
    onStructure: (fn) => src.onChange(() => fn()),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => { const d = drone(id); return d ? nameOf(d) : id; },
    stateOf: (id) => { const d = drone(id); return d ? `${t.modes[d.mode] ?? d.mode}${d.armed ? ', armed' : ''}${d.battery != null ? ` · ${Math.round(d.battery)}%` : ''}` : ''; },
    changedAt: (id) => drone(id)?.seen,
    url: (path) => path,
    groups: () => groupsOf(src.drones),
    byGroup: (chosen, hidden) => droneSystems(src.drones, chosen, hidden).map(bind),
  };
}
