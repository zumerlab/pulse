// A FleetSource as the PulseHost the board reads: the fleet's systems bound
// to the source, every vehicle as a thing, the lines as the gear's groups and
// the vehicles as the board's other axis, and the words for a vehicle.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { groupsOf, isVehicle, lateBy, mmss, nameOf, systems, vehicleId, vehicleSystems } from './model.ts';
import type { Act, FleetSource } from './source.ts';
import { t } from './strings.ts';

export function hostOf(src: FleetSource): PulseHost {
  const bound: System[] = systems.map((sys) => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.vehicles) })),
  }));
  const vehicle = (id: string) => (isVehicle(id) ? src.vehicles.get(vehicleId(id)) : undefined);
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.vehicles.size > 0; },
    systems: bound,
    // A vehicle moving is never news; the ticker stays quiet for a fleet.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((ids) => fn(ids.map((id) => ({ id: isVehicle(id) ? id : `veh:${id}`, logged: false })))),
    onStatus: (fn) => src.onStatus(fn),
    // The lines and their vehicles change as journeys start and end.
    onStructure: (fn) => src.onChange(() => fn()),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => { const v = vehicle(id); return v ? nameOf(v) : id.startsWith('line:') ? `Line ${id.slice(5)}` : id; },
    whereIs: (id) => { const v = vehicle(id); return v ? `to ${v.headsign || v.route}` : undefined; },
    stateOf: (id) => {
      const v = vehicle(id);
      if (!v) return '';
      const late = lateBy(v);
      return late ? t.late(mmss(late)) : v.dl != null && v.dl > 0 ? t.early(mmss(v.dl)) : t.onTime;
    },
    changedAt: (id) => vehicle(id)?.at,
    url: (path) => path,
    groups: () => groupsOf(src.vehicles),
    byGroup: (chosen, hidden) => vehicleSystems(src.vehicles, chosen, hidden).map((sys) => ({
      id: sys.id, title: sys.title,
      channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src.vehicles) })),
    })),
  };
}
