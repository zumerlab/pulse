// Time on a ring, the way the detail draws it: a day of a number as bars
// around a baseline, a day per thing as concentric rings, a month as a
// calendar, and a clock's rim. Now is always at the top.

import { num, t, time } from '../i18n.ts';
import { esc } from './markup.ts';

export type TimeRing = {
  values: (number | null)[];           // one per hour, oldest first; the last one is the current hour
  label: string;                       // under the day's range, in the center
  unit?: string;                       // after the numbers
  min?: number; max?: number;          // the scale; by default from zero (or the lowest value, when some are negative) to the highest
  marks?: boolean;                     // hour ticks on the rim and "6 h ago", "12 h ago", "18 h ago" outside
};

// The last 24 hours as a ring of radial bars, the way a voice visualizer
// draws sound: time runs clockwise and ends at the top with the current hour
// (the one bar in ink; the older, the fainter), each bar grows out from a
// baseline with the value, two bars an hour (the half hours interpolated) so
// the ring reads as a shape. The center gives the day's range. Its own
// universe; the width comes from CSS (.time-ring).
export function timeRing(tr: TimeRing) {
  const nums = tr.values.filter((v): v is number => v != null);
  const dataLo = Math.min(...nums), dataHi = Math.max(...nums);
  // The scale shows the day's shape without lying about it: the floor sits
  // half the day's swing under its lowest value (never below zero for a
  // magnitude), so a flat day stays flat and a swing is visible; the numbers
  // in the center say what the swing was.
  const swing = dataHi - dataLo;
  const lo = tr.min ?? (dataLo >= 0 ? Math.max(0, dataLo - swing / 2) : dataLo - swing / 2), hi = tr.max ?? dataHi;
  const span = hi - lo;
  const norm = (v: number) => span > 0 ? Math.min(1, Math.max(0, (v - lo) / span)) : 0.6;
  // Two bars an hour: the hour itself, then the midpoint to the next.
  const points: { v: number | null; ago: number; real: boolean }[] = [];
  tr.values.forEach((v, i, arr) => {
    const ago = arr.length - 1 - i;
    if (i > 0) { const prev = arr[i - 1]; points.push({ v: prev != null && v != null ? (prev + v) / 2 : null, ago: ago + 0.5, real: false }); }
    points.push({ v, ago, real: true });
  });
  const n = points.length || 1;
  const REACH = 6;                    // lanes from the baseline (orbit 6) to the edge of the universe
  // Each point is a sector of the ring: all of them share the baseline (the
  // rim of orbit 6) and each grows outward by its value, up to the edge of the
  // universe. Half an hour is a slot of the scale (48 to the turn), "now" sits
  // centered at the top and the slot after it stays empty: the seam of the day.
  const slots = n + 1;
  const bars = points.map(({ v, ago, real }) => {
    const start = (slots - 0.5 - 2 * ago).toFixed(1);
    if (v == null) return `<o-arc class="time-bar is-empty outer-orbit" start="${start}" value="0"></o-arc>`;
    const len = Math.max(0.25, REACH * norm(v));
    const title = real ? ` title="${esc(`${ago === 0 ? t.now : t.hoursAgo(ago)}: ${num(v)}${tr.unit ?? ''}`)}"` : '';
    // The older, the fainter.
    return `<o-arc class="time-bar outer-orbit${ago === 0 ? ' is-now' : ''}" start="${start}" value="1" interactive style="--o-size-ratio:${len.toFixed(3)}; opacity:${(1 - 0.6 * ago / (n / 2)).toFixed(2)}"${title}></o-arc>`;
  }).join('');
  // The center says now; the day's range under it, rounded to what matters.
  const r = (v: number) => num(v, Math.abs(dataHi) >= 10 ? 0 : 1);
  const last = [...tr.values].reverse().find((v): v is number => v != null);
  const range = nums.length ? (r(dataLo) === r(dataHi) ? `${r(dataHi)}${tr.unit ?? ''}` : `${r(dataLo)}–${r(dataHi)}${tr.unit ?? ''}`) : '';
  const big = last != null ? `${num(last)}${tr.unit ?? ''}` : range;
  return `<div class="bigbang time-ring${tr.marks ? ' has-marks' : ''}" role="img" aria-label="${esc(`${t.last24h}: ${range}`)}"><div class="gravity-spot">
    <div class="orbit-6 time-bars" style="--o-max:${slots}; --o-gap:1; --o-stroke-width:0">${bars}</div>
    ${tr.marks ? hourMarks() : ''}
    <div class="orbit-0" style="--o-size-ratio:8"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(big)}</span><span class="time-range">${esc(range)}</span><span class="time-label">${esc(tr.label)}</span></div></div></div>
  </div></div>`;
}
export const TIME_RING = 220;        // px; the universe of the time ring (see .time-ring in the CSS)

