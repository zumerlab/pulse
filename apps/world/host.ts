// A WorldSource as the PulseHost the board reads: the systems of `model.ts`
// bound to the source, every thing id as a thing, the words for a thing (its
// name, its state), and each event (a quake, a cyclone, a flood, a fire, a
// volcano) as an object of its own, opened from a list.

import { num, type Action, type Changed, type PulseHost, type System } from '@zumer/pulse';
import { agoText, hazardIn, hazardObject, mag, quakeIn, quakeObject, systemsFor, titleOf, type System as WorldSystem } from './model.ts';
import type { Act, WorldSource } from './source.ts';

export function hostOf(src: WorldSource): PulseHost {
  const bind = (sys: WorldSystem): System => ({ id: sys.id, title: sys.title, channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.things) })) });
  const bound = systemsFor(src.where).map(bind);
  const stateOf = (id: string) => {
    const q = quakeIn(src.things, id);
    if (q) return `M ${mag(q.mag)} · ${agoText(q.time)}`;
    const e = hazardIn(src.things, id, src.where);
    if (e) return `${e.alert.split(' ')[0].toLowerCase()} · ${e.country} · ${agoText(e.to)}`;
    const th = src.things.get(id);
    if (!th) return '';
    // The lists: how many they hold.
    if (id.startsWith('gdacs.') || id === 'usgs.volcanoes') return `${th.state} now`;
    return th.unit ? `${num(Number(th.state), 1)} ${th.unit}` : String(th.state);
  };
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.things.size > 0; },
    systems: bound,
    // An event arriving is an alert when it matters (the board logs those); the numbers drifting are not worth a line.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((things) => fn(things.map((th) => ({ id: th.id, logged: false })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => {
      const e = hazardIn(src.things, id, src.where);
      return src.things.get(id)?.name ?? quakeIn(src.things, id)?.place ?? (e ? titleOf(e) : id.replace(/^[a-z]+\./, '').replace(/[_-]/g, ' '));
    },
    stateOf,
    changedAt: (id) => src.things.get(id)?.changed ?? quakeIn(src.things, id)?.time ?? hazardIn(src.things, id, src.where)?.to,
    unitOf: (id) => src.things.get(id)?.unit ?? '',
    url: (path) => path,
    // An event tapped in a list: its own object.
    objectOf: (id) => {
      const sys = quakeObject(src.things, id, src.where) ?? hazardObject(src.things, id, src.where);
      return sys && bind(sys);
    },
  };
}
