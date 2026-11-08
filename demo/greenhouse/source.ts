// A greenhouse that is not there. Its things, each with a name, a state, a
// unit and when it last changed; a clock that moves them a little every two
// seconds, the way a real one would; and the actions a controller would take,
// answered after a moment, like a real one. Nothing here knows about Pulse
// but the shape of an Action. A real source reads a serial port, an MQTT
// broker or an HTTP API instead, and keeps the same surface: things, a change
// event, a status, actions, a day of history.

import type { Action, Status } from '@zumer/pulse';

export type Thing = { id: string; name: string; state: number | string; unit: string; changed: number };
// What the greenhouse can do: set a target, flip a switch, pick one of a few
// words, refill the tank. `ids` is the core's: the things the action touches.
export type Act = Action & { do: 'set' | 'flip' | 'choose' | 'refill'; value?: number | string };

export const VENTS = ['vent.north', 'vent.south', 'vent.roof'];
export const ZONES = ['zone.beds', 'zone.pots', 'zone.trays'];
export const LAMPS = ['lamp.east', 'lamp.west'];

const thing = (id: string, name: string, state: number | string, unit = ''): [string, Thing] => [id, { id, name, state, unit, changed: Date.now() }];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

export class Greenhouse {
  readonly things = new Map<string, Thing>([
    thing('air.temperature', 'Air temperature', 23.4, '°C'),
    thing('air.target', 'Heater target', 24, '°C'),
    thing('air.humidity', 'Humidity', 62, '%'),
    thing('vent.north', 'North vent', 'closed'),
    thing('vent.south', 'South vent', 'closed'),
    thing('vent.roof', 'Roof vent', 'open'),
    thing('tank.level', 'Rain tank', 34, '%'),
    thing('zone.beds', 'Beds', 'on'),
    thing('zone.pots', 'Pots', 'off'),
    thing('zone.trays', 'Seed trays', 'off'),
    thing('water.when', 'Watering', 'dawn'),
    thing('lamp.east', 'East lamp', 'on'),
    thing('lamp.west', 'West lamp', 'on'),
    thing('light.stage', 'Growth stage', 'growing'),
  ]);
  status: Status = 'connecting';
  private timer = 0;
  private changeListeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (ids: string[]) => void) { this.changeListeners.add(fn); return () => { this.changeListeners.delete(fn); }; }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => { this.statusListeners.delete(fn); }; }

  start() {
    this.status = 'live';
    this.statusListeners.forEach((fn) => fn());
    this.timer = window.setInterval(() => this.tick(), 2000);
  }
  stop() { clearInterval(this.timer); }

  number(id: string) { return Number(this.things.get(id)?.state ?? 0); }
  is(id: string, state: string) { return this.things.get(id)?.state === state; }

  // Sets a thing and tells whoever listens. The console can call it too:
  // `greenhouse.set('tank.level', 9)` empties the tank.
  set(id: string, state: number | string) {
    const th = this.things.get(id);
    if (!th || th.state === state) return;
    th.state = state;
    th.changed = Date.now();
    this.changeListeners.forEach((fn) => fn([id]));
  }

  // Every two seconds the greenhouse breathes: the heater pulls the air toward
  // its target, the sun warms it, each open vent lets some out; the humidity
  // drifts, up with the watering and down with the vents; the zones that are
  // on drain the tank.
  private tick() {
    const open = VENTS.filter((id) => this.is(id, 'open')).length;
    const on = ZONES.filter((id) => this.is(id, 'on')).length;
    const air = this.number('air.temperature'), target = this.number('air.target');
    this.set('air.temperature', round(clamp(air + (target - air) * 0.08 + 0.25 - 0.2 * open + (Math.random() - 0.5) * 0.3, 5, 45)));
    this.set('air.humidity', round(clamp(this.number('air.humidity') + 0.3 * on - 0.4 * open + (Math.random() - 0.5) * 1.5, 20, 99), 0));
    if (on) this.set('tank.level', round(clamp(this.number('tank.level') - 0.4 * on, 0, 100)));
  }

  // The controller takes a moment to answer, as a real one would; then the
  // things change, and the board sees the action confirmed.
  async act(a: Act) {
    await new Promise((r) => setTimeout(r, 400));
    for (const id of a.ids) {
      const state = this.things.get(id)?.state;
      if (a.do === 'set') this.set(id, Number(a.value));
      else if (a.do === 'flip') this.set(id, state === 'on' ? 'off' : state === 'off' ? 'on' : state === 'open' ? 'closed' : 'open');
      else if (a.do === 'choose') this.set(id, String(a.value));
      else if (a.do === 'refill') this.set(id, 100);
    }
  }

  // A day of a numeric thing, one value per hour, the oldest first. The
  // greenhouse remembers nothing, so it makes a plausible day up: the air
  // warmest mid-afternoon and coolest before dawn, the humidity the other way
  // round, the tank draining toward where it is now.
  history(id: string, hours: number): (number | null)[] {
    const now = this.number(id), hour = new Date().getHours();
    const curve = (h: number) => Math.sin(((h - 9) / 24) * 2 * Math.PI);
    const swing = id === 'air.temperature' ? 4 : id === 'air.humidity' ? -12 : 0;
    return Array.from({ length: hours }, (_, i) => {
      const ago = hours - 1 - i, h = (hour - ago + 48) % 24;
      const drift = id === 'tank.level' ? 0.6 * ago : swing * (curve(h) - curve(hour));
      return round(now + drift + (Math.random() - 0.5) * 0.6);
    });
  }
}
