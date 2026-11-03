// A recorded sky: an airliner squawking 7700 over the Atlantic and one with
// no radio near Lisbon, forty aircraft around Buenos Aires (arrivals into
// Ezeiza, departures, one in a hold, one descending too fast, one lost, one
// low and slow), and OpenSky's count of the world binned on the globe. The
// aircraft move along their tracks every two seconds. Same shape as the
// network source; the aircraft go through the same parser as the live ones.

import type { Status } from '@zumer/pulse';
import { type Act, type Aircraft, type Fleet, type Region, type Sky, type SkySource, aircraftOf, DEFAULT_REGION } from '../source.ts';
import { distanceNm } from '../model.ts';
import { t } from '../strings.ts';

const seeded = (n: number) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
// Metres... no: nautical miles north and east of the region's center, into degrees.
const place = (r: Region, n: number, e: number) => ({ lat: r.lat + n / 60, lon: r.lon + e / (60 * Math.cos((r.lat * Math.PI) / 180)) });
const bearingOf = (r: Region, lat: number, lon: number) => ((Math.atan2((lon - r.lon) * Math.cos((r.lat * Math.PI) / 180), lat - r.lat) * 180) / Math.PI + 360) % 360;

type Plane = { hex: string; flight: string; t: string; r: string; cat: string; n: number; e: number; alt: number | 'ground'; gs: number; track: number; rate: number; squawk: string; emergency?: string; hold?: boolean; silent?: boolean; global?: { lat: number; lon: number } };
const AIRLINES = ['ARG', 'AEP', 'LAN', 'GOL', 'JAT', 'AZU', 'FBZ', 'AAL', 'IBE', 'KLM'];
const TYPES = ['A320', 'B738', 'A321', 'E190', 'B789', 'A359', 'B77W', 'A20N'];

function yard(r: Region): Plane[] {
  const out: Plane[] = [
    // The emergencies, anywhere: a 7700 mid-Atlantic, a 7600 off Lisbon.
    { hex: 'e8027a', flight: 'IBE6845', t: 'A333', r: 'EC-MTZ', cat: 'A5', n: 0, e: 0, alt: 37_000, gs: 468, track: 46, rate: 0, squawk: '7700', emergency: 'general', global: { lat: 36.4, lon: -28.9 } },
    { hex: '3950c1', flight: 'AFR459', t: 'B77W', r: 'F-GZNA', cat: 'A5', n: 0, e: 0, alt: 35_000, gs: 452, track: 215, rate: 0, squawk: '7600', global: { lat: 39.6, lon: -10.4 } },
    // Around the region: arrivals into Ezeiza from the north and east, departures, a hold over the river, the odd ones.
    { hex: 'e0a1b2', flight: 'ARG1303', t: 'B738', r: 'LV-FUC', cat: 'A3', n: 28, e: 18, alt: 8200, gs: 240, track: 215, rate: -1500, squawk: '2031' },
    { hex: 'e0a1b3', flight: 'LAN8001', t: 'A20N', r: 'CC-BHB', cat: 'A3', n: 44, e: 36, alt: 12_500, gs: 280, track: 220, rate: -1800, squawk: '2452' },
    { hex: 'e0a1b4', flight: 'GOL7667', t: 'B738', r: 'PR-GUH', cat: 'A3', n: 70, e: 42, alt: 19_000, gs: 320, track: 215, rate: -2100, squawk: '2710' },
    { hex: 'e0a1b5', flight: 'ARG1419', t: 'E190', r: 'LV-CET', cat: 'A3', n: 6, e: 3, alt: 3100, gs: 170, track: 290, rate: -700, squawk: '3012' },
    { hex: 'e0a1b6', flight: 'AEP6211', t: 'A320', r: 'LV-GVX', cat: 'A3', n: -14, e: -9, alt: 5400, gs: 2100 / 10, track: 120, rate: 2400, squawk: '3344' },
    { hex: 'e0a1b7', flight: 'JAT9041', t: 'A320', r: 'LV-HKT', cat: 'A3', n: -22, e: 4, alt: 9800, gs: 290, track: 30, rate: 2200, squawk: '3410' },
    { hex: 'e0a1b8', flight: 'ARG1800', t: 'A21N', r: 'LV-KGM', cat: 'A3', n: 9, e: 24, alt: 7000, gs: 230, track: 90, rate: 0, squawk: '2060', hold: true },
    { hex: 'e0a1b9', flight: 'FBZ5121', t: 'B738', r: 'LV-HQA', cat: 'A3', n: 31, e: -40, alt: 7200, gs: 310, track: 140, rate: -5200, squawk: '2237' },
    { hex: 'e0a1ba', flight: 'LAN4576', t: 'A320', r: 'CC-BAQ', cat: 'A3', n: 95, e: -120, alt: 36_000, gs: 455, track: 160, rate: 0, squawk: '1527', silent: true },
    { hex: 'e0a1bb', flight: 'LV-ZXC', t: 'C182', r: 'LV-ZXC', cat: 'A1', n: -78, e: -55, alt: 900, gs: 82, track: 200, rate: -100, squawk: '7000' },
    { hex: 'e0a1bc', flight: 'IBE6841', t: 'A359', r: 'EC-NCX', cat: 'A5', n: 160, e: 110, alt: 39_000, gs: 470, track: 225, rate: 0, squawk: '2615' },
    { hex: 'e0a1bd', flight: 'AAL954', t: 'B789', r: 'N833AA', cat: 'A5', n: 210, e: 60, alt: 38_000, gs: 478, track: 190, rate: 0, squawk: '2704' },
    { hex: 'e0a1be', flight: 'ARG1001', t: 'A20N', r: 'LV-JHR', cat: 'A3', n: -2, e: -1, alt: 'ground', gs: 12, track: 110, rate: 0, squawk: '2000' },
    { hex: 'e0a1bf', flight: 'AEP6203', t: 'A320', r: 'LV-GLP', cat: 'A3', n: 1, e: 2, alt: 'ground', gs: 0, track: 0, rate: 0, squawk: '2000' },
  ];
  // The rest of the region's traffic, en route and level, seeded.
  for (let i = 0; i < 26; i++) {
    const r1 = seeded(i + 1), r2 = seeded(i * 7 + 3), r3 = seeded(i * 13 + 5);
    const dist = 40 + r1 * 200, ang = r2 * 360;
    out.push({ hex: `e0b${(100 + i).toString(16)}`, flight: `${AIRLINES[i % AIRLINES.length]}${1000 + Math.round(r3 * 8000)}`, t: TYPES[i % TYPES.length], r: `LV-${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}`, cat: i % 5 === 0 ? 'A5' : 'A3',
      n: dist * Math.cos((ang * Math.PI) / 180), e: dist * Math.sin((ang * Math.PI) / 180), alt: 28_000 + Math.round(r3 * 12) * 1000, gs: 420 + Math.round(r1 * 60), track: Math.round(r3 * 360), rate: 0, squawk: String(2000 + Math.round(r2 * 5000)) });
  }
  void r;
  return out;
}