// Hour marks, on request: a tick per hour on the rim, longer every six, and
// "6 h ago", "12 h ago", "18 h ago" along the outside; now is the top.
const hourMarks = () => `<div class="orbit-13 time-ticks">${Array.from({ length: 24 }, (_, k) =>
    `<div class="vector time-tick${k % 6 === 0 ? ' is-major' : ''}" style="--o-size-ratio:${k % 6 === 0 ? 1 : 0.5}"></div>`).join('')}</div>
  <div class="orbit-14 time-hours" style="--o-max:24">${[6, 12, 18].map((h) =>
    `<o-arc range="auto" text-anchor="middle" start="${24 - h}"${h === 12 ? ' flip' : ''} class="time-hour">${esc(t.hAgo(h))}</o-arc>`).join('')}</div>`;

// ─── Timeline: a day per entity ─────────────────────────────────────

export type Tone = 'warn' | 'critical';
export type Track = {
  key: string;                       // data-track on its arcs: what a tap on this ring means
  name: string;                      // names its spans
  spans: [number, number][];         // when it was on, as [from, to] in hours ago (to = 0 while it still is)
  on?: boolean;                      // on right now: the ring reaches the top and glows there
  tone?: Tone;                       // the spans in an alert's color instead of ink
  act?: boolean;                     // a tap does something
  pending?: boolean;                 // a command sent and not confirmed: the ring beats
  failed?: boolean;                  // the command was refused: red outline
};
export type TimeEvent = { ago: number; text: string; tone?: Tone };   // a moment worth a word, placed at its hour
export type Timeline = {
  hours: number;                     // the window; 24 is a day
  tracks: Track[];                   // outermost first; the first MAX_TRACKS are drawn
  events?: TimeEvent[];
  big: string; label: string;        // the center: what is now
  marks?: boolean;                   // hour ticks and "6 h ago"… (24 h only)
  names?: boolean;                   // each ring named on itself, at its start
  aria: string;
};
export const MAX_TRACKS = 8;

// The last hours of several entities as concentric rings, one per entity,
// outermost first: time runs clockwise and ends at the top, where a ring that
// is on right now arrives and glows; what was on is drawn, what was off is
// the faint track under it. The seam after "now" is the same as the time
// ring's. Events sit outside the rings at their hour. Its own universe; the
// width comes from CSS (.timeline).
export function timeline(tl: Timeline) {
  // The scale is in minutes: a window of W minutes plus a seam of one 48th.
  const W = tl.hours * 60, seam = W / 48, S = W + seam, half = seam / 2;
  const at = (agoH: number) => (((S + half - agoH * 60) % S) + S) % S;
  const when = (agoH: number) => time(new Date(Date.now() - agoH * 3_600_000)).slice(0, 5);
  const tracks = tl.tracks.slice(0, MAX_TRACKS);
  const rings = tracks.map((tr, i) => {
    const cls = ['track', tr.on && 'is-on', tr.tone, tr.act && 'has-act', tr.pending && 'is-pending'].filter(Boolean).join(' ');
    const spans = tr.spans.map(([from, to]) => {
      const f = Math.min(from, tl.hours), len = (f - to) * 60;
      if (len <= 0) return '';
      const title = `${tr.name}: ${to <= 0 ? t.sinceTime(when(f)) : `${when(f)}–${when(to)}`}`;
      return `<o-arc class="track-span${tr.failed ? ' is-failed' : ''}" start="${at(f).toFixed(1)}" value="${Math.max(len, 3).toFixed(1)}" interactive data-track="${esc(tr.key)}" title="${esc(title)}"></o-arc>`;
    }).join('');
    // Each ring is named on itself, a step further round than the one outside
    // it (the names would pile up at one angle), over whatever is there.
    const name = tl.names ? `<div class="orbit-${12 - i} track-name-orbit" style="--o-from:${(half / S * 360 + 6 + i * 38).toFixed(1)}deg">
      <o-arc range="auto" class="arc-label track-name" style="font-size:${i ? 9.5 : 10.5}px">${esc(tr.name)}</o-arc></div>` : '';
    return `<div class="orbit-${12 - i} ${cls}" style="--o-max:${S}; --o-gap:0; --o-stroke-width:0; --o-size-ratio:.3">
      <o-arc class="track-back" start="${at(tl.hours).toFixed(1)}" value="${W}" interactive data-track="${esc(tr.key)}" title="${esc(tr.name)}"></o-arc>${spans}</div>${name}`;
  }).join('');
  // Events within the same half hour share a word.
  const grouped: TimeEvent[] = [];
  for (const e of [...(tl.events ?? [])].filter((e) => e.ago >= 0 && e.ago <= tl.hours).sort((a, b) => a.ago - b.ago)) {
    const near = grouped.find((g) => Math.abs(g.ago - e.ago) * 60 < seam);
    if (near) { near.text = `${near.text}, ${e.text}`; near.tone = near.tone === 'critical' ? near.tone : e.tone ?? near.tone; }
    else grouped.push({ ...e });
  }
  const events = grouped.map((e) =>
    `<div class="orbit-13 time-events" style="--o-from:${(at(e.ago) / S * 360).toFixed(1)}deg"><div class="satellite"><div class="capsule time-event${e.tone ? ` ${e.tone}` : ''}">${esc(e.text)}</div></div></div>`).join('');
  // The center fills what the rings leave (a unit of size is one orbit step).
  const inner = (2 * (11.5 - tracks.length) - 0.8).toFixed(1);
  return `<div class="bigbang timeline${tl.marks ? ' has-marks' : ''}" role="group" aria-label="${esc(tl.aria)}"><div class="gravity-spot">
    ${rings}${events}${tl.marks ? hourMarks() : ''}
    <div class="orbit-0" style="--o-size-ratio:${inner}"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(tl.big)}</span><span class="time-label">${esc(tl.label)}</span></div></div></div>
  </div></div>`;
}

