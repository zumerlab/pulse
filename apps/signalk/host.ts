// A VesselSource as the PulseHost the board reads: the systems of `model.ts`
// bound to the source, every path as a thing, the server's PUTs as actions,
// and the words for a path (its name, its value in a skipper's units).

import { changesOf, hourly, num, type Action, type Changed, type PulseHost, type System } from '@zumer/pulse';
import { AIS, bar, celsius, compass, deg, fromBoat, hpa, kn, litres, lph, NM, rpm, systems } from './model.ts';
import type { Act, VesselSource } from './source.ts';

// A path's leaf as a name: "stateOfCharge" → "state of charge", with its parent when that tells it apart.
const humanize = (path: string) => {
  const parts = path.split('.'), leaf = parts.at(-1) ?? path, parent = parts.length > 2 ? parts.at(-2) : '';
  const words = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return parent && !/^\d+$/.test(parent) ? `${words(parent)} ${words(leaf)}` : words(leaf);
};

// The value of a path in words, by its unit: SI in, a skipper's units out.
export function textOf(value: unknown, units?: string) {
  if (typeof value !== 'number') return typeof value === 'object' && value ? JSON.stringify(value) : String(value ?? '');
  switch (units) {
    case 'm/s': return `${num(kn(value), 1)} kn`;
    case 'rad': return `${num(deg(value), 0)}°`;
    case 'K': return `${num(celsius(value), 1)}°C`;
    case 'Pa': return value > 50_000 && value < 120_000 ? `${num(hpa(value), 1)} hPa` : `${num(bar(value), 2)} bar`;
    case 'ratio': return `${num(value * 100, 0)}%`;
    case 'm3': return `${num(litres(value), 0)} L`;
    case 'm3/s': return `${num(lph(value), 1)} L/h`;
    case 'Hz': return `${num(rpm(value), 0)} rpm`;
    case 's': return value >= 3600 ? `${num(value / 3600, 1)} h` : `${num(value / 60, 0)} min`;
    case undefined: case '': return num(value, 2);
    default: return `${num(value, 2)} ${units}`;
  }
}
// What the day ring reads: the same conversions, as numbers.
const convert = (value: number, units?: string) => units === 'm/s' ? kn(value) : units === 'rad' ? deg(value) : units === 'K' ? celsius(value) : units === 'Pa' ? (value > 50_000 ? hpa(value) : bar(value))
  : units === 'ratio' ? value * 100 : units === 'Hz' ? rpm(value) : value;
const unitOf = (units?: string) => ({ 'm/s': 'kn', rad: '°', K: '°C', Pa: 'hPa', ratio: '%', m3: 'L', Hz: 'rpm' } as Record<string, string>)[units ?? ''] ?? units ?? '';

export function hostOf(src: VesselSource): PulseHost {
  const bound: System[] = systems.map((sys) => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src) })),
  }));
  const units = (path: string) => src.meta.get(path)?.units;
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.values.size > 0; },
    systems: bound,
    // A notification or the autopilot changing is worth a line in the ticker; a number moving every second is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((paths) => fn(paths.map((p) => ({ id: p, logged: p.startsWith('notifications.') || typeof src.values.get(p)?.value === 'string' })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => id.startsWith(AIS) ? src.others.get(id.slice(AIS.length))?.name ?? id.slice(AIS.length) : src.meta.get(id)?.displayName ?? humanize(id),
    stateOf: (id) => {
      if (id.startsWith(AIS)) {
        const o = src.others.get(id.slice(AIS.length)), pos = src.values.get('navigation.position')?.value as { latitude?: number; longitude?: number } | undefined;
        if (!o || typeof pos?.latitude !== 'number' || typeof pos?.longitude !== 'number') return '';
        const at = fromBoat({ latitude: pos.latitude, longitude: pos.longitude }, o);
        return `${num(at.m / NM, 1)} nm ${compass(at.bearing)}${o.sog != null ? ` · ${num(kn(o.sog), 0)} kn` : ''}`;
      }
      const v = src.values.get(id)?.value;
      if (id.startsWith('notifications.') && v && typeof v === 'object') { const n = v as { state?: string; message?: string }; return n.message ? `${n.state}: ${n.message}` : n.state ?? ''; }
      return textOf(v, units(id));
    },
    changedAt: (id) => id.startsWith(AIS) ? src.others.get(id.slice(AIS.length))?.at : src.values.get(id)?.at,
    unitOf: (id) => unitOf(units(id)),
    url: (path) => path,
    history: async (id, hours) => hourly(((await src.history([id], hours))[id] ?? []).map((r) => ({ s: String(convert(Number(r.s), units(id))), lu: r.lu })), hours),
    changes: async (ids, hours) => {
      const rows = await src.history(ids, hours);
      return Object.fromEntries(ids.map((id) => [id, changesOf(rows[id] ?? [], hours)]));
    },
  };
}
