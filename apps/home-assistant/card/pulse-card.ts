// Pulse inside a Home Assistant dashboard: the `pulse-card` custom card, the
// `pulse` dashboard strategy (one panel view with the card) and the `pulse`
// section strategy (one section with the card), in one file. Orbit's and
// Zumly's CSS travel inside the card (adopted by its shadow root); Orbit's
// registered properties go once at document level, where @property works (see
// docs/home-assistant-integration.md).

import '@zumer/orbit';
import orbitCss from '@zumer/orbit/style?inline';
import zumlyCss from 'zumly/style.css?inline';
import pulseCss from '@zumer/pulse/style.css?inline';
import appCss from '../style.css?inline';
import { mountPulse, BOARD_MODES, type BoardMode, type PulseHandle } from '../app.ts';
import { systems } from '../model.ts';
import { HassSource } from './hass-source.ts';
import type { CardConfig, ConfigForm, FormSchema, HomeAssistant, LovelaceCard } from './hass.ts';

const DOCS = 'https://github.com/zumerlab/pulse';

// The card's options (all optional), also accepted by the two strategies.
export type PulseCardConfig = CardConfig & {
  // Which systems the board shows; by default all seven.
  systems?: string[];
  // Only the entities in these areas (area ids); by default the whole home.
  areas?: string[];
  // The board's view to start with: grid, orbit or layers. Without it, the
  // last one the person chose, remembered by the browser.
  mode?: BoardMode;
  // Open inside this system; the board stays one step out.
  start?: string;
  // The gear on the board, where whoever looks at the card chooses its systems
  // and view for their browser (default true). `false` hides it: the config rules.
  settings?: boolean;
};

const SYSTEM_IDS = systems.map((s) => s.id);
const MODE_LABELS: Record<BoardMode, string> = { grid: 'Grid', orbit: 'Orbit', layers: 'Layers' };
const LABELS: Record<string, string> = { systems: 'Systems', areas: 'Areas', mode: 'Board view', start: 'Open inside', settings: 'Viewer settings (the gear)' };
const HELPERS: Record<string, string> = {
  systems: 'Leave empty for all of them.',
  areas: 'Only what is in these areas; leave empty for the whole home. An entity with no area stays out.',
  mode: 'The view when the card opens, until the viewer picks another in their browser.',
  start: 'The card opens zoomed into this system; the board is one step back.',
  settings: 'Whoever looks at the card can choose its systems and view, kept in their browser. Off, the options above rule.',
};

const FORM: FormSchema[] = [
  { name: 'systems', selector: { select: { multiple: true, mode: 'list', options: systems.map((s) => ({ value: s.id, label: s.title })) } } },
  { name: 'areas', selector: { area: { multiple: true } } },
  { name: 'mode', selector: { select: { mode: 'dropdown', options: BOARD_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] })) } } },
  { name: 'start', selector: { select: { mode: 'dropdown', options: systems.map((s) => ({ value: s.id, label: s.title })) } } },
  { name: 'settings', default: true, selector: { boolean: {} } },
];

function assertConfig(config: PulseCardConfig) {
  if (config.systems !== undefined && !Array.isArray(config.systems)) throw new Error('systems must be a list of system ids');
  for (const id of config.systems ?? []) if (!SYSTEM_IDS.includes(id)) throw new Error(`Unknown system "${id}". One of: ${SYSTEM_IDS.join(', ')}`);
  if (config.areas !== undefined && (!Array.isArray(config.areas) || config.areas.some((a) => typeof a !== 'string'))) throw new Error('areas must be a list of area ids');
  if (config.mode !== undefined && !BOARD_MODES.includes(config.mode)) throw new Error(`mode must be one of ${BOARD_MODES.join(', ')}`);
  if (config.start !== undefined && !SYSTEM_IDS.includes(config.start)) throw new Error(`Unknown system "${config.start}" in start`);
  if (config.start && config.systems?.length && !config.systems.includes(config.start)) throw new Error('start must be one of the systems shown');
  if (config.settings !== undefined && typeof config.settings !== 'boolean') throw new Error('settings must be true or false');
}

// A strategy's `generate` receives its own `strategy:` object (`type` and the
// options next to it); the card's options go through to the card.
function cardConfig(strategy: Record<string, unknown> = {}): PulseCardConfig {
  const { systems, areas, mode, start, settings } = strategy as PulseCardConfig;
  return { type: 'custom:pulse-card', ...(systems ? { systems } : {}), ...(areas?.length ? { areas } : {}), ...(mode ? { mode } : {}), ...(start ? { start } : {}),
    ...(settings === false ? { settings } : {}) };
}

