// A CameraSource as the PulseHost the board reads: the roads' systems bound to
// the source, every camera, disruption and corridor as a thing, every camera
// an object of its own (opened from a list), a clip as the only action.

import type { Action, Changed, PulseHost, System } from '@zumer/pulse';
import { cameraObject, placeOf, systemsOf, type System as AppSystem } from './model.ts';
import type { Act, CameraSource } from './source.ts';
import { stillOf } from './model.ts';

const NAMES: Record<string, string> = { cameras: 'TfL JamCams', disruptions: 'TfL road disruptions', roads: 'TfL corridors' };

export function hostOf(src: CameraSource): PulseHost {
  const bind = (sys: AppSystem): System => ({
    id: sys.id, title: sys.title,
    channels: sys.channels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: () => ch.read(src) })),
  });
  const dis = (id: string) => src.disruptions.find((d) => d.id === id);
  const road = (id: string) => (id.startsWith('road:') ? src.roads.find((r) => `road:${r.id}` === id) : undefined);
  return {
    get status() { return src.status; },
    get error() { return src.error; },
    get hasData() { return src.cameras.size > 0 || src.disruptions.length > 0; },
    systems: systemsOf().map(bind),
    // A disruption appearing or a corridor changing is news; a still changing is not.
    onChange: (fn: (changed: Changed[]) => void) => src.onChange((ids) => fn(ids.map((id) => ({ id, logged: !!dis(id) || !!road(id) })))),
    onStatus: (fn) => src.onStatus(fn),
    act: (a: Action) => src.act(a as Act),
    nameOf: (id) => src.cameras.get(id)?.name ?? (dis(id) ? `${dis(id)!.subCategory || dis(id)!.category} · ${placeOf(dis(id)!)}` : road(id)?.name ?? NAMES[id] ?? id),
    stateOf: (id) => {
      const c = src.cameras.get(id);
      if (c) return c.available ? stillOf(src, c).text || 'on' : 'switched off';
      const d = dis(id);
      if (d) return `${d.severity.toLowerCase()}${d.closure ? ' · closed' : ''}`;
      const r = road(id);
      if (r) return r.description.toLowerCase();
      if (id === 'cameras') return `${src.cameras.size} cameras`;
      if (id === 'disruptions') return `${src.disruptions.length} disruptions`;
      return '';
    },
    changedAt: (id) => src.stills.get(id) || dis(id)?.modified || undefined,
    whereIs: (id) => src.cameras.get(id)?.view || undefined,
    url: (path) => path,
    // A camera tapped in a list: its own object, the picture, what is near, the street map.
    objectOf: (id) => { const sys = cameraObject(src, id); return sys ? bind(sys) : null; },
  };
}
