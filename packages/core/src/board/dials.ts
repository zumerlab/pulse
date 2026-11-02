// A dial's state, shared by the system view and the detail: the value moves
// in place while it is dragged, and the action goes out on release (or after
// a keyboard pause). Until the host confirms it, the value shown is the one
// asked for.

import { num } from '../i18n.ts';
import type { Board } from './context.ts';
import { frac } from './draw.ts';
import { PENDING_MS, send } from './state.ts';

export type ValueText = { big: string; label: string; sentence: string };

// `root` finds the markup that holds a channel's dial; `onValue` writes what it says now.
export function dialBinding(b: Board, id: string, root: (key: string) => HTMLElement | null, onValue: (key: string, text: ValueText) => void) {
  const { hold, t } = b;
  const dialOf = (key: string) => b.readings[id].get(key)!.r.dial!;
  // Undefined for a key that is not a channel's (the color sliders "key:hue"
  // and "key:sat" share the dial's gestures): nearest() is asked on every
  // pointerdown, and a throw there would lose the drag.
  const rangeOf = (key: string) => b.readings[id].get(key)?.r.range;
  const snap = (key: string, v: number) => {
    const dial = dialOf(key);
    const raw = dial.min + Math.min(1, Math.max(0, v)) * (dial.max - dial.min);
    return Math.round(raw / dial.step) * dial.step;
  };
  // Where each end of a range is now (held or read), in the dial's units.
  const endOf = (key: string, handle: string) => {
    const dial = dialOf(key), range = rangeOf(key)!;
    return hold.get(`${dial.id}#${handle}`)?.value ?? (handle === 'lo' ? range.lo : range.hi);
  };
  const setDial = (key: string, value: number, until = Infinity, handle?: string) => {
    const dial = dialOf(key);
    value = Math.min(dial.max, Math.max(dial.min, value));
    const el = root(key);
    if (handle) {
      // One end never crosses the other.
      const other = endOf(key, handle === 'lo' ? 'hi' : 'lo');
      value = handle === 'lo' ? Math.min(value, other) : Math.max(value, other);
      hold.set(`${dial.id}#${handle}`, { value, until });
      const lo = endOf(key, 'lo'), hi = endOf(key, 'hi'), fl = frac(dial, lo), fh = frac(dial, hi);
      const band = el?.querySelector<HTMLElement>('.range-band o-arc');
      band?.setAttribute('start', (fl * 100).toFixed(1));
      band?.setAttribute('value', ((fh - fl) * 100).toFixed(1));
      for (const [h, v, f] of [['lo', lo, fl], ['hi', hi, fh]] as const) {
        const knob = el?.querySelector<HTMLElement>(`.knob[data-handle="${h}"]`);
        knob?.parentElement?.style.setProperty('--o-from', `${(f * 360).toFixed(2)}deg`);
        knob?.setAttribute('aria-valuenow', String(v));
        knob?.setAttribute('aria-valuetext', `${num(v)}${dial.unit}`);
      }
      onValue(key, { big: `${num(lo)}–${num(hi)}${dial.unit}`, label: dial.label, sentence: t.between(num(lo), num(hi), dial.unit) });
      return value;
    }
    hold.set(dial.id, { value, until });
    const v = (value - dial.min) / (dial.max - dial.min);
    const ringEl = el?.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(value));
    ringEl?.setAttribute('aria-valuetext', `${num(value)}${dial.unit}`);
    onValue(key, { big: `${num(value)}${dial.unit}`, label: dial.label, sentence: `${dial.label} ${num(value)}${dial.unit}` });
    return value;
  };
  const commit = (key: string) => {
    const dial = dialOf(key), range = rangeOf(key);
    if (range) {
      const lo = hold.get(`${dial.id}#lo`), hi = hold.get(`${dial.id}#hi`);
      if (!lo && !hi) return;
      for (const h of [lo, hi]) if (h) h.until = Date.now() + PENDING_MS;
      void send(b, [range.set(lo?.value ?? range.lo, hi?.value ?? range.hi)]);
      return;
    }
    const h = hold.get(dial.id);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    void send(b, [dial.set(h.value)]);
  };
  let keyTimer = 0;
  const commitSoon = (key: string) => {
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => commit(key), 500);
  };
  const fraction = (key: string, handle?: string) => {
    const d = dialOf(key);
    if (handle) return frac(d, endOf(key, handle));
    return ((hold.get(d.id)?.value ?? d.value) - d.min) / (d.max - d.min);
  };
  const stepOf = (key: string) => { const d = dialOf(key); return d.step / (d.max - d.min); };
  // On a range's track, the end nearer to the pointer follows it.
  const nearest = (key: string, v: number) => {
    if (!rangeOf(key)) return undefined;
    const dist = (f: number) => Math.min(Math.abs(f - v), 1 - Math.abs(f - v));
    return dist(fraction(key, 'lo')) <= dist(fraction(key, 'hi')) ? 'lo' : 'hi';
  };
  return { snap, setDial, commit, commitSoon, fraction, stepOf, nearest };
}
