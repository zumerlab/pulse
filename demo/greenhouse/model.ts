// The greenhouse as systems. A system is a title and two to four channels; a
// channel reads the things into a Reading, or returns null when there is
// nothing to read. Nothing here changes anything: every control is an Action
// handed back to the greenhouse, which runs it.

import { listOf, num, type Reading, type Seg } from '@zumer/pulse';
import { LAMPS, VENTS, ZONES, type Act, type Greenhouse } from './source.ts';

export type Channel = { key: string; name: string; glyph: string; read: (g: Greenhouse) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

// Glyphs: SVG paths on a 24×24 grid, drawn with a 2 px stroke.
const glyph = {
  thermometer: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  wind: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8a2 2 0 1 1-2 2',
  tank: 'M5 4h14v16H5z M5 11c2-1.5 4 1.5 7 0s5-1.5 7 0 M5 15c2-1.5 4 1.5 7 0s5-1.5 7 0',
  sprinkler: 'M12 21v-7 M6 14h12 M12 14c-3 0-5-3-5-6 M12 14c3 0 5-3 5-6 M12 14V5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 3',
  lamp: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  leaf: 'M5 20C5 11 10 5 19 4c0 9-5 15-14 16z M5 20c3-5 7-9 11-12',
};

// The heater's dial: what the band of the temperature ring spans.
const HEATER = { min: 10, max: 35 };

// A switch's segment: tapping it flips the thing.
const flip = (g: Greenhouse, id: string, on: string): Seg => {
  const th = g.things.get(id)!;
  return { label: th.name, on: th.state === on, id, act: { ids: [id], do: 'flip' } as Act };
};
// A choice's segment: tapping it picks that value for the thing.
const choose = (g: Greenhouse, id: string, value: string, label: string): Seg =>
  ({ label, on: g.is(id, value), id, act: { ids: [id], do: 'choose', value } as Act });
// The chosen option of a choice, as its label.
const chosen = (g: Greenhouse, id: string, options: [string, string][]) =>
  (options.find(([v]) => g.is(id, v)) ?? options[0])[1];
const names = (g: Greenhouse, ids: string[]) => listOf(ids.map((id) => g.things.get(id)!.name.toLowerCase()));

const WATERING: [string, string][] = [['off', 'Off'], ['dawn', 'Dawn'], ['dusk', 'Dusk'], ['both', 'Dawn and dusk']];
const STAGES: [string, string][] = [['seedling', 'Seedling'], ['growing', 'Growing'], ['bloom', 'Bloom']];

export const systems: System[] = [
  { id: 'climate', title: 'Climate', channels: [
    { key: 'air', name: 'Temperature', glyph: glyph.thermometer, read: (g) => {
      const air = g.number('air.temperature'), target = g.number('air.target');
      const closed = VENTS.filter((id) => g.is(id, 'closed'));
      return {
        kind: 'p', v: (target - HEATER.min) / (HEATER.max - HEATER.min), now: air,
        dial: { ...HEATER, step: 0.5, unit: '°', label: 'heater target', value: target, id: 'air.target',
          set: (value) => ({ ids: ['air.target'], do: 'set', value }) as Act },
        big: `${num(air)}°`, label: `target ${num(target)}°`,
        ids: ['air.temperature', 'air.target'],
        history: 'air.temperature',
        alert: air > 30 ? {
          level: 1, key: 'warm', big: `${num(air)}°`, label: 'too warm', why: `The air is at ${num(air)}°, over 30°`,
          verb: closed.length ? 'Open the vents' : 'Noted',
          acts: closed.map((id) => ({ ids: [id], do: 'flip' }) as Act),
        } : undefined,
      };
    } },
    { key: 'humidity', name: 'Humidity', glyph: glyph.drop, read: (g) => {
      const h = g.number('air.humidity');
      return { kind: 'p', v: h / 100, big: `${num(h, 0)}%`, label: 'relative humidity', ids: ['air.humidity'], history: 'air.humidity' };
    } },
    { key: 'vents', name: 'Vents', glyph: glyph.wind, read: (g) => {
      const open = VENTS.filter((id) => g.is(id, 'open'));
      return {
        kind: 's', segs: VENTS.map((id) => flip(g, id, 'open')),
        big: `${open.length} of ${VENTS.length}`, label: open.length ? `${names(g, open)} open` : 'all closed',
        ids: VENTS,
      };
    } },
  ] },
  { id: 'water', title: 'Water', channels: [
    { key: 'tank', name: 'Tank', glyph: glyph.tank, read: (g) => {
      const level = g.number('tank.level'), on = ZONES.filter((id) => g.is(id, 'on'));
      return {
        kind: 'p', v: level / 100, big: `${num(level, 0)}%`, label: 'rain tank', ids: ['tank.level'],
        history: 'tank.level',
        alert: level < 15 ? {
          level: 2, key: 'tank', big: `${num(level, 0)}%`, label: 'tank',
          why: `Down to ${num(level, 0)}%${on.length ? `, with ${names(g, on)} watering` : ''}`,
          verb: 'Refill', acts: [{ ids: ['tank.level'], do: 'refill' } as Act],
        } : undefined,
      };
    } },
    { key: 'zones', name: 'Zones', glyph: glyph.sprinkler, read: (g) => {
      const on = ZONES.filter((id) => g.is(id, 'on'));
      return {
        kind: 's', segs: ZONES.map((id) => flip(g, id, 'on')),
        big: `${on.length} of ${ZONES.length}`, label: on.length ? `${names(g, on)} watering` : 'nothing watering',
        ids: ZONES,
      };
    } },
    { key: 'when', name: 'Watering', glyph: glyph.clock, read: (g) => ({
      kind: 'c', segs: WATERING.map(([v, label]) => choose(g, 'water.when', v, label)),
      big: chosen(g, 'water.when', WATERING), label: 'every day', ids: ['water.when'],
    }) },
  ] },
  { id: 'light', title: 'Light', channels: [
    { key: 'lamps', name: 'Lamps', glyph: glyph.lamp, read: (g) => {
      const on = LAMPS.filter((id) => g.is(id, 'on'));
      return {
        kind: 's', segs: LAMPS.map((id) => flip(g, id, 'on')),
        big: `${on.length} of ${LAMPS.length}`, label: on.length ? `${names(g, on)} on` : 'both off',
        ids: LAMPS,
      };
    } },
    { key: 'stage', name: 'Stage', glyph: glyph.leaf, read: (g) => ({
      kind: 'c', segs: STAGES.map(([v, label]) => choose(g, 'light.stage', v, label)),
      big: chosen(g, 'light.stage', STAGES), label: 'growth stage', ids: ['light.stage'],
    }) },
  ] },
];
