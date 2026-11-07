// What every primitive writes with: escaped text, a glyph, an alert's color.

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function icon(path: string, size = 22) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

export const levelColor = (level?: 1 | 2) => level === 2 ? 'var(--critical)' : level === 1 ? 'var(--minor)' : 'var(--ink)';
