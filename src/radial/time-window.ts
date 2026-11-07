// One way to read time on a ring: now at the top, the past running clockwise
// into it. Bars per slot (a day of hours, a month of days) and changes as
// marks with their system's glyph.

import { esc } from './markup.ts';
import { arcPath, polar } from './arc.ts';

// Every ring that shows time reads the same way: now at the top, the past
// running clockwise into it (the oldest just right of the top, fainter the
// older), the slot past now left empty as the seam. The ring is a window of
// time, never a clock face: no numerals on the rim, one tick at now, at most a
// notch where a month turns. The clock time itself is text, in the face.
// `bars` are values per slot, oldest first, the last one now (a day of hours,
// a month of days); `marks` are changes at their moment, each with its
// system's glyph just outside the ring and its text shown when picked
// (`picked`; the host handles `data-tmark`). An SVG of its own, drawn at the
// width of its box; the marks may go past it (overflow visible).
export type TimeMark = { ago: number; level?: number; glyph: string; when: string; text: string; name: string };
export type TimeWindow = {
  span: number;                       // the window, in the units of `ago` (hours, days)
  bars?: (number | null)[];           // one per slot, oldest first; the last is now
  marks?: TimeMark[];
  picked?: number;                    // the mark whose text shows
  turn?: { at: number; label: string };   // a notch where a month turns: the slot (from the oldest) it starts at
  wake?: boolean;                     // a faint band brightening into now
  look?: TimeLook;
  open?: { to: string; props?: Record<string, string> };   // a Zumly view the picked mark zooms into (its full list), on a second tap
  aria: string;
};
// The measures, in units of a 300-wide box whose face (the center's disc) is
// 246 across: the gap between the face and the ring, how tall a bar may grow,
// and how far out the marks sit. The tuning panel moves them.
export type TimeLook = { gap: number; bar: number; mark: number };
export const TIME_LOOK: TimeLook = { gap: 5, bar: 26, mark: 24 };
const FACE_R = 123;
export function timeWindow(tw: TimeWindow) {
  const lk = tw.look ?? TIME_LOOK, R = FACE_R + lk.gap;
  const TW = { r: R, bar: lk.bar, mark: R + lk.mark, far: R + lk.mark + 22 };
  const at = (ago: number) => 360 * (1 - ago / tw.span);
  const out: string[] = [`<circle class="tw-track" r="${TW.r}"></circle>`];
  if (tw.wake) for (let k = 0; k < 48; k++) {
    const a0 = at((k + 1) * tw.span / 48) + 0.4, a1 = at(k * tw.span / 48) - 0.4;
    out.push(`<path class="tw-wake" d="${arcPath(a0, a1, TW.r)}" style="opacity:${((1 - k / 48) ** 1.6 * 0.4).toFixed(2)}"></path>`);
  }
  const bars = tw.bars ?? [], n = bars.length;
  if (n) {
    // n slots plus the seam: a slot is span / n wide; the one past now stays empty.
    const nums = bars.filter((v): v is number => v != null), hi = Math.max(1e-9, ...nums);
    const slot = 360 / (n + 1);
    bars.forEach((v, i) => {
      // Now ends at the top; each slot before it one step back; the slot right of the top is the seam.
      const ago = n - 1 - i, end = 360 - slot * ago - 0.8, start = end - slot + 1.6;
      if (v == null) { out.push(`<path class="tw-bar is-empty" d="${arcPath(start, end, TW.r)}"></path>`); return; }
      const h = 3 + TW.bar * v / hi;
      out.push(`<path class="tw-bar${ago === 0 ? ' is-now' : ''}" d="${arcPath(start, end, TW.r + h / 2)}" style="stroke-width:${h.toFixed(1)}; opacity:${ago === 0 ? 1 : Math.max(0.25, 0.75 - 0.5 * ago / n).toFixed(2)}"></path>`);
    });
    if (tw.turn) {
      const a = 360 - slot * (n - tw.turn.at), [x0, y0] = polar(a, TW.r - 4), [x1, y1] = polar(a, TW.r - 14), [tx, ty] = polar(a - 3, TW.r - 26);
      out.push(`<line class="tw-turn" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"></line>
        <text class="tw-turn-label" x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}" text-anchor="${a > 180 ? 'start' : 'end'}">${esc(tw.turn.label)}</text>`);
    }
  }
  // Now: one tick across the ring at the top.
  out.push(`<line class="tw-now" x1="0" y1="${-(TW.r - 7)}" x2="0" y2="${-(TW.r + 7)}"></line>`);
  // The marks: a tick at their moment; outside, a disc with their system's glyph
  // (two that fall close alternate their distance); the picked one says its text.
  let prev: number | null = null, prevFar = false;
  const marks = (tw.marks ?? []).filter((m) => m.ago >= 0 && m.ago <= tw.span).map((m, i) => {
    const a = at(m.ago), far = prev != null && Math.abs(prev - a) < 12 && !prevFar;
    prev = a; prevFar = far;
    const rr = far ? TW.far : TW.mark, [t0x, t0y] = polar(a, TW.r - 7), [t1x, t1y] = polar(a, TW.r + 7), [sx, sy] = polar(a, TW.r + 8), [ex, ey] = polar(a, rr - 10), [gx, gy] = polar(a, rr);
    const lvl = m.level ? ` level-${m.level}` : '', picked = i === tw.picked;
    const fade = picked ? 1 : Math.max(0.35, 1 - m.ago / tw.span);
    let label = '';
    if (picked) {
      const [lx, ly] = polar(a, rr + 20), anchor = a > 330 || a < 30 ? 'middle' : a < 180 ? 'start' : 'end';
      // Short on the ring: when and whose. The full text waits one tap further (open).
      const short = m.text.length > 34 ? `${m.text.slice(0, 32).trimEnd()}…` : m.text;
      label = `<text class="tw-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}"><tspan class="tw-when">${esc(m.when)}</tspan> ${esc(tw.open ? m.name : short)}${tw.open ? ' ›' : ''}</text>`;
    }
    return `<g class="tw-mark${lvl}${picked ? ' is-picked' : ''}" style="opacity:${fade.toFixed(2)}">
      <path class="tw-tick" d="M ${t0x.toFixed(1)} ${t0y.toFixed(1)} L ${t1x.toFixed(1)} ${t1y.toFixed(1)}"></path>
      <path class="tw-stem" d="M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}"></path>
      <g class="tw-hit${picked && tw.open ? ' zoom-me' : ''}" data-tmark="${i}"${picked && tw.open ? ` data-to="${esc(tw.open.to)}"${Object.entries(tw.open.props ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('')}` : ''} role="button" tabindex="0" aria-label="${esc(`${m.when} ${m.name}: ${m.text}`)}"${picked ? ' aria-pressed="true"' : ''}>
        <circle class="tw-disc" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="10"></circle>
        <g class="glyph tw-glyph" transform="translate(${(gx - 6.5).toFixed(1)} ${(gy - 6.5).toFixed(1)}) scale(.54)"><path d="${m.glyph}"></path></g></g>${label}</g>`;
  }).join('');
  return `<svg class="time-window" viewBox="-150 -150 300 300" role="img" aria-label="${esc(tw.aria)}">${out.join('')}${marks}</svg>`;
}
