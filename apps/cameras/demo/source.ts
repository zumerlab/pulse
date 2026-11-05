// A city as recorded: its feeds' answers (`recording-<city>.json`, made by
// `scripts/record.mjs`) through the same parsers as the live ones, moved to
// now, and the stills of the cameras that watched an incident
// (`public/demo/<city>/`). Nothing is made up. London is the evening of
// November 5, 2026 at 17:50: a building fire closing Seven Sisters Road with
// the fire engines on the nearest camera, and a camera on Westhorne Avenue
// switched off over a breakdown. The Bay Area is the same day at 13:17
// Pacific: the CHP's incidents and the signs as they were, the cameras' live
// streams as they are now (a stream plays only online; its recorded still
// stands in). The other cameras' stills are asked of their feeds.

import { camerasOf, disruptionsOf, roadsOf } from '../feeds.ts';
import { caCamerasOf, chpOf, signsOf } from '../feeds-ca.ts';
import { BaseSource, type CameraSource } from '../source.ts';
import { t } from '../strings.ts';
import london from './recording-london.json';
import bayarea from './recording-bayarea.json';

type Still = { file: string; modified: number } | 0;

export class DemoSource extends BaseSource implements CameraSource {
  get label() { return t.demoLabel(this.city.name); }

  start() {
    const now = Date.now(), rec = this.city.id === 'london' ? london : bayarea, shift = now - rec.at;
    const stills = rec.stills as Record<string, Still>;
    this.cameras.clear(); this.stills.clear();
    const cameras = this.city.id === 'london' ? camerasOf(london.cameras) : caCamerasOf(bayarea.cameras);
    for (const c of cameras) {
      const still = stills[c.id];
      this.cameras.set(c.id, still ? { ...c, image: `${import.meta.env.BASE_URL}demo/${this.city.id}/${still.file}` } : c);
      if (still !== undefined) this.stills.set(c.id, still ? still.modified + shift : 0);
    }
    const shifted = (d: ReturnType<typeof disruptionsOf>[number]) => ({ ...d, start: d.start && d.start + shift, end: d.end && d.end + shift, modified: d.modified && d.modified + shift });
    if (this.city.id === 'london') {
      this.disruptions = disruptionsOf(london.disruptions).map(shifted);
      this.roads = roadsOf(london.roads);
    } else {
      this.disruptions = chpOf(bayarea.chp).map(shifted);
      this.signs = signsOf(bayarea.signs).map((x) => ({ ...x, at: x.at && x.at + shift }));
    }
    this.setStatus('live');
    this.emit(['cameras', 'disruptions', 'roads', 'signs', ...this.cameras.keys(), ...this.disruptions.map((d) => d.id)]);
  }
  stop() { this.cameras.clear(); this.disruptions = []; this.roads = []; this.signs = []; this.stills.clear(); this.setStatus('signed-out'); }
}
