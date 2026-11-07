// A day of a thing, from whatever a host keeps: rows of (state, when), as the
// hourly means the day ring draws, the moments it changed, and the spans it
// was on, for the timeline.

import type { StateChange } from './model.ts';

// A state and when it took effect (seconds since the epoch).
export type HistoryRow = { s: string; lu: number };

// Hourly means of a state history. A state holds until the next one, so an
// hour with no change takes the state that was current when it began.
export function hourly(rows: HistoryRow[], hours: number, now = Date.now()): (number | null)[] {
  const end = now / 1000, start = end - hours * 3600;
  const out: (number | null)[] = [];
  let i = 0, last: number | null = null;
  // The state in force at `start`: the last row before it.
  while (i < rows.length && rows[i].lu <= start) { const v = Number(rows[i].s); last = Number.isFinite(v) ? v : last; i++; }
  for (let h = 0; h < hours; h++) {
    const t0 = start + h * 3600, t1 = t0 + 3600;
    let sum = 0, weight = 0, at = t0, current = last;
    while (i < rows.length && rows[i].lu < t1) {
      const v = Number(rows[i].s);
      if (current != null) { sum += current * (rows[i].lu - at); weight += rows[i].lu - at; }
      at = rows[i].lu;
      current = Number.isFinite(v) ? v : current;
      i++;
    }
    if (current != null) { sum += current * (t1 - at); weight += t1 - at; }
    out.push(weight > 0 ? sum / weight : null);
    last = current;
  }
  return out;
}

// A state history as the moments it changed: the state in force when the
// window began (ago = hours), then each change, oldest first, `ago` in hours.
export function changesOf(rows: HistoryRow[], hours: number, now = Date.now()): StateChange[] {
  const end = now / 1000, start = end - hours * 3600;
  const out: StateChange[] = [];
  for (const r of rows) {
    if (r.lu <= start) { out.length = 0; out.push({ state: r.s, ago: hours }); }
    else out.push({ state: r.s, ago: (end - r.lu) / 3600 });
  }
  return out;
}

// A day of changes as the spans a thing was on, [from, to] in hours ago,
// oldest first; the last one reaches 0 while it still is.
export function spansOf(changes: StateChange[], on: (state: string) => boolean): [number, number][] {
  const spans: [number, number][] = [];
  let from: number | null = null;
  for (const c of changes) {
    if (on(c.state)) { if (from == null) from = c.ago; }
    else if (from != null) { spans.push([from, c.ago]); from = null; }
  }
  if (from != null) spans.push([from, 0]);
  return spans;
}
