// Every element of the object, drawn once with sample data: the bench behind
// the "Elements" page of the site (docs/elements.html), and a quick look at
// how a theme's tokens land on each of them. No Zumly here: the pieces, still.
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import {
  DOT_LANES, GROW, LANE, MINI_LANES, SIZE, STROKE, backLayer, calmStrip, clockRim, colorArcs, colorWheel, dots, face, icon,
  labelAt, layerIndex, monthRing, queueRings, radialList, ring, ringCenter, scrollList, THEMES, THEME_NAMES, timeRing, timeline, type RingReading,
} from '@zumer/pulse';
import { systems } from './systems.ts';

const home = systems.home, car = systems.car;
const lanes = STROKE[0] / LANE;   // the front ring's thickness, in lanes

// ─── Readings ───
const band: RingReading = { kind: 'p', v: 0.62, dial: { min: 0, max: 100, step: 1, unit: '%', label: 'brightness', value: 62 } };
const target: RingReading = { kind: 'p', v: 0.54, now: 0.39, dial: { min: 16, max: 30, step: 0.5, unit: '°', label: 'target', value: 23.5 } };
const range: RingReading = { kind: 'p', v: 0, range: { lo: 0.3, hi: 0.64 }, dial: { min: 16, max: 30, step: 0.5, unit: '°', label: 'comfort', value: 0 } };
const switches: RingReading = { kind: 's', segs: ['Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Backyard'].map((label, i) => ({ label, on: i !== 2, act: true })) };
const failing: RingReading = { ...switches, alert: { level: 1, fail: [4] } };
const choice: RingReading = { kind: 'c', segs: ['Heat', 'Cool', 'Auto', 'Off'].map((label, i) => ({ label, on: i === 0, act: true })) };
const tinted: RingReading = { kind: 'p', v: 0.8, tint: 'hsl(28 100% 62%)', dial: { min: 0, max: 100, step: 1, unit: '%', label: 'brightness', value: 80 } };

const universe = (inner: string, w = 200) => `<div class="bigbang" style="width:${w}px"><div class="gravity-spot">${inner}</div></div>`;
const center = (big: string, label: string) => ringCenter(big, label, 18);

// ─── The object: a system in layers (the demo's Home), flat and in 3D ───
function object(flat: boolean, alert = false, index = true) {
  const order = alert ? ['security', 'climate', 'lights', 'cameras'] : ['climate', 'lights', 'security', 'cameras'];
  const layers = order.map((key, i) => {
    const ch = home.ch[key], st = alert && i === 0 ? ch.al : ch.ok;
    const d = Math.min(i, SIZE.length - 1), grow = SIZE[d];
    const r: RingReading = ch.type === 'p'
      ? { v: st.v, kind: 'p', dial: ch.dial ? { ...ch.dial, value: 21.5 } : undefined }
      : { kind: 's', segs: Array.from({ length: ch.segs ?? 4 }, (_, k) => ({ label: ch.toggles?.[k] ?? `${ch.name} ${k + 1}`, on: k < (st.on ?? 0), act: !!ch.toggles })) };
    if (alert && i === 0) r.alert = { level: ch.level, fail: [3] };
    const front = i === 0;
    return `<div class="gravity-spot layer${front ? ' layer-front' : ''}${alert && front ? ' is-alert' : ''}" data-depth="${d}" data-level="${ch.level}"${i >= SIZE.length ? ' hidden' : ''}>
      ${ring(key, r, STROKE[d] / grow / LANE, { name: ch.name, controls: front, call: alert && front })}
      ${front ? face({ glyph: ch.glyph, name: ch.name, big: st.big, label: st.label, aria: ch.name })
        : backLayer({ text: `${ch.name} · ${st.big}`, at: labelAt(i), grow, stroke: STROKE[d], hit: 12, pick: { attr: 'data-pick', value: key, aria: ch.name } })}
    </div>`;
  }).join('');
  const idx = index ? layerIndex(order.map((key, i) => ({ id: key, title: home.ch[key].name, big: (alert && i === 0 ? home.ch[key].al : home.ch[key].ok).big,
    level: alert && i === 0 ? home.ch[key].level : 0, off: i >= SIZE.length })), 'data-pick') : '';
  return `<div class="stage${flat ? '' : ' is-3d'}" data-zoom="${alert ? 'alert' : 'calm'}" style="height:420px; --fit:1">
    <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective${flat ? ' is-flat' : ''}" style="--o-depth-grow:${GROW}">${layers}</div></div></div>
    <div class="layer-index-slot">${idx}</div></div>`;
}

