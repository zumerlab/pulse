// Pulse inside a Home Assistant dashboard: the `pulse-card` custom card and
// the `pulse` dashboard strategy (one panel view with the card), in one file.
// Orbit's and Zumly's CSS travel inside the card (adopted by its shadow root);
// Orbit's registered properties go once at document level, where @property
// works (see docs/home-assistant-integration.md).

import '@zumer/orbit';
import orbitCss from '@zumer/orbit/style?inline';
import zumlyCss from 'zumly/style.css?inline';
import pulseCss from '@zumer/pulse/style.css?inline';
import appCss from '../style.css?inline';
import { mountPulse, type PulseHandle } from '../app.ts';
import { HassSource } from './hass-source.ts';
import type { CardConfig, HomeAssistant, LovelaceCard } from './hass.ts';

const DOCS = 'https://github.com/zumerlab/pulse';

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
  private config: CardConfig = { type: 'custom:pulse-card' };

  static getStubConfig() { return {}; }

  setConfig(config: CardConfig) { this.config = { ...this.config, ...config }; }

  set hass(hass: HomeAssistant) { this.source.setHass(hass); }

  connectedCallback() {
    if (this.pulse) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = sheets;
    root.innerHTML = '<div class="zumly-canvas" tabindex="0"></div>';
    this.pulse = mountPulse(root.querySelector<HTMLElement>('.zumly-canvas')!, { source: this.source });
  }

  disconnectedCallback() {
    this.pulse?.destroy();
    this.pulse = null;
  }

  // Masonry rows of 50 px; in sections, the full width and as many rows as it needs.
  getCardSize() { return 10; }
  getGridOptions() { return { columns: 'full' as const, rows: 'auto' as const, min_columns: 6, min_rows: 6 }; }
}

// "Pulse" as a dashboard type: the New dashboard dialog lists it under
// Community dashboards, and it generates one panel view with the card.
class PulseDashboardStrategy extends HTMLElement {
  static async generate(config: { strategy?: Record<string, unknown> }) {
    return {
      title: 'Pulse',
      views: [{ title: 'Pulse', path: 'pulse', type: 'panel', cards: [{ type: 'custom:pulse-card', ...(config.strategy?.card as object ?? {}) }] }],
    };
  }
}

customElements.define('pulse-card', PulseCard);
customElements.define('ll-strategy-dashboard-pulse', PulseDashboardStrategy);
window.customCards = window.customCards ?? [];
window.customCards.push({
  type: 'pulse-card', name: 'Pulse', preview: false, documentationURL: DOCS,
  description: 'Your home as one radial object per system, layered by urgency: the one calling the most in front, with its control on the ring.',
});
window.customStrategies = window.customStrategies ?? [];
window.customStrategies.push({
  type: 'pulse', strategyType: 'dashboard', name: 'Pulse', documentationURL: DOCS,
  description: 'One full-screen Pulse: the board of your systems, each a radial object you zoom into.',
});
