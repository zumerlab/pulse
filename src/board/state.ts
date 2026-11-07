// Readings and actions: what each channel reads now, which one is in front,
// what calls, and the actions handed back to the host. What is shown is what
// the host confirmed: until it does, a thing stays "sending".

import type { ViewContext } from 'zumly';
import type { Action, Alert, Reading } from '../model.ts';
import { esc } from '../radial/index.ts';
import type { Board, Item, Ui } from './context.ts';
import { activeGroups, hiddenChannels, isCrowd } from './settings.ts';

// How long an action waits for the host to report a change before it stops beating.
export const PENDING_MS = 8000;

export const uiOf = (b: Board, id: string): Ui => {
  let u = b.ui[id];
  if (!u) { u = { pick: null, code: null, since: new Map(), sig: new Map(), seen: new Set() }; b.ui[id] = u; }
  return u;
};

// What makes an alert the same alert: its key when the host gives one (a value
// that drifts is still the same alert), otherwise its words.
const sig = (a: Alert) => `${a.level}|${a.key ?? `${a.big}|${a.why}`}`;

// Reads every channel of the systems shown, applies what the viewer is
// moving, and keeps when each alert appeared. Returns the alerts that are new.
export function compute(b: Board) {
  const now = Date.now(), fresh: { id: string; key: string; a: Alert }[] = [];
  b.readings = {};
  b.channels = {};
  const ctx = { groups: activeGroups(b) ?? null, picks: b.local.picks ?? {} };
  // On the groups axis the systems chosen are read too, only to list their channels in the gear.
  const listed = b.axis === 'groups' ? b.chosen.filter((id) => !b.ids.includes(id)) : [];
  const objects = b.objects.filter((id) => !b.ids.includes(id) && !listed.includes(id));
  for (const sys of [...b.ids, ...listed, ...objects].map((id) => b.sys[id])) {
    const map = new Map<string, Item>(), u = uiOf(b, sys.id), hidden = hiddenChannels(b, sys.id);
    b.channels[sys.id] = [];
    for (const ch of sys.channels) {
      const r = ch.read(ctx);
      if (!r) continue;
      // A channel that follows a thing takes its name (the reading's `name`);
      // the gear lists every channel that has something, hidden or not.
      const named = r.name && r.name !== ch.name ? { ...ch, name: r.name } : ch;
      b.channels[sys.id].push({ ch: named, r, hidden: hidden.includes(ch.key) });
      if (hidden.includes(ch.key) || listed.includes(sys.id)) continue;
      if (r.dial && r.range) {
        // Each end of a range is held on its own (id#lo, id#hi).
        const lo = b.hold.get(`${r.dial.id}#lo`), hi = b.hold.get(`${r.dial.id}#hi`);
        if (lo && lo.until > now) r.range.lo = lo.value;
        if (hi && hi.until > now) r.range.hi = hi.value;
        r.dial.value = r.range.lo;
      } else if (r.dial) {
        const h = b.hold.get(r.dial.id);
        if (h && h.until > now) { r.dial.value = h.value; r.v = (h.value - r.dial.min) / (r.dial.max - r.dial.min); }
      }
      if (r.color) {
        const h = b.hold.get(`${r.color.id}#hs`);
        if (h && h.until > now) r.color.hs = [Math.floor(h.value / 1000), h.value % 1000];
      }
      map.set(ch.key, { ch: named, r });
      if (r.alert) {
        if (u.sig.get(ch.key) !== sig(r.alert)) {
          u.seen.delete(ch.key);
          u.sig.set(ch.key, sig(r.alert));
          if (!u.since.has(ch.key)) { u.since.set(ch.key, now); fresh.push({ id: sys.id, key: ch.key, a: r.alert }); }
        }
      } else { u.since.delete(ch.key); u.sig.delete(ch.key); u.seen.delete(ch.key); }
    }
    b.readings[sys.id] = map;
    // A new alert cancels the choice made by hand.
    if (fresh.some((f) => f.id === sys.id)) u.pick = null;
  }
  return fresh;
}

export function repaint(b: Board) {
  compute(b);
  b.rerender.forEach((fn) => fn());
}

// A view behind the current one (Zumly keeps it, scaled and blurred) does not
// repaint: Chrome would blur it again on each change. It repaints when it
// comes back to the front.
export function whenCurrent(b: Board, ctx: ViewContext, paint: () => void) {
  let dirty = false;
  const el = ctx.target;
  const run = () => {
    if (el.isConnected && !el.closest('.is-current-view, .is-new-current-view')) { dirty = true; return; }
    dirty = false;
    paint();
  };
  ctx.onActivate(() => { if (dirty) run(); });
  b.rerender.add(run);
  ctx.onCleanup(() => { b.rerender.delete(run); });
  return run;
}

// A system's channels front to back.
export function order(b: Board, id: string): string[] {
  const map = b.readings[id] ?? new Map<string, Item>(), u = uiOf(b, id);
  const keys = [...map.keys()];
  const alerts = keys.filter((k) => map.get(k)!.r.alert);
  // Rule 1: the one in front stays; only a more serious one displaces it. Seen ones go behind.
  alerts.sort((x, y) => Number(u.seen.has(x)) - Number(u.seen.has(y))
    || map.get(y)!.r.alert!.level - map.get(x)!.r.alert!.level
    || u.since.get(x)! - u.since.get(y)!);
  const rest = keys.filter((k) => !alerts.includes(k));
  // A group of members (a line, a phase of flight) is told, while calm, by the reading that speaks for most of them.
  if (isCrowd(id)) rest.sort((x, y) => map.get(y)!.r.ids.length - map.get(x)!.r.ids.length);
  const all = [...alerts.filter((k) => !u.seen.has(k)), ...rest, ...alerts.filter((k) => u.seen.has(k))];
  if (u.pick && all.includes(u.pick)) all.sort((x, y) => Number(y === u.pick) - Number(x === u.pick));
  return all;
}