// ─── Sample days ───
const hours = Array.from({ length: 24 }, (_, i) => Math.round(42 + 14 * Math.sin(i / 3.2) + 6 * Math.cos(i / 1.7)));
const tracks = [
  { key: 'living', name: 'Living room', spans: [[19, 14], [5, 0]] as [number, number][], on: true, act: true },
  { key: 'kitchen', name: 'Kitchen', spans: [[17, 15], [2, 0.5]] as [number, number][], act: true },
  { key: 'bedroom', name: 'Bedroom', spans: [[23, 21], [8, 6]] as [number, number][], act: true },
  { key: 'backyard', name: 'Backyard', spans: [[13, 0]] as [number, number][], on: true, tone: 'warn' as const, act: true },
];
const today = 17, days = 31;
const month = Array.from({ length: days }, (_, i) => i + 1 > today ? null : Math.round(8 + 6 * Math.abs(Math.sin(i * 1.3)) + (i % 7 === 5 ? 5 : 0)) / 2);
const now = new Date(); now.setHours(16, 42, 0, 0);
const at = (h: number, m: number) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d; };

// ─── Lists ───
const ids = Object.keys(systems);
const listItems = ids.map((id) => {
  const sys = systems[id], key = sys.front[0], ch = sys.ch[key];
  const r: RingReading = ch.type === 'p' ? { kind: 'p', v: ch.ok.v } : { kind: 's', segs: Array.from({ length: ch.segs ?? 4 }, (_, k) => ({ label: '', on: k < (ch.ok.on ?? 0) })) };
  return { id, title: sys.title, ring: ring(key, r, MINI_LANES, { muted: true }), glyph: ch.glyph, big: ch.ok.big, label: `${ch.name.toLowerCase()} · ${ch.ok.label}` };
});
// The same systems as a queue: the car critical, the second one minor, the rest calm.
const queueItems = ids.map((id, i) => {
  const sys = systems[id], key = sys.front[0], ch = sys.ch[key], level = id === 'car' ? 2 : i === 1 ? 1 : 0;
  const r: RingReading = ch.type === 'p' ? { kind: 'p', v: ch.ok.v } : { kind: 's', segs: Array.from({ length: ch.segs ?? 4 }, (_, k) => ({ label: '', on: k < (ch.ok.on ?? 0) })) };
  return { id, title: sys.title, ring: ring(key, level ? { ...r, alert: { level } } : r, MINI_LANES * [0.6, 1, 1.35][level], { muted: !level }),
    glyph: ch.glyph, big: ch.ok.big, label: `${ch.name.toLowerCase()} · ${ch.ok.label}`, level };
}).sort((a, b) => b.level - a.level);
const sources = ['Spotify', 'Radio', 'Bluetooth', 'HDMI 1', 'HDMI 2', 'AirPlay', 'Chromecast', 'TV', 'Vinyl', 'CD', 'Tuner', 'Aux', 'USB', 'Podcasts', 'Audiobooks'];

