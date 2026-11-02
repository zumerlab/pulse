// The ring around the orbit's face: one segment per system pointing at it,
// and, with time on, the news inside.

import { esc } from './markup.ts';
import { arcPath, polar } from './arc.ts';

// The ring around the orbit's face. Outside, one segment per system, centered
// on its satellite and pointing at it (a small triangle or a notch at the
// middle of the arc), in its level's weight and color. A gap in; then, when
// time is on, the news: the last hours as a faint wake brightening into now
// (now at the top), the alerts still open as dots at the moment they began
// (the one in the face with a wave; all the same size), or, for a calm day,
// one bar per hour as tall as what changed in it. Returns the SVG and how far
// in the face sits (`inset`, a share of the hub's width) so the host can size
// the face to leave the gap. An SVG of its own in a 300-wide box.
export type HubLook = { gap: number; pointer: 'triangle' | 'notch' | 'none'; size: number; bar: number };
export const HUB_LOOK: HubLook = { gap: 22, pointer: 'triangle', size: 9, bar: 14 };
export type HubNews = { span: number; alerts?: { ago: number; level: 1 | 2; current?: boolean }[]; bars?: (number | null)[] };
const HUB_R = 140;
export function orbitHub(o: { levels: number[]; news?: HubNews; look?: HubLook; rounded?: boolean; aria: string }) {
  const lk = o.look ?? HUB_LOOK, n = Math.max(1, o.levels.length), step = 360 / n;
  const out: string[] = [];
  o.levels.forEach((level, i) => {
    const a = (i + 0.5) * step, w = [3, 5, 6][level] ?? 3, lv = level ? ` level-${level}` : '';
    out.push(`<path class="oh-seg${lv}${o.rounded ? ' is-rounded' : ''}" d="${arcPath(a - step / 2 + 4, a + step / 2 - 4, HUB_R)}" style="stroke-width:${w}"></path>`);
    const edge = HUB_R + w / 2;
    if (lk.pointer === 'triangle') {
      const half = lk.size * 0.45 * 180 / Math.PI / HUB_R, [tx, ty] = polar(a, edge + lk.size), [x0, y0] = polar(a - half, edge - 0.5), [x1, y1] = polar(a + half, edge - 0.5);
      out.push(`<path class="oh-ptr${lv}" d="M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} Z"></path>`);
    } else if (lk.pointer === 'notch') {
      const [x0, y0] = polar(a, edge), [x1, y1] = polar(a, edge + lk.size + 3);
      out.push(`<path class="oh-notch${lv}" d="M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}"></path>`);
    }
  });
  const rn = HUB_R - lk.gap;
  if (o.news) {
    const nw = o.news, at = (ago: number) => 360 * (1 - ago / nw.span);
    const bars = nw.bars ?? [];
    if (bars.length) {
      // A calm day: a bar per slot from the news ring outward, never into the segments.
      const nums = bars.filter((v): v is number => v != null), hi = Math.max(1e-9, ...nums), slot = 360 / (bars.length + 1);
      const reach = Math.max(4, Math.min(lk.bar, lk.gap - 8));
      bars.forEach((v, i) => {
        const ago = bars.length - 1 - i, end = 360 - slot * ago - 0.8, start = end - slot + 1.6, h = v == null ? 1.5 : 1.5 + reach * v / hi;
        out.push(`<path class="oh-bar${ago === 0 ? ' is-now' : ''}" d="${arcPath(start, end, rn + h / 2)}" style="stroke-width:${h.toFixed(1)}; opacity:${ago === 0 ? 1 : Math.max(0.25, 0.75 - 0.5 * ago / bars.length).toFixed(2)}"></path>`);
      });
    } else {
      for (let k = 0; k < 36; k++) out.push(`<path class="oh-wake" d="${arcPath(at((k + 1) * nw.span / 36) + 0.5, at(k * nw.span / 36) - 0.5, rn)}" style="opacity:${((1 - k / 36) ** 1.8 * 0.35).toFixed(2)}"></path>`);
    }
    out.push(`<line class="oh-now" x1="0" y1="${-(rn - 6)}" x2="0" y2="${-(rn + 6)}"></line>`);
    // Each open alert at the moment it began, with its wave. Alerts that began
    // close together would sit on one spot: the older steps back along the
    // ring until they read as separate dots.
    const SEP = 11;
    let prev = Infinity;
    const shown = (nw.alerts ?? []).filter((al) => al.ago >= 0 && al.ago <= nw.span).sort((a, b) => a.ago - b.ago);
    const placed = shown.map((al) => { const a = Math.min(at(al.ago), prev - SEP); prev = a; return { al, a }; });
    // Draw the current one last, so its wave runs over the others.
    for (const { al, a } of placed.sort((p, q) => Number(!!p.al.current) - Number(!!q.al.current))) {
      const [x, y] = polar(a, rn);
      const cur = al.current ? ' is-current' : '';
      out.push(`<circle class="oh-wave level-${al.level}${cur}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"></circle>`);
      out.push(`<circle class="oh-alert level-${al.level}${cur}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"></circle>`);
    }
  }
  const face = o.news ? rn - 10 : HUB_R - 14;
  return { svg: `<svg class="orbit-hub" viewBox="-150 -150 300 300" role="img" aria-label="${esc(o.aria)}">${out.join('')}</svg>`, inset: (150 - face) / 300 };
}