// @property declared in a shadow-root stylesheet is ignored; Orbit's five are
// registered here, once per page. Orbit's own CSS registers them again on a
// page that loads it; `registerProperty` throws on the second time, so each
// one is tried on its own.
const PROPERTIES: [string, string, string][] = [
  ['--o-dir-x', '<number>', '0'], ['--o-dir-y', '<number>', '0'], ['--o-value-angle', '<angle>', '0deg'],
  ['--o-ellipse-x', '<number>', '1'], ['--o-ellipse-y', '<number>', '1'],
];
if ('registerProperty' in CSS) {
  for (const [name, syntax, initialValue] of PROPERTIES) {
    try { CSS.registerProperty({ name, syntax, inherits: true, initialValue }); } catch { /* already registered */ }
  }
}

const cardCss = `
:host { display: block; position: relative; height: 100%; min-height: 420px; overflow: hidden; border-radius: inherit; background: var(--bg); color: var(--ink); }
.zumly-canvas { position: absolute; inset: 0; }
`;
const sheets = [orbitCss, zumlyCss, pulseCss, appCss, cardCss].map((css) => {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
});

class PulseCard extends HTMLElement implements LovelaceCard {
  private source = new HassSource();
  private pulse: PulseHandle | null = null;
  private config: PulseCardConfig = { type: 'custom:pulse-card' };

  static getStubConfig() { return {}; }

  // The visual editor: a form over the three options.
  static getConfigForm(): ConfigForm {
    return {
      schema: FORM,
      assertConfig,
      computeLabel: (schema) => LABELS[schema.name],
      computeHelper: (schema) => HELPERS[schema.name],
    };
  }

  setConfig(config: PulseCardConfig) {
    assertConfig(config);
    this.config = { ...config, type: 'custom:pulse-card' };
    // Options changed on a mounted card (the editor's live preview): mount again.
    if (this.pulse) { this.unmount(); this.mount(); }
  }

  set hass(hass: HomeAssistant) { this.source.setHass(hass); }

  connectedCallback() { if (!this.pulse) this.mount(); }

  disconnectedCallback() { this.unmount(); }

  private mount() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = sheets;
    root.innerHTML = '<div class="zumly-canvas" tabindex="0"></div>';
    const { systems, areas, mode, start, settings } = this.config;
    // The viewer's choices are kept per card config: a card set up differently
    // starts afresh.
    const key = `pulse-card:${JSON.stringify({ systems, areas, mode, start })}`;
    this.pulse = mountPulse(root.querySelector<HTMLElement>('.zumly-canvas')!, { source: this.source, systems, areas, mode, start, settings: settings === false ? false : key });
  }

  private unmount() {
    this.pulse?.destroy();
    this.pulse = null;
  }

  // Masonry rows of 50 px; in sections, the full width and as many rows as it needs.
  getCardSize() { return 10; }
  getGridOptions() { return { columns: 'full' as const, rows: 'auto' as const, min_columns: 6, min_rows: 6 }; }
}

// "Pulse" as a dashboard type: the New dashboard dialog lists it under
// Community dashboards, and it generates one panel view with the card. The
// card's options go under `strategy:` next to `type`.
class PulseDashboardStrategy extends HTMLElement {
  static async generate(config: Record<string, unknown>) {
    return { title: 'Pulse', views: [{ title: 'Pulse', path: 'pulse', type: 'panel', cards: [cardConfig(config)] }] };
  }
}

// "Pulse" as a section of a sections view: one grid with the card, full
// width of the section. Same options.
class PulseSectionStrategy extends HTMLElement {
  static async generate(config: Record<string, unknown>) {
    return { type: 'grid', cards: [cardConfig(config)] };
  }
}

customElements.define('pulse-card', PulseCard);
customElements.define('ll-strategy-dashboard-pulse', PulseDashboardStrategy);
customElements.define('ll-strategy-section-pulse', PulseSectionStrategy);
window.customCards = window.customCards ?? [];
window.customCards.push({
  type: 'pulse-card', name: 'Pulse', preview: true, documentationURL: DOCS,
  description: 'Your home as one radial object per system, layered by urgency: the one calling the most in front, with its control on the ring.',
});
window.customStrategies = window.customStrategies ?? [];
window.customStrategies.push(
  { type: 'pulse', strategyType: 'dashboard', name: 'Pulse', documentationURL: DOCS, description: 'One full-screen Pulse: the board of your systems, each a radial object you zoom into.' },
  { type: 'pulse', strategyType: 'section', name: 'Pulse', documentationURL: DOCS, description: 'Pulse as a section: the board, or one system, inside a sections view.' },
);