// The channels of a system that call (not seen), and the most serious level among them.
export const live = (b: Board, id: string) => order(b, id).filter((k) => b.readings[id].get(k)!.r.alert && !uiOf(b, id).seen.has(k));
export const worst = (b: Board, id: string) => Math.max(0, ...live(b, id).map((k) => b.readings[id].get(k)!.r.alert!.level));

// Things some channel shows: only those enter the change log.
export const watched = (b: Board) => new Set(b.ids.flatMap((id) => [...b.readings[id].values()].flatMap((x) => x.r.ids)));

// A segment or a row that names a thing with an object of its own (Seg.to):
// the host makes its system, the board reads it with the rest (the last few
// opened) and zooms into it from where it was tapped. False when the host has
// no object for it.
export function openObject(b: Board, to: string, from: HTMLElement) {
  // The host's object of the thing; on the groups axis a member it already named (a tram of a line) is one too.
  const sys = b.host.objectOf?.(to) ?? (b.axis === 'groups' && b.sys[to] && !b.ids.includes(to) && !b.all.includes(to) ? b.sys[to] : null);
  if (!sys) return false;
  b.sys[sys.id] = sys;
  b.views[`sys-${sys.id}`] ??= b.systemView(sys.id);
  b.objects = [sys.id, ...b.objects.filter((x) => x !== sys.id)].slice(0, 8);
  compute(b);
  from.dataset.to = `sys-${sys.id}`;
  void b.app.zoomIn(from);
  return true;
}
// A view whose content has gone closes: a step back, once the view is current
// and Zumly is free. Zumly drops a navigation asked for while another runs
// (`blockEvents` while it animates) instead of queueing it, so the step
// back waits for that too (noted in ../coordinacion/PENDIENTES.md, Zumly).
export function zoomOutWhenCurrent(b: Board, el: HTMLElement) {
  const app = b.app as typeof b.app & { blockEvents?: boolean };
  const go = () => {
    if (!el.isConnected) return;
    if (el.closest('.is-current-view') && !app.blockEvents) void b.app.zoomOut();
    else requestAnimationFrame(go);
  };
  go();
}

// ─── Actions to the host ───

export const isPending = (b: Board, r: Reading) => r.ids.some((e) => b.pending.has(e));
export const failuresOf = (b: Board, r: Reading) => r.ids.filter((e) => b.failed.has(e)).map((e) => ({ id: e, ...b.failed.get(e)! }));

// The card under the object when something did not go through: what, and a Retry.
export const retryCard = (b: Board, r: Reading) => {
  const f = failuresOf(b, r);
  if (!f.length) return '';
  const names = f.map((x) => b.host.nameOf(x.id));
  return `<span class="errc"><span>${esc(b.t.didNotRespond(names))}</span>
    <button class="plain" data-retry="${esc(f.map((x) => x.id).join(' '))}">${b.t.retry}</button></span>`;
};
export const retry = (b: Board, ids: string) => {
  const acts = ids.split(' ').flatMap((e) => b.failed.get(e)?.acts ?? []);
  if (acts.length) void send(b, acts);
};

// Hands the actions to the host, one by one. Returns whether all went through.
export async function send(b: Board, acts: Action[]) {
  let ok = true;
  for (const a of acts) {
    a.ids.forEach((e) => b.pending.set(e, Date.now()));
    try {
      await b.host.act(a);
      a.ids.forEach((e) => b.failed.delete(e));
    } catch (error) {
      ok = false;
      const message = error instanceof Error ? error.message : String(error);
      a.ids.forEach((e) => { b.pending.delete(e); b.hold.delete(e); b.failed.set(e, { acts: [a], message }); });
      b.toast = b.t.hostError(message);
      setTimeout(() => { b.toast = ''; repaint(b); }, 5000);
    }
  }
  repaint(b);
  // If the host changes nothing (say, an action with no effect), stop waiting.
  setTimeout(() => {
    let changed = false;
    for (const [e, at] of b.pending) if (Date.now() - at >= PENDING_MS) { b.pending.delete(e); changed = true; }
    if (changed) repaint(b);
  }, PENDING_MS + 50);
  return ok;
}

// Actions that ask for a code wait on the keypad; the rest go now. On the
// keypad, the code is added to the ones that asked and all of them go
// together; a refusal keeps the keypad open, wrong, and empty.
export function askCode(b: Board, id: string, key: string, acts: Action[], title: string, verb: string, level?: 1 | 2) {
  const asks = acts.find((a) => a.asks);
  if (!asks) { void send(b, acts); return; }
  const u = uiOf(b, id);
  u.code = { key, acts, title, verb, format: asks.asks!, value: '', wrong: false, level, hint: asks.hint };
  u.pick = key;
  repaint(b);
}
export async function sendCode(b: Board, id: string) {
  const u = uiOf(b, id), c = u.code;
  if (!c || !c.value) return;
  const ok = await send(b, c.acts.map((a) => a.asks ? { ...a, code: c.value } : a));
  if (u.code !== c) return;
  if (ok) u.code = null;
  else { c.value = ''; c.wrong = true; }
  repaint(b);
}
