// A WorldSource as the PulseHost the board reads: the systems of `model.ts`
// bound to the source, every thing id as a thing, the words for a thing (its
// name, its state with its unit), a day of the things whose feed keeps one,
// and each quake of the day as an object of its own, opened from a list.

import { hourly, num, type Action, type Changed, type PulseHost, type System } from '@zumer/pulse';
import { agoText, quakeIn, quakeObject, systemsFor } from './model.ts';
import type { Act, WorldSource } from './source.ts';

export function hostOf(src: WorldSource): PulseHost {
  const bound: System[] = systemsFor(src.services).map((sys) => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.things) })),
  }));
  const stateOf = (id: string) => {
    const q = quakeIn(src.things, id);
    if (q) return `M ${num(q.mag, 1)} · ${agoText(q.time)}`;
    const th = src.things.get(id);
    if (!th) return '';
    if (id.startsWith('service.')) return String(th.attrs.description ?? th.state);
    const v = typeof th.state === 'number' ? num(th.state, 2) : th.state;
    return th.unit ? `${v}${th.unit === '%' || th.unit.startsWith('°') ? '' : ' '}${th.unit}` : v;
  };
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.things.size > 0; },
    systems: bound,
    // A scale moving or a service changing its word is worth a line in the ticker; a number drifting is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((things) => fn(things.map((th) => ({ id: th.id, logged: typeof th.state !== 'number' || th.id.startsWith('sun.g') || th.id.startsWith('sun.r') || th.id.startsWith('sun.s') })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => src.things.get(id)?.name ?? quakeIn(src.things, id)?.place ?? id.replace(/^[a-z]+\./, '').replace(/[_-]/g, ' '),
    stateOf,
    changedAt: (id) => src.things.get(id)?.changed,
    unitOf: (id) => src.things.get(id)?.unit ?? '',
    url: (path) => path,
    history: async (id, hours) => hourly((await src.history([id], hours))[id] ?? [], hours),
    // A quake tapped in a list: its own object.
    objectOf: (id) => {
      const sys = quakeObject(src.things, id, src.where);
      return sys && { id: sys.id, title: sys.title, channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.things) })) };
    },
  };
}
