// The greenhouse as the PulseHost the board reads: the systems of `model.ts`
// bound to it, its things named, its actions run, a day of a thing on request.

import { num, type PulseHost, type System } from '@zumer/pulse';
import { systems } from './model.ts';
import type { Act, Greenhouse } from './source.ts';

export function hostOf(g: Greenhouse): PulseHost {
  const bound: System[] = systems.map((sys) => ({
    ...sys, channels: sys.channels.map((ch) => ({ ...ch, read: () => ch.read(g) })),
  }));
  return {
    get status() { return g.status; },
    error: '',
    hasData: true,
    systems: bound,
    // A word changing (a vent opened, a zone started) is worth a line in the
    // log; a number moving every two seconds is not.
    onChange: (fn) => g.onChange((ids) => fn(ids.map((id) => ({ id, logged: typeof g.things.get(id)?.state === 'string' })))),
    onStatus: (fn) => g.onStatus(fn),
    act: (a) => g.act(a as Act),
    nameOf: (id) => g.things.get(id)?.name ?? id,
    stateOf: (id) => {
      const th = g.things.get(id);
      return th ? `${typeof th.state === 'number' ? num(th.state) : th.state}${th.unit}` : '';
    },
    changedAt: (id) => g.things.get(id)?.changed,
    unitOf: (id) => g.things.get(id)?.unit ?? '',
    url: (path) => path,
    history: async (id, hours) => g.history(id, hours),
  };
}