const samples: [string, string][] = [
  ['ring-band', universe(ring('b', band, lanes, { controls: true, name: 'Brightness' }) + center('62%', 'brightness'))],
  ['ring-open', universe(ring('t', target, lanes, { controls: true, open: true, name: 'Thermostat' }) + center('23.5°', 'target · now 21.5°'))],
  ['ring-range', universe(ring('r', range, lanes, { controls: true, name: 'Comfort range' }) + center('20–25°', 'comfort'))],
  ['ring-switches', universe(ring('s', switches, lanes, { controls: true, name: 'Lights' }) + center('4 of 5', 'lights'))],
  ['ring-failing', universe(ring('f', failing, lanes, { controls: true, call: true, name: 'Lights' }) + center('Backyard', 'on in daylight'))],
  ['ring-choice', universe(ring('c', choice, lanes, { controls: true, name: 'Mode' }) + center('Heat', 'mode'))],
  ['ring-tint', universe(ring('k', tinted, lanes, { controls: true, name: 'Brightness', ends: 'rounded' }) + center('80%', 'warm white'))],
  ['ring-rounded', universe(ring('q', switches, lanes, { controls: true, name: 'Lights', ends: 'rounded' }) + center('4 of 5', 'lights'))],
  ['ring-mini', `<span class="bigbang mini-ring"><span class="gravity-spot">${ring('m', failing, MINI_LANES, { call: true })}</span></span>`],
  ['object-flat', object(true)],
  ['object-3d', object(false)],
  ['object-alert', object(true, true)],
  ['layer-index', layerIndex([
    { id: 'a', title: 'Batteries', big: '15%', level: 1 }, { id: 'b', title: 'Lights', big: '4 of 9', level: 0 }, { id: 'c', title: 'Climate', big: '21.5°C', level: 0 },
    { id: 'd', title: 'Security', big: 'Disarmed', level: 0, off: true }, { id: 'e', title: 'Media', big: '1 of 3', level: 0, off: true },
  ], 'data-pick')],
  ['strip-calm', `<div class="strip">${calmStrip('Home', 'Climate', [{ key: 'cameras', name: 'Cameras' }])}</div>`],
  ['strip-alert', `<div class="strip"><strong>Security:</strong> Opened with the alarm armed. <button class="primary level-2">I closed it</button></div>`],
  ['dots', `<nav class="dots" style="display:flex;gap:4px">${dots(ids.map((id) => {
    const sys = systems[id], key = sys.front[0], ch = sys.ch[key];
    const r: RingReading = ch.type === 'p' ? { kind: 'p', v: ch.ok.v } : { kind: 's', segs: Array.from({ length: ch.segs ?? 4 }, (_, k) => ({ label: '', on: k < (ch.ok.on ?? 0) })) };
    return { id, title: sys.title, level: id === 'car' ? 2 : 0, ring: ring(key, r, DOT_LANES, { muted: true }) };
  }), 'home')}</nav>`],
  ['time-ring', `<div class="history">${timeRing({ values: hours, label: 'last 24 h', unit: '%', marks: true })}</div>`],
  ['timeline', `<div class="history">${timeline({ hours: 24, tracks, events: [{ ago: 13, text: 'Left on', tone: 'warn' }, { ago: 5, text: 'Sunset' }],
    big: '2 of 4', label: 'living room, backyard', marks: true, names: true, aria: 'The day of the lights' })}</div>`],
  ['month-ring', `<div class="history">${monthRing({ days, today, values: month, unit: ' kWh', title: 'October 2026', aria: 'October, energy', big: '9.5 kWh', label: 'today · Energy meter' })}</div>`],
  ['color-arcs', `<div class="bigbang detail-ring"><div class="gravity-spot">${ring('l', tinted, lanes, { controls: true, name: 'Brightness' })}${colorArcs('l', [28, 76], { name: 'Ceiling light' })}${ringCenter('80%', 'brightness', 13, 'hsl(28 100% 62%)')}</div></div>`],
  ['color-wheel', colorWheel([28, 76], 'l', 'Color of the ceiling light')],
  ['radial-list', `<div class="list-stage" style="width:340px;margin:36px 40px">${radialList(listItems, 0)}</div>`],
  ['queue-rings', `<div class="list-stage" style="width:340px;margin:36px 110px">${queueRings(queueItems, { focus: 'car', open: false })}</div>`],
  ['queue-rings-open', `<div class="list-stage" style="width:340px;margin:36px 110px">${queueRings(queueItems, { focus: 'car', open: true })}</div>`],
  ['scroll-list', scrollList(sources.map((label, i) => ({ label, on: i === 2, act: true })), { offset: 1, focus: 2 }, { key: 'src', name: 'Source' })],
  ['clock-rim', universe(`<div class="orbit-12" style="--o-size-ratio:.5; --o-gap:30">${['var(--minor)', 'var(--dim)', 'var(--dim)', 'var(--dim)', 'var(--critical)', 'var(--dim)', 'var(--dim)'].map((c) => `<o-arc style="--o-fill:${c}"></o-arc>`).join('')}</div>${
    clockRim([{ at: at(9, 12), text: 'Kitchen light on' }, { at: at(11, 40), level: 1, text: 'Backyard left on' }, { at: at(14, 5), text: 'Thermostat 23.5°' }, { at: at(16, 20), level: 2, text: 'Bathroom window open' }], now)}`, 160)],
  ['tile', `<button class="tile"><span class="bigbang mini-ring"><span class="gravity-spot">${ring('m', { kind: 'p', v: car.ch.battery.ok.v }, MINI_LANES, { muted: true })}</span></span>
    <span class="mini-glyph">${icon(car.ch.battery.glyph, 26)}</span><span class="tile-title">Car</span></button>`],
  ['glyph', ['bulb', 'drop', 'shield', 'bolt'].map(() => '').join('') + `<div style="display:flex;gap:18px;color:var(--ink)">${[home.ch.lights, home.ch.climate, home.ch.security, car.ch.battery, home.ch.cameras].map((ch) => icon(ch.glyph, 32)).join('')}</div>`],
];

