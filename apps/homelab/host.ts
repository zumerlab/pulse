// A MachineSource as the PulseHost the board reads: the systems of `model.ts`
// bound to the source, every thing id as a thing, the collector's actions as
// actions, and the words for a thing (its name, its state with its unit).

import { changesOf, hourly, type Action, type Changed, type PulseHost, type System } from '@zumer/pulse';
import { systems } from './model.ts';
import type { Act, MachineSource } from './source.ts';

export function hostOf(src: MachineSource): PulseHost {
  const bound: System[] = systems.map((sys) => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.things) })),
  }));
  const stateOf = (id: string) => {
    const th = src.things.get(id);
    if (!th) return '';
    const v = typeof th.state === 'number' ? String(Math.round(th.state * 100) / 100) : th.state;
    return th.unit ? `${v}${th.unit === '%' || th.unit.startsWith('°') ? '' : ' '}${th.unit}` : v;
  };
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.things.size > 0; },
    systems: bound,
    // A word changing (a container exiting, the internet going down) is worth a
    // line in the ticker; a number moving every few seconds is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((things) => fn(things.map((th) => ({ id: th.id, logged: typeof th.state !== 'number' && th.changed > Date.now() - 60_000 })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => src.things.get(id)?.name ?? id.replace(/^[a-z]+\./, '').replace(/_/g, ' '),
    stateOf,
    changedAt: (id) => src.things.get(id)?.changed,
    unitOf: (id) => src.things.get(id)?.unit ?? '',
    url: (path) => path,
    history: async (id, hours) => hourly((await src.history([id], hours))[id] ?? [], hours),
    changes: async (ids, hours) => {
      const rows = await src.history(ids, hours);
      return Object.fromEntries(ids.map((id) => [id, changesOf(rows[id] ?? [], hours)]));
    },
  };
}
