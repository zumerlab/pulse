// A recorded pass as a source: ten seconds of the station recorded on
// November 5, 2026 (`recording.json`, made by `scripts/record.mjs`), the
// telemetry as the raw lines the server sent, through the same decoder and
// parsers as the live one, moved to now. Four things are made to call, and
// said here: Node 3's CO₂ is set to 4.6 mmHg, the gyroscopes' momentum to 83%,
// and the Falcon 9 of the list launches in 38 minutes; wing 3B had no voltage
// in the recording already. Then the station flies along its track, the
// alpha joint turns and the momentum creeps up, every two seconds.

import { launchesOf, positionOf, stationOf, expeditionOf, trackOf } from '../feeds.ts';
import { decodeUpdate } from '../lightstreamer.ts';
import { BaseSource, DEFAULT_PLACE, type IssSource } from '../source.ts';
import { t } from '../strings.ts';
import recording from './recording.json';

const HOUR = 3_600_000;
type Line = [number, string];

export class DemoSource extends BaseSource implements IssSource {
  readonly place = DEFAULT_PLACE;
  private timer = 0;
  private shift = 0;      // from the recording's moment to now

  get label() { return t.demoLabel; }

  start() {
    this.stop();
    const now = Date.now();
    this.shift = now - recording.at;
    this.samples.clear(); this.history.clear(); this.signal = null;
    // The telemetry: each line decoded over the item's last values, its time stamp moved to now.
    const { items, fields, lines } = recording.telemetry as unknown as { items: string[]; fields: string[]; lines: Line[] };
    const last = new Map<number, (string | null)[]>();
    for (const [, line] of lines) {
      const m = /^U,\d+,(\d+),(.*)$/s.exec(line), item = Number(m?.[1]), name = items[item - 1];
      if (!m || !name) continue;
      const values = decodeUpdate(m[2], last.get(item) ?? [], fields.length);
      last.set(item, values);
      const f = Object.fromEntries(fields.map((k, i) => [k, values[i]]));
      if (f.TimeStamp) f.TimeStamp = String(Number(f.TimeStamp) + this.shift / HOUR);
      this.take(name, f);
    }
    this.signal = { aos: true, at: now - 12 * 60_000 };
    this.set('NODE3000003', 4.6, now - 20 * 60_000);
    this.set('USLAB000010', 83.2, now);
    // Where it is and where it goes, moved to now.
    const p = positionOf(recording.position);
    this.position = p && { ...p, at: p.at + this.shift };
    this.track = trackOf(recording.track).map((q) => ({ ...q, at: q.at + this.shift }));
    // Who is aboard and what is docked, as recorded.
    const st = stationOf(recording.station, now);
    if (st && recording.expedition) Object.assign(st, expeditionOf(recording.expedition, now));
    this.station = st;
    // The launches, moved to now, the Falcon 9 brought to within the hour.
    this.launches = launchesOf(recording.launches).map((l) => ({ ...l, net: l.net + this.shift, windowEnd: l.windowEnd + this.shift }));
    const falcon = this.launches.find((l) => l.rocket.startsWith('Falcon 9'));
    if (falcon) falcon.net = now + 38 * 60_000;
    this.launches.sort((a, b) => a.net - b.net);
    this.setStatus('live');
    this.emit([...this.samples.keys(), 'signal', 'position', 'crew', 'docked', 'launches', ...this.launches.map((l) => `launch:${l.id}`)]);
    this.startClock();
    this.timer = window.setInterval(() => this.tick(), 2000);
  }
  stop() { clearInterval(this.timer); this.stopClock(); this.samples.clear(); this.position = null; this.track = []; this.station = null; this.launches = []; this.setStatus('signed-out'); }

  private set(id: string, value: number, at: number) {
    this.take(id, { TimeStamp: String((at - Date.UTC(new Date(at).getUTCFullYear(), 0, 0)) / HOUR), Value: String(value), 'Status.Class': '24' }, new Date(at).getUTCFullYear());
  }

  // The station flies on: its point slides along the track, the port joint follows the sun, the momentum creeps up.
  private tick() {
    const now = Date.now(), changed: string[] = [];
    if (this.position && this.track.length) {
      const pts = [{ ...this.position }, ...this.track].sort((a, b) => a.at - b.at);
      const i = pts.findIndex((q) => q.at > now);
      if (i > 0) {
        const a = pts[i - 1], b = pts[i], k = (now - a.at) / (b.at - a.at);
        let dl = b.lon - a.lon; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
        this.position = { ...this.position, lat: a.lat + (b.lat - a.lat) * k, lon: ((a.lon + dl * k + 540) % 360) - 180, at: now, daylight: k < 0.5 ? a.daylight : b.daylight };
        changed.push('position');
      }
    }
    const port = this.samples.get('S0000004');
    if (port?.value != null) { this.set('S0000004', (port.value + 0.13) % 360, now); changed.push('S0000004'); }
    const m = this.samples.get('USLAB000010');
    if (m?.value != null) { this.set('USLAB000010', Math.min(99, m.value + 0.01), now); changed.push('USLAB000010'); }
    this.emit(changed);
  }
}
