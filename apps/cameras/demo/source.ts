// A recorded evening as a source: TfL's cameras, disruptions and corridors as
// they were on November 5, 2026 at 17:50 (`recording.json`, made by
// `scripts/record.mjs`), through the same parsers as the live ones and moved
// to now, and the stills of the cameras that watched an incident
// (`public/demo/`), so the pictures are the ones of that moment: the fire
// engines on Seven Sisters Road among them. Nothing is made up: the camera
// that calls, on Westhorne Avenue, was switched off over a breakdown that
// evening. The rest of the cameras' stills are asked of TfL.

import { camerasOf, disruptionsOf, roadsOf } from '../feeds.ts';
import { BaseSource, type CameraSource } from '../source.ts';
import { t } from '../strings.ts';
import recording from './recording.json';

type Still = { file: string; modified: number } | 0;

export class DemoSource extends BaseSource implements CameraSource {
  get label() { return t.demoLabel; }

  start() {
    const now = Date.now(), shift = now - recording.at;
    const stills = recording.stills as Record<string, Still>;
    this.cameras.clear(); this.stills.clear();
    for (const c of camerasOf(recording.cameras)) {
      const still = stills[c.id];
      this.cameras.set(c.id, still ? { ...c, image: `${import.meta.env.BASE_URL}demo/${still.file}` } : c);
      if (still !== undefined) this.stills.set(c.id, still ? still.modified + shift : 0);
    }
    this.disruptions = disruptionsOf(recording.disruptions).map((d) => ({ ...d, start: d.start + shift, end: d.end + shift, modified: d.modified + shift }));
    this.roads = roadsOf(recording.roads);
    this.setStatus('live');
    this.emit(['cameras', 'disruptions', 'roads', ...this.cameras.keys(), ...this.disruptions.map((d) => d.id)]);
  }
  stop() { this.cameras.clear(); this.disruptions = []; this.roads = []; this.stills.clear(); this.setStatus('signed-out'); }
}