// OpenSky's count of the world as the demo keeps it: the busy skies, a dot per cell sized by how many.
const HUBS: [number, number, number][] = [[42.5, -87.5, 420], [37.5, -97.5, 380], [37.5, -77.5, 360], [32.5, -97.5, 300], [42.5, -72.5, 280], [27.5, -82.5, 240], [37.5, -122.5, 300], [47.5, -122.5, 150], [32.5, -117.5, 220], [47.5, -97.5, 110],
  [47.5, -112.5, 60], [27.5, -102.5, 120], [22.5, -102.5, 110], [19.5, -97.5, 70], [42.5, -82.5, 220], [47.5, -72.5, 120], [22.5, -77.5, 60], [12.5, -72.5, 60], [-22.5, -47.5, 160], [-32.5, -57.5, 90], [-12.5, -77.5, 50], [4.5, -72.5, 70], [-32.5, -72.5, 40],
  [52.5, -2.5, 320], [47.5, 2.5, 300], [52.5, 7.5, 320], [47.5, 7.5, 240], [42.5, 2.5, 190], [37.5, -2.5, 150], [42.5, 12.5, 200], [52.5, 17.5, 110], [57.5, 12.5, 90], [47.5, 17.5, 110], [42.5, 22.5, 90], [37.5, 27.5, 140], [57.5, 37.5, 80], [42.5, 32.5, 60], [32.5, 32.5, 50],
  [27.5, 52.5, 180], [22.5, 42.5, 60], [27.5, 77.5, 240], [22.5, 72.5, 160], [12.5, 77.5, 150], [17.5, 77.5, 90], [2.5, 102.5, 220], [12.5, 102.5, 160], [22.5, 112.5, 320], [32.5, 117.5, 360], [37.5, 117.5, 280], [27.5, 117.5, 240], [37.5, 127.5, 180], [37.5, 137.5, 260], [32.5, 132.5, 120],
  [-27.5, 152.5, 90], [-32.5, 147.5, 100], [-37.5, 147.5, 110], [-37.5, 172.5, 50], [-27.5, 27.5, 70], [-32.5, 17.5, 30], [7.5, 2.5, 40], [32.5, 2.5, 30], [-2.5, 37.5, 30], [62.5, -17.5, 20], [67.5, 22.5, 20]];
