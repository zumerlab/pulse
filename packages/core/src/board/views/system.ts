// A system: the radial object in layers. Its channels front to back, the one
// in front with its control on the ring and its face; the strip under it
// says why something calls and what to do. A code, when an action asks for
// one, is entered on a keypad over the object.

import type { ViewContext } from 'zumly';
import {
  DOT_LANES, LANE, LOCK_MS, PHONE, backLayer, calmStrip, dialControls, dots, esc, face, fitFor, keypad, labelAt, layerIndex,
  parallax, setViewToggle, sizes, strokeAt, systemShell, viewToggle,
} from '../../radial/index.ts';
import type { Board, Item } from '../context.ts';
import { dialBinding } from '../dials.ts';
import { activeElement, detailAdds, imageOf, ring, setHTML, startVisuals, visualFor } from '../draw.ts';
import { stackShown } from '../settings.ts';
import { askCode, failuresOf, isPending, live, order, repaint, retry, retryCard, sendCode, uiOf, whenCurrent, worst } from '../state.ts';

export function systemView(b: Board, ctx: ViewContext, id: string) {
  const { t } = b;
  const sys = b.sys[id];
  const el = ctx.target;
  el.dataset.title = sys.title;
  let flat = true, locked = false, dragging = false, alertWas = false;
  const visuals = new Map<HTMLCanvasElement, () => void>();
  ctx.onCleanup(() => { for (const stop of visuals.values()) stop(); });

  el.innerHTML = systemShell(sys.title, viewToggle());
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  // The object fills the stage: what fits depends on the state (calm shows the
  // layers behind, an alert zooms the front), so it is set again on each paint.
  let box = { width: 0, height: 0 };
  const refit = (alert: boolean) => { if (box.width) stage.style.setProperty('--fit', fitFor(box.width, box.height, alert, stackShown(b)).toFixed(3)); };
  const fit = new ResizeObserver(([entry]) => { box = entry.contentRect; refit(stage.dataset.zoom === 'alert'); });
  fit.observe(stage);
  ctx.onCleanup(() => fit.disconnect());
  const dotsEl = el.querySelector<HTMLElement>('.dots');

  const layers = new Map<string, HTMLElement>();
  const layerOf = (key: string) => {
    let layer = layers.get(key);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'gravity-spot layer';
      layer.dataset.ch = key;
      depth.append(layer);
      layers.set(key, layer);
    }
    return layer;
  };

  let last = '';
  const paint = () => {
    if (dragging) return;              // repainting would cut the dial drag
    const ord = order(b, id), u = uiOf(b, id), map = b.readings[id] ?? new Map<string, Item>();
    // The keypad only lives on the front layer: if its channel went behind (an alert came first), it closes.
    if (u.code && ord[0] !== u.code.key) u.code = null;
    // Repaint only if something of this system changed.
    const SZ = sizes(stackShown(b));
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(b, map.get(k)!.r)]), [...u.seen], [...b.failed.keys()], flat, b.toast, SZ.length,
      PHONE ? b.ids.map((o) => [order(b, o)[0], worst(b, o)]) : 0, u.code && [u.code.key, u.code.value.length, u.code.wrong, u.code.format]]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement(b);
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    // A new alert opens the 3D view; after that the toggle decides.
    const alert = live(b, id).length > 0;
    if (alert && !alertWas) flat = false;
    alertWas = alert;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    refit(alert);
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    setViewToggle(el.querySelector<HTMLElement>('[data-act="view"]')!, flat);

    for (const [key, layer] of layers) if (!map.has(key)) { layer.remove(); layers.delete(key); }
    const waiting = live(b, id).filter((k) => k !== ord[0]);
    ord.forEach((key, i) => {
      const layer = layerOf(key), { ch, r } = map.get(key)!;
      const seen = u.seen.has(key);
      const d = Math.min(i, SZ.length - 1);
      layer.hidden = i >= SZ.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', !!r.alert);
      layer.classList.toggle('is-seen', seen);
      layer.dataset.level = String(r.alert?.level ?? 0);
      const grow = SZ[d];
      layer.style.setProperty('--halo', (d * 0.8 / (grow * (1 + d * 110 / 900))).toFixed(2));
      const shown = r.alert && !seen ? r.alert : r;
      // The alerts that wait are their layers behind, in their color and named; the strip counts them.
      layer.innerHTML = ring(b, key, r, strokeAt(d) / grow / LANE, i === 0, false, i === 0 && !!r.alert && !seen, ch.name) + (i === 0
        ? face({ glyph: ch.glyph, name: ch.name, big: shown.big, label: shown.label, to: detailAdds(r) ? 'detail' : undefined,
          props: { system: id, channel: key }, aria: t.details(ch.name), image: imageOf(b, r), plots: r.plots,
          extra: (isPending(b, r) ? `<span class="face-wait">${t.sending}</span>` : '') + visualFor(id, key) })
        : backLayer({ text: `${ch.name} · ${shown.big}`, at: labelAt(i), grow, stroke: strokeAt(d), hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    startVisuals(b, el, visuals);
    // The keypad over the object while a code is being entered; the object waits behind.
    const front = map.get(ord[0]);
    setHTML(stage.querySelector<HTMLElement>('.keypad-slot')!, u.code && front
      ? keypad({ name: front.ch.name, title: u.code.title, verb: u.code.verb, format: u.code.format, value: u.code.value, wrong: u.code.wrong, glyph: front.ch.glyph, level: u.code.level })
      : '');
    obj.classList.toggle('is-waiting', !!u.code);
    // Beside the object, the channels front to back, each a button; past the stack, hollow.
    setHTML(stage.querySelector<HTMLElement>('.layer-index-slot')!, layerIndex(ord.map((key, i) => {
      const { ch, r } = map.get(key)!, shown = r.alert && !u.seen.has(key) ? r.alert : r;
      return { id: key, title: ch.name, big: shown.big, level: r.alert && !u.seen.has(key) ? r.alert.level : 0, off: i >= SZ.length };
    }), 'data-pick'));

    if (!front) { strip.textContent = t.noEntities; return; }
    const hidden = ord.slice(SZ.length).map((k) => ({ key: k, name: map.get(k)!.ch.name }));
    const fa = front.r.alert && !u.seen.has(ord[0]) ? front.r.alert : null;
    if (dotsEl) {
      dotsEl.innerHTML = dots(b.ids.filter((other) => order(b, other).length).map((other) => {
        const k = order(b, other)[0];
        return { id: other, title: b.sys[other].title, level: worst(b, other), ring: ring(b, k, b.readings[other].get(k)!.r, DOT_LANES) };
      }), id);
    }
    strip.innerHTML = b.toast ? `<span class="error">${esc(b.toast)}</span>`
      : u.code ? `<span>${esc(t.codeLine(front.ch.name, u.code.title))}</span> <button class="plain" data-code="cancel">${t.cancel}</button>`
      : failuresOf(b, front.r).length ? retryCard(b, front.r)
      : fa ? `<strong>${front.ch.name}:</strong> ${esc(fa.why)}.
          ${fa.busy ? `<span class="face-wait">${t.inProgress}</span>` : `<button class="primary level-${fa.level}" data-resolve="${ord[0]}">${esc(fa.verb)}</button>
          ${fa.acts.length ? `<button class="plain" data-seen="${ord[0]}">${t.mute}</button>` : ''}`}
          ${waiting.length ? `<span class="how">${t.moreWaiting(waiting.length)}</span>` : ''}`
      : calmStrip(sys.title, front.ch.name, hidden);

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };

  // The selector that finds a control again after a repaint.
  const focusKey = (target: HTMLElement) => {
    const layer = target.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-act', 'data-key', 'data-code']) {
      const v = target.getAttribute(a);
      if (v === null) continue;
      const handle = target.getAttribute('data-handle');
      return `${(a === 'data-seg' || a === 'data-key') && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]${handle ? `[data-handle="${handle}"]` : ''}`;
    }
    return null;
  };

  // ─── Direct controls ───
  const d = dialBinding(b, id, (key) => layers.get(key) ?? null, (key, v) => {
    const label = layers.get(key)?.querySelector('.face-label');
    if (label) label.textContent = v.sentence;
  });
  ctx.onCleanup(dialControls(el, {
    locked: () => locked,
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12') ?? null,
    current: d.fraction,
    stepOf: d.stepOf,
    set: (key, v, handle) => d.setDial(key, d.snap(key, v), Infinity, handle),
    nearest: d.nearest,
    onStart: () => { dragging = true; },
    onEnd: (key) => { dragging = false; d.commit(key); },
    onInput: d.commitSoon,
    activate: 'o-arc[data-pick], o-arc[data-seg]',
  }));

  // A live picture in the face: its snapshot is asked again every 8 s.
  const refresh = window.setInterval(() => {
    const img = el.querySelector<HTMLImageElement>('.layer-front .face-image[data-image]');
    const r = img && b.readings[id].get(order(b, id)[0])?.r;
    const next = r && imageOf(b, r);
    if (img && next && img.src !== next.src) img.src = next.src;
  }, 8000);
  ctx.onCleanup(() => clearInterval(refresh));

  const lock = () => {
    locked = true;
    stage.classList.add('is-locked');
    setTimeout(() => { locked = false; stage.classList.remove('is-locked'); }, LOCK_MS);
  };

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick;
    const resolve = target.closest<HTMLElement>('[data-resolve]')?.dataset.resolve;
    const seenKey = target.closest<HTMLElement>('[data-seen]')?.dataset.seen;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = target.closest<HTMLElement>('[data-go]')?.dataset.go;
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(b, again); return; }
    if (go) { goSystem(go); return; }
    // The keypad: a digit, delete, cancel or send.
    const digit = target.closest<HTMLElement>('[data-key]')?.dataset.key;
    const code = target.closest<HTMLElement>('[data-code]')?.dataset.code;
    if (digit !== undefined) { typeCode(digit); return; }
    if (code === 'delete') { typeCode(null); return; }
    if (code === 'cancel') { uiOf(b, id).code = null; repaint(b); return; }
    if (code === 'enter') { void sendCode(b, id); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const { r } = b.readings[id].get(key)!, s = r.segs![Number(seg.dataset.seg)];
      if (s.act && !b.pending.has(s.id)) askCode(b, id, key, [s.act], s.label, s.label, r.alert?.level);
      return;
    }
    if (pick && !locked) { uiOf(b, id).pick = pick; lock(); }
    else if (resolve) {
      const a = b.readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.acts.length) askCode(b, id, resolve, a.acts, a.verb, a.verb, a.level);
      else uiOf(b, id).seen.add(resolve);
      lock();
    } else if (seenKey) { uiOf(b, id).seen.add(seenKey); lock(); }
    else if (act === 'view') flat = !flat;
    else return;
    repaint(b);
  });

  // ─── The keypad ───
  // A digit (or a deletion) into the code being entered; the input of a text code keeps its own.
  const typeCode = (digit: string | null) => {
    const c = uiOf(b, id).code;
    if (!c) return;
    c.wrong = false;
    c.value = digit === null ? c.value.slice(0, -1) : c.value + digit;
    repaint(b);
  };
  // With the keypad open the keyboard types the code wherever the focus is
  // (a tap on the ring leaves none): digits, Backspace, Enter sends, Escape cancels.
  const onKey = (e: KeyboardEvent) => {
    const u = uiOf(b, id);
    if (!u.code || !el.closest('.is-current-view')) return;
    const target = e.target as HTMLElement;
    const inInput = target.matches('.code-input');
    if (!inInput && (target.matches('input, textarea, select') || target.closest('.settings'))) return;
    if (e.key === 'Escape') { u.code = null; repaint(b); }
    else if (e.key === 'Enter' && (inInput || !target.matches('button, o-arc'))) void sendCode(b, id);
    else if (inInput) return;
    else if (/^[0-9]$/.test(e.key)) typeCode(e.key);
    else if (e.key === 'Backspace') typeCode(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener('keydown', onKey, true);
  ctx.onCleanup(() => document.removeEventListener('keydown', onKey, true));
  // Typing in the input of a text code: no repaint (it would lose the caret), the buttons follow by hand.
  el.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement, c = uiOf(b, id).code;
    if (!c || !target.matches('.code-input')) return;
    c.value = target.value; c.wrong = false;
    el.querySelector('.keypad')?.classList.remove('is-wrong');
    el.querySelectorAll<HTMLButtonElement>('[data-code="delete"], [data-code="enter"]').forEach((x) => { x.disabled = !c.value; });
  });

  // ─── Phone: from one system to the next ───
  const goSystem = (other: string) => {
    if (other !== id) void b.app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // The browser leaves the horizontal gesture to the page (otherwise it cancels
  // it as a scroll) so Zumly's lateral swipe sees it.
  if (PHONE) el.style.touchAction = 'pan-y';
  parallax(stage, () => obj, () => !flat);

  paint();
  whenCurrent(b, ctx, paint);
}
