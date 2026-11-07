// What the board knows of time, asked of the host once in a while: the
// changes of the last day (the orbit's time, the changes view) and a meter's
// month (the detail's calendar).

import { time } from '../i18n.ts';
import type { TimeMark } from '../radial/index.ts';
import type { Board } from './context.ts';
import { look } from './settings.ts';
import { live, uiOf, watched } from './state.ts';

// ─── A meter's month ───

export const MONTH_MS = 15 * 60_000;      // kept this long
export const ROLLING_DAYS = 30;
export const monthKey = (b: Board, id: string) => look(b).month === 'rolling' ? `${id}|${ROLLING_DAYS}` : id;
// This month of an energy meter by day, or the last 30 days: asked once per meter and kept a while.
export async function loadMonth(b: Board, id: string) {
  const key = monthKey(b, id), days = look(b).month === 'rolling' ? ROLLING_DAYS : undefined;
  if (b.monthLoading.has(key) || !b.host.statistics) return;
  b.monthLoading.add(key);
  try { b.months.set(key, { values: await b.host.statistics(id, days), at: Date.now() }); }
  catch { b.months.set(key, { values: [], at: Date.now(), error: true }); }
  b.monthLoading.delete(key);
  b.repaint();
}

// ─── The changes of the last day ───

export const PAST_MS = 5 * 60_000;        // asked again after this long
// The changes of the things shown, from the host's history, merged with what this session saw.
export async function loadPast(b: Board) {
  if (b.pastLoading || !b.host.changes) return;
  b.pastLoading = true;
  try { b.pastChanges = { at: Date.now(), changes: await b.host.changes([...watched(b)], 24) }; }
  catch { b.pastChanges = { at: Date.now() - PAST_MS + 30_000, changes: {} }; }   // try again in half a minute
  b.pastLoading = false;
  b.repaint();
}

// The system and the glyph of a thing: the first channel that reads it.
function whose(b: Board, thing: string) {
  for (const id of b.ids) for (const { ch, r } of b.readings[id].values()) if (r.ids.includes(thing)) return { id, glyph: ch.glyph };
  return null;
}

// The changes as marks of the time window: a state that is a word (on, open,
// playing; a number that moves every minute would bury the rest), the alerts
// this session raised, the newest first. `ago` in hours.
export type Mark = TimeMark & { id: string };
export function timeMarks(b: Board, hours: number, cap = 12): Mark[] {
  // Counted from the current minute: the marks move once a minute, not under a finger.
  const now = Math.floor(Date.now() / 60_000) * 60_000, out: (Mark & { at: number })[] = [];
  const past = b.pastChanges;
  for (const [thing, list] of Object.entries(past?.changes ?? {})) {
    const who = whose(b, thing);
    if (!who) continue;
    for (const c of list) {
      // `ago` was counted when the history came; from it, the moment, and from that, how long ago now.
      const at = Math.floor((past!.at - c.ago * 3_600_000) / 60_000) * 60_000, ago = (now - at) / 3_600_000;
      if (ago >= hours || !Number.isNaN(Number(c.state)) || c.state === 'unavailable' || c.state === 'unknown') continue;
      out.push({ at, ago, glyph: who.glyph, id: who.id, name: b.sys[who.id].title, when: time(new Date(at)).slice(0, 5), text: `${b.host.nameOf(thing)} → ${c.state}` });
    }
  }
  // The alerts that call now, at the moment they appeared, in their system's glyph.
  for (const id of b.ids) for (const k of live(b, id)) {
    const since = uiOf(b, id).since.get(k), item = b.readings[id].get(k)!;
    if (since == null || (now - since) / 3_600_000 >= hours) continue;
    out.push({ at: since, ago: Math.max(0, (now - since) / 3_600_000), level: item.r.alert!.level, glyph: item.ch.glyph, id, name: b.sys[id].title,
      when: time(new Date(since)).slice(0, 5), text: item.r.alert!.why });
  }
  // What this session saw before the history came (or with a host that keeps none).
  if (!past?.changes || !Object.keys(past.changes).length) for (const l of b.log) {
    const ago = Math.max(0, (now - l.at.getTime()) / 3_600_000), who = l.id ? whose(b, l.id) : null;
    if (!who || l.level || ago >= hours) continue;
    out.push({ at: l.at.getTime(), ago, glyph: who.glyph, id: who.id, name: b.sys[who.id].title, when: time(l.at).slice(0, 5), text: l.text });
  }
  return out.sort((x, y) => x.ago - y.ago).slice(0, cap);
}

// How many of those changes fell in each of the last 24 hours, the oldest hour first.
export function hourCounts(b: Board) {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const list of Object.values(b.pastChanges?.changes ?? {})) for (const c of list) if (c.ago < 24 && Number.isNaN(Number(c.state))) counts[23 - Math.floor(c.ago)]++;
  for (const l of b.log) { const ago = (Date.now() - l.at.getTime()) / 3_600_000; if (ago < 24 && !b.pastChanges) counts[23 - Math.floor(ago)]++; }
  return counts;
}