const COUNTRIES: [string, number][] = [['United States', 3480], ['China', 980], ['United Kingdom', 540], ['Germany', 470], ['Ireland', 410], ['Canada', 380], ['Brazil', 310], ['Japan', 290], ['India', 280], ['Turkey', 240], ['France', 230], ['Spain', 220]];

export class DemoSource implements SkySource {
  readonly aircraft: Fleet = new Map();
  readonly emergencies = new Set<string>();
  sky: Sky | null = null;
  readonly region: Region = DEFAULT_REGION;
  readonly mapUrl = (hex: string) => `https://adsb.lol/?icao=${hex}`;
  status: Status = 'signed-out';
  error = '';
  failed: string[] = [];
  private planes: Plane[] = [];
  private timer = 0;
  private listeners = new Set<(ids: string[]) => void>();
  private statusListeners = new Set<() => void>();

  get label() { return t.demoLabel; }
  onChange(fn: (ids: string[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  private setStatus(status: Status) { this.status = status; this.statusListeners.forEach((fn) => fn()); }

  start() {
    this.planes = yard(this.region);
    this.aircraft.clear(); this.emergencies.clear();
    const now = Date.now();
    for (const p of this.planes) {
      // A hold needs a trail that has turned: it is seeded with its last two minutes.
      const a = this.read(p, now, p.hold ? Array.from({ length: 12 }, (_, i) => ({ at: now - (12 - i) * 10_000, ...place(this.region, p.n, p.e), alt: p.alt === 'ground' ? null : p.alt, track: (p.track - (12 - i) * 30 + 720) % 360 })) : []);
      if (a) { this.aircraft.set(a.hex, a); if (p.squawk.startsWith('7') && p.squawk !== '7000') this.emergencies.add(a.hex); }
    }
    const total = COUNTRIES.reduce((s, [, n]) => s + n, 0) + 1570;
    this.sky = { at: now - 4 * 60_000, airborne: total, countries: COUNTRIES, bins: HUBS.map(([lat, lon, n]) => ({ lat, lon, n })) };
    this.setStatus('live');
    this.listeners.forEach((fn) => fn([...this.aircraft.keys(), 'emergencies', 'sky']));
    this.timer = window.setInterval(() => this.tick(), 2000);
  }
  stop() { clearInterval(this.timer); this.aircraft.clear(); this.emergencies.clear(); this.sky = null; this.setStatus('signed-out'); }

  // A plane as the network would report it, through the same parser as the live ones.
  private read(p: Plane, now: number, trail?: Aircraft['trail']): Aircraft | null {
    const pos = p.global ?? place(this.region, p.n, p.e);
    const seen = p.silent ? 150 : 0.6;
    const raw: Record<string, unknown> = { hex: p.hex, flight: `${p.flight} `, r: p.r, t: p.t, category: p.cat, lat: pos.lat, lon: pos.lon, alt_baro: p.alt, gs: p.gs, track: p.track, baro_rate: p.rate, squawk: p.squawk, emergency: p.emergency ?? 'none', seen };
    if (!p.global) { raw.dst = distanceNm(this.region.lat, this.region.lon, pos.lat, pos.lon); raw.dir = bearingOf(this.region, pos.lat, pos.lon); }
    const was = this.aircraft.get(p.hex);
    const a = aircraftOf(raw, now - seen * 1000 + seen * 1000, trail ? { ...(was ?? ({} as Aircraft)), trail } : was);
    return a;
  }

  // Everyone moves along its track; the hold turns; the climbing and descending change altitude.
  private tick() {
    const now = Date.now(), changed: string[] = [];
    for (const p of this.planes) {
      if (p.silent || p.global || p.alt === 'ground') continue;
      const step = (p.gs / 3600) * 2;                 // nautical miles in two seconds
      p.n += step * Math.cos((p.track * Math.PI) / 180); p.e += step * Math.sin((p.track * Math.PI) / 180);
      if (p.hold) p.track = (p.track + 6) % 360;
      if (p.rate) p.alt = Math.max(500, Math.min(41_000, p.alt + (p.rate / 60) * 2));
      // An arrival levels off and slows for the approach; a light aircraft drifting down keeps its own pace.
      if (p.rate <= -300 && p.alt <= 1000 && !p.hold) { p.rate = 0; p.gs = Math.max(140, p.gs - 60); }
      const a = this.read(p, now);
      if (a) { this.aircraft.set(a.hex, a); changed.push(a.hex); }
    }
    this.listeners.forEach((fn) => fn(changed));
  }

  async act(a: Act) {
    if (a.kind === 'open') { window.open(a.url, '_blank', 'noopener'); return; }
    throw new Error('unknown action');
  }
}
