// An IssSource as the PulseHost the board reads: the station's systems bound
// to the source, every PUI as a thing named by NASA's table, a launch as an
// object of its own (opened from a list), a link as the only action.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { launchObject, launchOf, LAUNCH, systemsOf, type System as AppSystem } from './model.ts';
import type { Act, IssSource } from './source.ts';
import { PUIS, textOf } from './telemetry.ts';
import { t } from './strings.ts';

const NAMES: Record<string, string> = { position: 'ISS position', signal: 'Signal', crew: 'Crew', docked: 'Docked vehicles', launches: 'Launch Library', place: 'Your place' };

export function hostOf(src: IssSource): PulseHost {
  const bind = (sys: AppSystem): System => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (ctx) => ch.read(src, ctx) })),
  });
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.samples.size > 0 || !!src.position || src.launches.length > 0; },
    systems: systemsOf().map(bind),
    // A state that changes (a mode, a gyroscope, the signal, who is docked) is news; a number drifting is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((ids) => fn(ids.map((id) => ({ id, logged: !!PUIS[id]?.states || id === 'signal' || id === 'docked' || id === 'crew' })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => PUIS[id]?.name ?? launchOf(src, id)?.name ?? NAMES[id] ?? id,
    stateOf: (id) => {
      if (PUIS[id]) return textOf(src.samples.get(id), 2);
      const l = launchOf(src, id);
      if (l) return `${t.countdown(l.net - Date.now())} · ${l.status.toLowerCase()}`;
      if (id === 'signal') return src.signal ? (src.signal.aos ? 'signal' : 'loss of signal') : '';
      if (id === 'position' && src.position) return `${src.position.lat.toFixed(2)}, ${src.position.lon.toFixed(2)} · ${Math.round(src.position.alt)} km`;
      if (id === 'crew') return src.station ? `${src.station.aboard} aboard` : '';
      if (id === 'docked') return src.station ? src.station.docked.map((d) => d.vehicle).join(', ') : '';
      return '';
    },
    changedAt: (id) => src.samples.get(id)?.at ?? (id === 'signal' ? src.signal?.at : id === 'position' ? src.position?.at : id.startsWith(LAUNCH) ? launchOf(src, id)?.net : undefined),
    unitOf: (id) => PUIS[id]?.unit ?? '',
    url: (path) => path,
    // A launch tapped in a list: its own object, the countdown, the pad on the map, the mission.
    objectOf: (id) => { const sys = launchObject(src, id); return sys ? bind(sys) : null; },
  };
}
