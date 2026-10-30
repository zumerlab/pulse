// Ajuste en vivo de la órbita y las capas del tablero, solo en desarrollo
// (`npm run dev`). Los valores se guardan en el navegador; "Copiar" deja en el
// portapapeles los que hay que pasar al código cuando uno convence.

export type Tune = {
  orbit: number; tile: number; align: number; hub: number; orbitStep: number;
  layerGrow: number; layerStep: number; layerZoom: number; layerOpacity: number;
  tilt: number;
};

// Los valores que usa el código hoy.
export const DEFAULTS: Tune = {
  orbit: 10, tile: 3.5, align: 20, hub: 11, orbitStep: -110,
  layerGrow: 0.16, layerStep: -70, layerZoom: 1.1, layerOpacity: 0.6,
  tilt: 7,
};

type Control = { key: keyof Tune; label: string; min: number; max: number; step: number; unit?: string };
const GROUPS: [string, Control[]][] = [
  ['Órbita', [
    { key: 'orbit', label: 'Órbita de los sistemas', min: 6, max: 12, step: 1 },
    { key: 'tile', label: 'Anillo de cada sistema (carriles)', min: 2, max: 5, step: 0.1 },
    { key: 'align', label: 'Corrimiento hacia adentro', min: 0, max: 60, step: 1, unit: 'px' },
    { key: 'hub', label: 'Pulso del centro (carriles)', min: 6, max: 14, step: 0.5 },
    { key: 'orbitStep', label: 'Distancia de los sistemas atrás', min: -250, max: 0, step: 5, unit: 'px' },
  ]],
  ['Capas', [
    { key: 'layerGrow', label: 'Crecimiento por capa', min: 0, max: 0.42, step: 0.01 },
    { key: 'layerStep', label: 'Distancia entre capas', min: -150, max: 0, step: 5, unit: 'px' },
    { key: 'layerZoom', label: 'Zoom del objeto', min: 0.7, max: 1.5, step: 0.05 },
    { key: 'layerOpacity', label: 'Opacidad de las capas de atrás', min: 0.2, max: 1, step: 0.05 },
  ]],
  ['3D', [
    { key: 'tilt', label: 'Inclinación máxima', min: 0, max: 20, step: 1, unit: '°' },
  ]],
];

const KEY = 'pulse-ha-tune';
export const tune: Tune = { ...DEFAULTS };
try { Object.assign(tune, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* sin almacenamiento: valores del código */ }

// Lo que es CSS va en variables de la raíz; lo que cambia el marcado (la órbita,
// el crecimiento de las capas) pide redibujar el tablero.
function apply() {
  const s = document.documentElement.style;
  s.setProperty('--t-tile', String(tune.tile));
  s.setProperty('--t-align', `${tune.align}px`);
  s.setProperty('--t-hub', String(tune.hub));
  s.setProperty('--t-orbit-step', String(tune.orbitStep));
  s.setProperty('--t-layer-step', String(tune.layerStep));
  s.setProperty('--t-layer-zoom', String(tune.layerZoom));
  s.setProperty('--t-layer-opacity', String(tune.layerOpacity));
}
apply();

const fmt = (c: Control, v: number) => `${Number(v.toFixed(2))}${c.unit ?? ''}`;

export function mountTunePanel() {
  if (!import.meta.env.DEV) return;
  const panel = document.createElement('details');
  panel.className = 'tune';
  panel.innerHTML = `<summary>Ajustes</summary>${GROUPS.map(([title, controls]) => `<fieldset><legend>${title}</legend>${
    controls.map((c) => `<label><span>${c.label}</span><output data-out="${c.key}"></output>
      <input type="range" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join('')}</fieldset>`).join('')}
    <div class="tune-actions"><button type="button" class="plain" data-tune="copy">Copiar</button><button type="button" class="plain" data-tune="reset">Volver a los del código</button></div>`;
  // Los gestos sobre el panel no son de Zumly.
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
    try { localStorage.setItem(KEY, JSON.stringify(tune)); } catch { /* solo para recordar */ }
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
      btn.textContent = 'Copiado';
      setTimeout(() => { btn.textContent = 'Copiar'; }, 1200);
    }
  });
  sync();
}
