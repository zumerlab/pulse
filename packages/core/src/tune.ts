// Fine-tuning of the board's orbit, layers and time: the sliders of the gear's
// last tab. The values are kept in the browser, for every board on the page;
// "Copy" puts them on the clipboard, to carry into the code once they convince.

import { t } from './i18n.ts';

export type Tune = {
  orbit: number; tile: number; align: number; hub: number; orbitStep: number;
  layerGrow: number; layerStep: number; layerZoom: number; layerOpacity: number;
  layerEase: number; layerStroke: number; layerBlur: number;
  timeGap: number; timeBar: number; timePointer: number; timeSplit: number;
};

// The values the code uses today.
export const DEFAULTS: Tune = {
  orbit: 10, tile: 3.5, align: 20, hub: 11, orbitStep: -110,
  layerGrow: 0.42, layerStep: -70, layerZoom: 1.1, layerOpacity: 0.6,
  layerEase: 0, layerStroke: 4, layerBlur: 0.5,
  timeGap: 22, timeBar: 14, timePointer: 9, timeSplit: 0.75,
};

export type Control = { key: keyof Tune; min: number; max: number; step: number; unit?: string };
export type TuneGroup = 'orbit' | 'layers' | 'time';
export const GROUPS: [TuneGroup, Control[]][] = [
  ['orbit', [
    { key: 'orbit', min: 6, max: 12, step: 1 },
    { key: 'tile', min: 2, max: 5, step: 0.1 },
    { key: 'align', min: 0, max: 60, step: 1, unit: 'px' },
    { key: 'hub', min: 6, max: 14, step: 0.5 },
    { key: 'orbitStep', min: -250, max: 0, step: 5, unit: 'px' },
  ]],
  ['time', [
    { key: 'timeGap', min: 10, max: 44, step: 1 },
    { key: 'timeSplit', min: 0.6, max: 0.88, step: 0.01 },
    { key: 'timePointer', min: 0, max: 16, step: 1 },
    { key: 'timeBar', min: 4, max: 36, step: 1 },
  ]],
  ['layers', [
    { key: 'layerGrow', min: 0, max: 0.42, step: 0.01 },
    { key: 'layerEase', min: -1, max: 1, step: 0.05 },
    { key: 'layerStroke', min: 1, max: 8, step: 0.5, unit: 'px' },
    { key: 'layerBlur', min: 0, max: 3, step: 0.1, unit: 'px' },
    { key: 'layerStep', min: -150, max: 0, step: 5, unit: 'px' },
    { key: 'layerZoom', min: 0.7, max: 1.5, step: 0.05 },
    { key: 'layerOpacity', min: 0.2, max: 1, step: 0.05 },
  ]],
];
export const CONTROLS = GROUPS.flatMap(([, c]) => c);

const KEY = 'pulse-tune';
export const tune: Tune = { ...DEFAULTS };
// Only the keys that still exist: a value kept by an old build stays out.
try {
  // What a browser kept while the tuning was the Home Assistant app's own, until it tunes again.
  const kept = JSON.parse(localStorage.getItem(KEY) ?? localStorage.getItem('pulse-ha-tune') ?? '{}') as Record<string, number>;
  for (const k of Object.keys(DEFAULTS) as (keyof Tune)[]) if (typeof kept[k] === 'number') tune[k] = kept[k];
} catch { /* no storage: code values */ }
// What older builds kept under other keys (a development panel's values and colors): drop them.
try { localStorage.removeItem('pulse-ha-tune-colors'); } catch { /* nothing kept */ }

// What is CSS goes into root variables; what changes the markup (the orbit,
// the growth of the layers) asks the boards to redraw ('pulse-tune').
function apply() {
  const s = document.documentElement.style;
  s.setProperty('--t-tile', String(tune.tile));
  s.setProperty('--t-align', `${tune.align}px`);
  s.setProperty('--t-hub', String(tune.hub));
  s.setProperty('--t-orbit-step', String(tune.orbitStep));
  s.setProperty('--t-layer-step', String(tune.layerStep));
  s.setProperty('--t-layer-zoom', String(tune.layerZoom));
  s.setProperty('--t-layer-opacity', String(tune.layerOpacity));
  s.setProperty('--t-layer-blur', `${tune.layerBlur}px`);
}
apply();

function changed() {
  try {
    const diff = Object.fromEntries((Object.keys(tune) as (keyof Tune)[]).filter((k) => tune[k] !== DEFAULTS[k]).map((k) => [k, tune[k]]));
    if (Object.keys(diff).length) localStorage.setItem(KEY, JSON.stringify(diff)); else localStorage.removeItem(KEY);
  } catch { /* only to remember */ }
  apply();
  window.dispatchEvent(new Event('pulse-tune'));
}
export function setTune(key: keyof Tune, value: number) {
  if (!(key in DEFAULTS) || !Number.isFinite(value)) return;
  tune[key] = value;
  changed();
}
export function resetTune(group?: TuneGroup) {
  const keys = group ? GROUPS.find(([g]) => g === group)![1].map((c) => c.key) : Object.keys(DEFAULTS) as (keyof Tune)[];
  for (const k of keys) tune[k] = DEFAULTS[k];
  changed();
}
export const tuned = (group?: TuneGroup) => (group ? GROUPS.find(([g]) => g === group)![1].map((c) => c.key) : Object.keys(DEFAULTS) as (keyof Tune)[])
  .some((k) => tune[k] !== DEFAULTS[k]);
export const fmt = (c: Control, v: number) => `${Number(v.toFixed(2))}${c.unit ?? ''}`;
// The values as text, to paste into the code.
export const tuneText = () => CONTROLS.map((c) => `${c.key}: ${tune[c.key]}${tune[c.key] !== DEFAULTS[c.key] ? `  (code: ${DEFAULTS[c.key]})` : ''}`).join('\n');
export const tuneLabel = (k: keyof Tune) => t.tuneLabels[k];