// ─── Month ring: a calendar ─────────────────────────────────────────

export type MonthRing = {
  days: number;                      // days in the month
  today: number;                     // today's day number (1-based); 0 when the month is not this one
  values: (number | null)[];         // one per day, the first day first; null where nothing is known (the days to come)
  unit?: string;
  big: string; label: string;        // the center: today's value and what it is
  title: string;                     // the month and year
  aria: string;
};

// A month as a ring: the days around (satellites, the first at the top,
// today marked, the days to come faint) and each day's value as a sector
// growing out from a baseline inside them, the way the day ring draws its
// hours. The center says today and the month.
export function monthRing(m: MonthRing) {
  const nums = m.values.filter((v): v is number => v != null);
  const hi = Math.max(0, ...nums);
  const REACH = 3.5;                 // lanes from the baseline (orbit 7) outward
  const bars = m.values.map((v, i) => v == null ? '' : `<o-arc class="month-bar outer-orbit${i + 1 === m.today ? ' is-today' : ''}" start="${i}" value="1" interactive
      style="--o-size-ratio:${Math.max(0.2, REACH * (hi ? v / hi : 0)).toFixed(3)}" title="${esc(`${i + 1} ${m.title}: ${num(v)}${m.unit ?? ''}`)}"></o-arc>`).join('');
  const days = Array.from({ length: m.days }, (_, i) => `<div class="orbit-12 day-orbit" style="--o-range:0deg; --o-from:${((i + 0.5) * 360 / m.days).toFixed(2)}deg">
      <div class="satellite day${i + 1 === m.today ? ' is-today' : ''}${m.today && i + 1 > m.today ? ' is-ahead' : ''}" style="--o-size-ratio:1.5"><div class="capsule">${i + 1}</div></div></div>`).join('');
  return `<div class="bigbang month-ring" role="img" aria-label="${esc(m.aria)}"><div class="gravity-spot">
    ${days}<div class="orbit-7 month-bars" style="--o-max:${m.days}; --o-gap:1; --o-stroke-width:0">${bars}</div>
    <div class="orbit-0" style="--o-size-ratio:9"><div class="satellite at-center"><div class="capsule time-center">
      <span class="time-big">${esc(m.big)}</span><span class="time-label">${esc(m.label)}</span><span class="time-range">${esc(m.title)}</span></div></div></div>
  </div></div>`;
}

// ─── Clock rim ──────────────────────────────────────────────────────

export type ClockMark = { at: Date; level?: number; text: string };
// A clock's rim inside a ring: twelve hour ticks, the latest changes as dots
// at their minute (in their level's color, the text as a title) and now as a
// brighter dot. For the center of the orbit view; the time itself is text.
export function clockRim(marks: ClockMark[], now = new Date()) {
  const angle = (d: Date) => (d.getHours() % 12) * 30 + d.getMinutes() * 0.5;
  const ticks = Array.from({ length: 12 }, () => `<div class="vector clock-tick" style="--o-size-ratio:.6"></div>`).join('');
  const dots = marks.map((mk) => `<div class="orbit-11 clock-mark-orbit" style="--o-range:0deg; --o-from:${angle(mk.at).toFixed(1)}deg">
      <div class="satellite clock-mark${mk.level ? ` level-${mk.level}` : ''}" style="--o-size-ratio:.55" title="${esc(`${time(mk.at).slice(0, 5)} ${mk.text}`)}"></div></div>`).join('');
  return `<div class="orbit-11 clock-ticks">${ticks}</div>${dots}
    <div class="orbit-11 clock-now-orbit" style="--o-range:0deg; --o-from:${angle(now).toFixed(1)}deg"><div class="satellite clock-now" style="--o-size-ratio:.9" title="${esc(time(now).slice(0, 5))}"></div></div>`;
}
