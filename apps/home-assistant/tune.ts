// Live tuning of the board's orbit and layers, development only (`npm run dev`).
// The values are kept in the browser; "Copy" puts on the clipboard the ones to
// carry into the code once they convince.

import { THEMES as CORE_THEMES, THEME_NAMES, type Theme } from '@zumer/pulse';
import { t } from './strings.ts';

export type Tune = {
  orbit: number; tile: number; align: number; hub: number; orbitStep: number;
  layerGrow: number; layerStep: number; layerZoom: number; layerOpacity: number;
  layerEase: number; layerStroke: number; layerBlur: number;
};

// The values the code uses today.
export const DEFAULTS: Tune = {
  orbit: 10, tile: 3.5, align: 20, hub: 11, orbitStep: -110,
  layerGrow: 0.42, layerStep: -70, layerZoom: 1.1, layerOpacity: 0.6,
  layerEase: 0, layerStroke: 4, layerBlur: 0.5,
};

type Control = { key: keyof Tune; label: string; min: number; max: number; step: number; unit?: string };
const GROUPS: [string, Control[]][] = [
  ['Orbit', [
    { key: 'orbit', label: 'Systems orbit', min: 6, max: 12, step: 1 },
    { key: 'tile', label: 'Ring of each system (lanes)', min: 2, max: 5, step: 0.1 },
    { key: 'align', label: 'Inward offset', min: 0, max: 60, step: 1, unit: 'px' },
    { key: 'hub', label: 'Center pulse (lanes)', min: 6, max: 14, step: 0.5 },
    { key: 'orbitStep', label: 'Distance of the systems behind', min: -250, max: 0, step: 5, unit: 'px' },
  ]],
  ['Layers', [
    { key: 'layerGrow', label: 'Growth per layer (at most; all the layers fit)', min: 0, max: 0.42, step: 0.01 },
    { key: 'layerEase', label: 'Spacing: bunched behind ← even → bunched in front', min: -1, max: 1, step: 0.05 },
    { key: 'layerStroke', label: 'Stroke of the layers behind', min: 1, max: 8, step: 0.5, unit: 'px' },
    { key: 'layerBlur', label: 'Halo per layer behind', min: 0, max: 3, step: 0.1, unit: 'px' },
    { key: 'layerStep', label: 'Distance between layers', min: -150, max: 0, step: 5, unit: 'px' },
    { key: 'layerZoom', label: 'Object zoom', min: 0.7, max: 1.5, step: 0.05 },
    { key: 'layerOpacity', label: 'Opacity of the layers behind', min: 0.2, max: 1, step: 0.05 },
  ]],
];

// The seven tokens of the theme (packages/core/src/style.css), and the
// object's themes (packages/core/src/themes.ts) as a starting point for each.
export type Colors = Theme;
const title = (name: string) => name[0].toUpperCase() + name.slice(1);
export const THEMES: Record<string, Colors> = Object.fromEntries(THEME_NAMES.map((name) => [title(name), CORE_THEMES[name]]));
const COLOR_LABELS: Record<keyof Colors, string> = { bg: 'Background', ink: 'Ink', muted: 'Muted', dim: 'Dim', line: 'Line', minor: 'Minor alert', critical: 'Critical alert' };
export const colors: Colors = { ...THEMES.Graphite };

const KEY = 'pulse-ha-tune', COLOR_KEY = 'pulse-ha-tune-colors';
export const tune: Tune = { ...DEFAULTS };
// Only the keys that still exist: a value kept by an old build (the tilts of
// 31/10, both gone) stays out, and the panel has no control for it.
try {
  const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  for (const k of Object.keys(DEFAULTS) as (keyof Tune)[]) if (typeof kept[k] === 'number') tune[k] = kept[k];
} catch { /* no storage: code values */ }
try {
  const kept = JSON.parse(localStorage.getItem(COLOR_KEY) ?? '{}') as Record<string, string>;
  for (const k of Object.keys(colors) as (keyof Colors)[]) if (/^#[0-9a-f]{6}$/i.test(kept[k] ?? '')) colors[k] = kept[k];
} catch { /* no storage: the code's theme */ }

// What is CSS goes into root variables; what changes the markup (the orbit,
// the growth of the layers) asks the board to redraw.
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
  s.removeProperty('--tilt-rest');
  // The theme's tokens, on the root: they win over the stylesheet's.
  for (const k of Object.keys(colors) as (keyof Colors)[]) {
    if (colors[k] === THEMES.Graphite[k]) s.removeProperty(`--${k}`); else s.setProperty(`--${k}`, colors[k]);
  }
}
apply();
const themeOf = () => Object.keys(THEMES).find((name) => (Object.keys(colors) as (keyof Colors)[]).every((k) => THEMES[name][k].toLowerCase() === colors[k].toLowerCase())) ?? '';

