// Demo data for the prototype with simulated readings. A system is plain data:
// 2 to 4 channels that compete for attention, ordered front to back, each with
// a normal state and an alert state. The texts are English; another language
// would be another file with the same shape.

export type Channel = {
  name: string;
  glyph: string;             // SVG path, 24×24
  type: 'p' | 's';           // 'p' progress (0..1) · 's' segments (2..8)
  segs?: number;
  level: 1 | 2;              // 1 minor · 2 critical
  // Direct controls on the object. dial: the front ring is dragged and sets a
  // value from min to max. toggles: one name per segment, each one switched
  // on or off with a tap.
  dial?: { min: number; max: number; step: number; unit: string; label: string };
  toggles?: string[];
  ok: { v?: number; on?: number; big: string; label: string };
  al: { v?: number; on?: number; seg?: number; big: string; label: string; why: string; verb: string };
};

export type PulseSystem = { title: string; front: string[]; ch: Record<string, Channel> };

const shield = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4';
const drop = 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z';
const bulb = 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z';
const cam = 'M4 7h11v10H4z M15 10l5-3v10l-5-3';
const bolt = 'M13 3L5 14h6l-1 7 8-11h-6z';
const heart = 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z';
const disk = 'M4 6h16v5H4z M4 13h16v5H4z M7 8.5h.01 M7 15.5h.01';
const paw = 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M16 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M12 20c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4z';

export const systems: Record<string, PulseSystem> = {
  home: {
    title: 'Home', front: ['climate', 'lights', 'security', 'cameras'],
    ch: {
      climate: { name: 'Climate', glyph: drop, type: 'p', level: 1,
        dial: { min: 16, max: 30, step: 0.5, unit: '°', label: 'target' },
        ok: { v: 0.5, big: '21.5°', label: 'target 23°' },
        al: { v: 0.95, big: '28°', label: '30% less efficient', why: 'The air filter is dirty', verb: 'Order a filter' } },
      lights: { name: 'Lights', glyph: bulb, type: 's', segs: 5, level: 1,
        toggles: ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Backyard'],
        ok: { on: 2, big: '2 of 5', label: 'living room and kitchen' },
        al: { on: 5, seg: 4, big: 'Backyard', label: 'on in daylight', why: 'Left on since last night', verb: 'Turn off' } },
      security: { name: 'Security', glyph: shield, type: 's', segs: 6, level: 2,
        ok: { on: 6, big: 'Closed', label: '6 of 6 openings' },
        al: { on: 6, seg: 3, big: 'Open', label: 'bathroom window', why: 'Opened with the alarm armed', verb: 'I closed it' } },
      cameras: { name: 'Cameras', glyph: cam, type: 's', segs: 3, level: 2,
        ok: { on: 3, big: 'No motion', label: '3 cameras' },
        al: { on: 3, seg: 1, big: 'Motion', label: 'backyard', why: 'Someone in the backyard', verb: 'View camera' } },
    },
  },
  car: {
    title: 'Car', front: ['battery', 'tires'],
    ch: {
      battery: { name: 'Battery', glyph: bolt, type: 'p', level: 1,
        ok: { v: 0.74, big: '74%', label: '310 km' },
        al: { v: 0.12, big: '12%', label: '45 km', why: 'Not enough charge for tomorrow’s trip', verb: 'Schedule charging' } },
      tires: { name: 'Tires', glyph: disk, type: 's', segs: 4, level: 2,
        ok: { on: 4, big: '32 psi', label: '4 of 4' },
        al: { on: 4, seg: 2, big: '21 psi', label: 'rear left', why: 'Losing pressure', verb: 'Find a tire shop' } },
    },
  },
  pet: {
    title: 'Pet', front: ['food', 'walks'],
    ch: {
      food: { name: 'Food', glyph: paw, type: 'p', level: 1,
        ok: { v: 0.6, big: '60%', label: 'dispenser' },
        al: { v: 0.08, big: '8%', label: '1 serving left', why: 'The dispenser is almost empty', verb: 'Refill' } },
      walks: { name: 'Walks', glyph: paw, type: 's', segs: 3, level: 1,
        ok: { on: 2, big: '2 of 3', label: 'today' },
        al: { on: 1, seg: 1, big: '1 of 3', label: 'today', why: 'Walks are overdue', verb: 'Schedule' } },
    },
  },
  health: {
    title: 'Health', front: ['pulse', 'sleep'],
    ch: {
      pulse: { name: 'Pulse', glyph: heart, type: 'p', level: 2,
        ok: { v: 0.5, big: '68', label: 'resting' },
        al: { v: 0.9, big: '118', label: 'resting', why: 'High pulse with no activity', verb: 'Log it' } },
      sleep: { name: 'Sleep', glyph: heart, type: 'p', level: 1,
        ok: { v: 0.88, big: '7 h', label: 'last night' },
        al: { v: 0.5, big: '4 h', label: 'last night', why: 'You slept little', verb: 'Set a reminder' } },
    },
  },
  server: {
    title: 'Server', front: ['nodes', 'disk', 'network'],
    ch: {
      nodes: { name: 'Nodes', glyph: disk, type: 's', segs: 4, level: 2,
        ok: { on: 4, big: '4 of 4', label: 'online' },
        al: { on: 4, seg: 3, big: '3 of 4', label: 'node-3 down', why: 'node-3 is not responding', verb: 'Restart' } },
      disk: { name: 'Disk', glyph: disk, type: 'p', level: 1,
        ok: { v: 0.41, big: '41%', label: 'used' },
        al: { v: 0.93, big: '93%', label: 'used', why: 'Logs are growing fast', verb: 'Rotate logs' } },
      network: { name: 'Network', glyph: bolt, type: 'p', level: 1,
        ok: { v: 0.3, big: '120 Mb/s', label: 'out' },
        al: { v: 0.97, big: '960 Mb/s', label: 'out', why: 'Unusual traffic', verb: 'View connections' } },
    },
  },
};