// ─── Themes: the same object, each set of the seven tokens ───
const themes: [string, string][] = THEME_NAMES.map((name) => [name[0].toUpperCase() + name.slice(1),
  name === 'graphite' ? '' : Object.entries(THEMES[name]).map(([k, v]) => `--${k}:${v}`).join('; ')]);

document.querySelector('.elements')!.innerHTML = samples.map(([name, html]) =>
  `<section class="sample" data-shot="${name}"><div class="sample-box">${html}</div><p class="sample-name">${name}</p></section>`).join('')
  + `<section class="sample themes" data-shot="themes"><div class="sample-box theme-row">${themes.map(([name, vars]) =>
    `<div class="theme" style="${vars}"><p class="theme-name">${name}</p>${object(true, false, false)}</div>`).join('')}</div></section>`;

const css = document.createElement('style');
css.textContent = `
  .elements { display: grid; gap: 28px; padding: 32px; max-width: 1100px; margin: 0 auto; justify-items: center; }
  .sample-box { display: inline-grid; min-width: 260px; place-items: center; padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); }
  .sample-box .history { min-height: 0; width: 440px; display: grid; justify-items: center; container-type: inline-size; }
  .sample-box .month-ring { width: 300px; margin: 24px; }
  .sample-box .scroll-list { margin: 16px 60px; }
  .sample-box .list-stage { width: 340px; margin: 36px 40px; }
  .sample-box .stage.is-3d .obj { rotate: .5 1 0 16deg; }
  .sample-box .stage { width: 600px; max-width: none; }
  .sample-name { margin: 6px 0 0; font-size: 12px; color: var(--muted); font-family: ui-monospace, monospace; }
  .themes { width: 100%; }
  .theme-row { display: grid; width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); place-items: stretch; gap: 16px; padding: 0; border: 0; background: none; }
  .theme .stage { width: 100%; max-width: none; }
  .theme { border-radius: 14px; background: var(--bg); color: var(--ink); overflow: hidden; }
  .theme .stage { height: 340px; --fit: .85; }
  .theme-name { margin: 14px 18px 0; font-size: 13px; color: var(--muted); }
`;
document.head.append(css);