const fmt = (c: Control, v: number) => `${Number(v.toFixed(2))}${c.unit ?? ''}`;

export function mountTunePanel() {
  if (!import.meta.env.DEV) return;
  const panel = document.createElement('details');
  panel.className = 'tune';
  panel.innerHTML = `<summary>${t.tuning}</summary>${GROUPS.map(([title, controls]) => `<fieldset><legend>${title}</legend>${
    controls.map((c) => `<label><span>${c.label}</span><output data-out="${c.key}"></output>
      <input type="range" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join('')}</fieldset>`).join('')}
    <fieldset class="tune-colors"><legend>Colors</legend>
      <label class="tune-theme"><span>Theme</span><select data-theme>${Object.keys(THEMES).map((name) => `<option>${name}</option>`).join('')}<option value="">Custom</option></select></label>
      ${(Object.keys(colors) as (keyof Colors)[]).map((k) => `<label class="tune-color"><span>${COLOR_LABELS[k]}</span><output data-out="${k}"></output><input type="color" data-color="${k}"></label>`).join('')}</fieldset>
    <div class="tune-actions"><button type="button" class="plain" data-tune="copy">${t.copy}</button><button type="button" class="plain" data-tune="reset">${t.resetTuning}</button></div>`;
  // Gestures over the panel are not Zumly's.
  panel.dataset.noSwipe = '';
  for (const type of ['wheel', 'keydown', 'mouseup', 'touchend', 'click']) panel.addEventListener(type, (e) => e.stopPropagation());
  document.body.append(panel);

  const controls = GROUPS.flatMap(([, c]) => c);
  const sync = () => {
    for (const c of controls) {
      panel.querySelector<HTMLInputElement>(`[data-key="${c.key}"]`)!.value = String(tune[c.key]);
      const out = panel.querySelector<HTMLOutputElement>(`[data-out="${c.key}"]`)!;
      out.textContent = fmt(c, tune[c.key]);
      out.classList.toggle('changed', tune[c.key] !== DEFAULTS[c.key]);
    }
    for (const k of Object.keys(colors) as (keyof Colors)[]) {
      panel.querySelector<HTMLInputElement>(`[data-color="${k}"]`)!.value = colors[k];
      const out = panel.querySelector<HTMLOutputElement>(`[data-out="${k}"]`)!;
      out.textContent = colors[k];
      out.classList.toggle('changed', colors[k] !== THEMES.Graphite[k]);
    }
    panel.querySelector<HTMLSelectElement>('[data-theme]')!.value = themeOf();
  };
  const changed = () => {
    try { localStorage.setItem(KEY, JSON.stringify(tune)); localStorage.setItem(COLOR_KEY, JSON.stringify(colors)); } catch { /* only to remember */ }
    apply();
    sync();
    window.dispatchEvent(new Event('pulse-tune'));
  };
  panel.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.key as keyof Tune | undefined, color = input.dataset.color as keyof Colors | undefined;
    if (key) tune[key] = Number(input.value);
    else if (color) colors[color] = input.value;
    else if (input.matches('[data-theme]')) { if (input.value in THEMES) Object.assign(colors, THEMES[input.value]); else return; }
    else return;
    changed();
  });
  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tune]')?.dataset.tune;
    if (act === 'reset') { Object.assign(tune, DEFAULTS); Object.assign(colors, THEMES.Graphite); changed(); }
    if (act === 'copy') {
      const text = [...controls.map((c) => `${c.label}: ${fmt(c, tune[c.key])}`),
        ...(Object.keys(colors) as (keyof Colors)[]).map((k) => `--${k}: ${colors[k]};`)].join('\n');
      void navigator.clipboard?.writeText(text);
      const btn = e.target as HTMLElement;
      btn.textContent = t.copied;
      setTimeout(() => { btn.textContent = t.copy; }, 1200);
    }
  });
  sync();
}
