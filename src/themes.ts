// The themes of the object: the seven tokens of style.css, each set by name.
// Graphite, Paper and Deep tell an alert by hue (amber, red). Slate, Mist, Fog
// and Night keep to one blue-grey family and tell it by tone: the most urgent
// is the deepest ink on a light ground (the brightest on a dark one), the next
// a middle tone, what is fine a pale line; the weight of the ring and the wave
// do the rest. Every text color keeps 4.5:1 on its ground.

export type Theme = { bg: string; ink: string; muted: string; dim: string; line: string; minor: string; critical: string };

export const THEMES = {
  graphite: { bg: '#0e1013', ink: '#f2f3f5', muted: '#9aa0a8', dim: '#3a3f47', line: '#262a31', minor: '#ffb020', critical: '#ff5a4f' },
  paper: { bg: '#f3f0e9', ink: '#1d1b18', muted: '#6c665c', dim: '#cfc7b8', line: '#e2dccf', minor: '#c46a00', critical: '#cf3a2d' },
  deep: { bg: '#0b1220', ink: '#e8eefb', muted: '#8ea0c2', dim: '#2a3a56', line: '#1a2740', minor: '#ffc452', critical: '#ff6e66' },
  slate: { bg: '#e4e9ef', ink: '#1e2a38', muted: '#4f5e71', dim: '#b4bfcc', line: '#d3dae3', minor: '#4d6580', critical: '#1d3654' },
  mist: { bg: '#e1e8f0', ink: '#1b2b3f', muted: '#4a5d75', dim: '#b0bfd0', line: '#cfd9e5', minor: '#4a6585', critical: '#17365e' },
  fog: { bg: '#e7e9ec', ink: '#232b35', muted: '#535d6a', dim: '#b9bfc7', line: '#d6d9de', minor: '#566270', critical: '#1f2f40' },
  night: { bg: '#0e1218', ink: '#eef2f6', muted: '#9aa6b5', dim: '#364150', line: '#222a34', minor: '#8ea2b9', critical: '#cfe0f4' },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;
export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
export const DEFAULT_THEME: ThemeName = 'graphite';
// The light ones: the browser's controls and scrollbars follow.
export const LIGHT_THEMES: ThemeName[] = ['paper', 'slate', 'mist', 'fog'];

// Puts a theme's tokens on an element (the mount, a card's host): they win over
// the stylesheet's and everything inside inherits them. The default theme
// writes nothing, so the stylesheet (and the tuning panel in development) rule.
export function applyTheme(el: HTMLElement, name: ThemeName = DEFAULT_THEME) {
  const theme: Theme = THEMES[name] ?? THEMES[DEFAULT_THEME];
  for (const k of Object.keys(theme) as (keyof Theme)[]) {
    if (name === DEFAULT_THEME) el.style.removeProperty(`--${k}`); else el.style.setProperty(`--${k}`, theme[k]);
  }
  // The text and the ground follow too: `color` is inherited as the value
  // computed above the mount, which still holds the stylesheet's ink.
  if (name === DEFAULT_THEME) { el.style.removeProperty('color'); el.style.removeProperty('background'); }
  else { el.style.color = 'var(--ink)'; el.style.background = 'var(--bg)'; }
  el.dataset.theme = name;
  el.style.colorScheme = LIGHT_THEMES.includes(name) ? 'light' : 'dark';
}

// Colors of one's own: the seven tokens as given (the ones missing from the
// default theme), on an element, the same way as a theme. Light or dark is
// told by the background.
export function applyColors(el: HTMLElement, colors: Partial<Theme>) {
  const theme: Theme = { ...THEMES[DEFAULT_THEME], ...colors };
  for (const k of Object.keys(theme) as (keyof Theme)[]) el.style.setProperty(`--${k}`, theme[k]);
  el.style.color = 'var(--ink)';
  el.style.background = 'var(--bg)';
  el.dataset.theme = 'custom';
  el.style.colorScheme = isLight(theme.bg) ? 'light' : 'dark';
}
// A color's relative luminance above the middle: a light ground.
export function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16), lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.18;
}
