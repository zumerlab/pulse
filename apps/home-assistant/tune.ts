// Live tuning of the board's orbit and layers, development only (`npm run dev`).
// The values are kept in the browser; "Copy" puts on the clipboard the ones to
// carry into the code once they convince.

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

const KEY = 'pulse-ha-tune';
export const tune: Tune = { ...DEFAULTS };
// Only the keys that still exist: a value kept by an old build (the tilts of
// 31/10, both gone) stays out, and the panel has no control for it.
try {
  const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  for (const k of Object.keys(DEFAULTS) as (keyof Tune)[]) if (typeof kept[k] === 'number') tune[k] = kept[k];
} catch { /* no storage: code values */ }

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
}
apply();

const fmt = (c: Control, v: number) => `${Number(v.toFixed(2))}${c.unit ?? ''}`;

export function mountTunePanel() {
  if (!import.meta.env.DEV) return;
  const panel = document.createElement('details');
  panel.className = 'tune';
  panel.innerHTML = `<summary>${t.tuning}</summary>${GROUPS.map(([title, controls]) => `<fieldset><legend>${title}</legend>${
    controls.map((c) => `<label><span>${c.label}</span><output data-out="${c.key}"></output>
      <input type="range" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join('')}</fieldset>`).join('')}
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
  };
  const changed = () => {
    try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch { /* only to remember */ }
    apply();
    sync();
    window.dispatchEvent(new Event('pulse-tune'));
  };
  panel.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.key as keyof Tune | undefined;
    if (!key) return;
    tune[key] = Number(input.value);
    changed();
  });
  panel.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tune]')?.dataset.tune;
    if (act === 'reset') { Object.assign(tune, DEFAULTS); changed(); }
    if (act === 'copy') {
      const text = controls.map((c) => `${c.label}: ${fmt(c, tune[c.key])}`).join('\n');
      void navigator.clipboard?.writeText(text);
      const btn = e.target as HTMLElement;
      btn.textContent = t.copied;
      setTimeout(() => { btn.textContent = t.copy; }, 1200);
    }
  });
  sync();
}
