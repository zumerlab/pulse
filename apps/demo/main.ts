import Zumly, { type ViewContext } from 'zumly';
import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import {
  DOT_LANES, LANE, LOCK_MS, MINI_LANES, PHONE, SIZE, STROKE, backLayer, calmStrip, dialControls, dots, face,
  icon, labelAt, listOf, num, parallax, ring, startInside, systemShell, zumlyOptions, type RingReading,
} from '@zumer/pulse';
import { systems, type Channel, type PulseSystem } from './systems.ts';
import { t } from './strings.ts';

// Per-system state lives outside the views: Zumly drops the child view on the
// way back, and the view behind does not re-render on its own.
type SystemState = {
  pick: string | null; alerts: string[];
  values: Record<string, number>;          // dial: 0..1
  lit: Record<string, boolean[]>;          // toggles: one value per segment
};
const state: Record<string, SystemState> = Object.fromEntries(
  Object.keys(systems).map((id) => [id, { pick: null, alerts: [], values: {}, lit: {} }]),
);
const rerender = new Set<() => void>();
const IDS = Object.keys(systems);

function order(id: string): string[] {
  const sys = systems[id], st = state[id];
  const alerts = [...st.alerts].sort((a, b) => sys.ch[b].level - sys.ch[a].level);
  const rest = sys.front.filter((c) => !alerts.includes(c));
  if (!alerts.length && st.pick) rest.sort((a, b) => Number(b === st.pick) - Number(a === st.pick));
  return [...alerts, ...rest];
}

type Dial = NonNullable<Channel['dial']>;
// The dial's value in its own units, rounded to the step.
function dialValue(dial: Dial, v: number) {
  const raw = dial.min + Math.min(1, Math.max(0, v)) * (dial.max - dial.min);
  return Math.round(raw / dial.step) * dial.step;
}

function lightsOf(id: string, key: string, ch: Channel, alert: boolean) {
  const saved = state[id].lit[key];
  if (saved) return saved;
  const count = (alert ? ch.al.on : ch.ok.on) ?? 0;
  return Array.from({ length: ch.segs ?? 4 }, (_, i) => i < count);
}

function names(list: string[]) {
  return list.length ? listOf(list.map((n) => n.toLowerCase())) : t.allOff;
}

// The simulated channel as the reading the shared ring draws, plus what the
// face and the strip show.
type Reading = RingReading & { alert?: { level: 1 | 2; fail?: number[]; why: string; verb: string }; big: string; label: string };
function reading(id: string, key: string, ch: Channel): Reading {
  const alert = state[id].alerts.includes(key);
  const base = alert ? ch.al : ch.ok;
  const v = state[id].values[key] ?? base.v;
  let { big, label } = base;
  let lit: boolean[] | undefined;
  if (ch.dial && !alert && v !== undefined) label = `${ch.dial.label} ${num(dialValue(ch.dial, v))}${ch.dial.unit}`;
  if (ch.toggles) {
    lit = lightsOf(id, key, ch, alert);
    if (!alert) {
      big = t.nOfM(lit.filter(Boolean).length, lit.length);
      label = names(ch.toggles.filter((_, i) => lit![i]));
    }
  }
  const segs = ch.type === 's' ? Array.from({ length: ch.segs ?? 4 }, (_, i) => ({
    label: ch.toggles?.[i] ?? `${ch.name} ${i + 1}`, on: lit ? lit[i] : i < (base.on ?? 0), act: !!ch.toggles,
  })) : undefined;
  const fail = alert && ch.al.seg !== undefined && segs?.[ch.al.seg]?.on ? [ch.al.seg] : undefined;
  return {
    kind: ch.type, v, segs, big, label,
    dial: ch.dial && v !== undefined ? { ...ch.dial, value: dialValue(ch.dial, v) } : undefined,
    alert: alert ? { level: ch.level, fail, why: ch.al.why, verb: ch.al.verb } : undefined,
  };
}

const frontRing = (id: string, key: string, lanes: number, controls = false) => {
  const ch = systems[id].ch[key], r = reading(id, key, ch);
  // Rule 2: on the front ring the wave comes out of the failing segment.
  return ring(key, r, lanes, { name: ch.name, controls, call: controls && !!r.alert });
};

// ─── Board ──────────────────────────────────────────────────────────

function mini(id: string) {
  const sys = systems[id], key = order(id)[0], ch = sys.ch[key];
  const alert = state[id].alerts.length > 0;
  return `<button class="tile zoom-me${alert ? ' has-alert' : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${t.open(sys.title)}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${frontRing(id, key, MINI_LANES)}</span></span>
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
  </button>`;
}

function board(ctx: ViewContext) {
  const el = ctx.target;
  el.dataset.title = t.board;   // shown by Zumly's back button
  const paint = () => {
    el.innerHTML = `<div class="board">
      <header class="board-head"><h1>${t.allCalmUnless}</h1></header>
      <div class="tiles">${IDS.map(mini).join('')}</div>
      <div class="board-actions">
        <button class="plain" data-act="critical">${t.simulateCritical(systems.car.title)}</button>
      </div>
    </div>`;
  };
  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act !== 'critical') return;
    if (!state.car.alerts.includes('tires')) state.car.alerts.push('tires');
    paint();
    // A critical alert opens its own tile, from the tile (not from the center).
    const tile = el.querySelector<HTMLElement>('.tile[data-system="car"]');
    if (tile) void app.zoomIn(tile);
  });
}

// ─── System: the radial object in layers ────────────────────────────

// One view per system (sys-home, sys-car…): Zumly moves sideways only between
// views with different names.
function system(ctx: ViewContext, id: string) {
  const sys: PulseSystem = systems[id];
  const el = ctx.target;
  el.dataset.title = sys.title;
  let flat = true, locked = false;

  // Orbit layers: each channel is a nested .gravity-spot with data-depth;
  // .depth moves it in z and compensates the scale. The universe (.bigbang)
  // measures the front layer; outer-perspective leaves the perspective to the
  // stage so the parallax turns the whole object.
  el.innerHTML = systemShell(null,
    `<button class="plain" data-act="view">${t.view3d}</button>
     <button class="plain" data-act="alert">${t.simulateAlert}</button>`);
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  const dotsEl = el.querySelector<HTMLElement>('.dots');

  // One layer per channel, created once: reordering only changes data-depth,
  // so Orbit's depth transition animates the change.
  const layers = new Map<string, HTMLElement>();
  for (const key of sys.front) {
    const layer = document.createElement('div');
    layer.className = 'gravity-spot layer';
    layer.dataset.ch = key;
    depth.append(layer);
    layers.set(key, layer);
  }

  const paint = () => {
    const ord = order(id), st = state[id];
    const alert = st.alerts.length > 0;
    if (alert) flat = false;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    el.querySelector<HTMLElement>('[data-act="view"]')!.textContent = flat ? t.view3d : t.viewFlat;
    el.querySelector<HTMLElement>('[data-act="alert"]')!.textContent = alert ? t.resolveAlerts : t.simulateAlert;

    ord.forEach((key, i) => {
      const layer = layers.get(key)!, ch = sys.ch[key], r = reading(id, key, ch);
      const d = Math.min(i, SIZE.length - 1);
      layer.hidden = i >= SIZE.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', !!r.alert);
      layer.dataset.level = String(ch.level);
      // The layer grows with --o-depth-grow; the stroke is divided so it looks the same.
      const grow = SIZE[d];
      layer.innerHTML = frontRing(id, key, STROKE[d] / grow / LANE, i === 0) + (i === 0
        ? face({ glyph: ch.glyph, name: ch.name, big: r.big, label: r.label, to: 'detail',
          props: { system: id, channel: key }, aria: t.details(ch.name) })
        : backLayer({ text: `${ch.name} · ${r.big}`, at: labelAt(i), grow, stroke: STROKE[d], hit: 12,
          pick: { attr: 'data-pick', value: key, aria: t.bringToFront(ch.name) } }));
    });

    const front = sys.ch[ord[0]], fr = reading(id, ord[0], front);
    const hidden = ord.slice(SIZE.length).map((k) => ({ key: k, name: sys.ch[k].name }));
    const how = front.dial ? t.howDial : front.toggles ? t.howLights : '';
    if (dotsEl) {
      dotsEl.innerHTML = dots(IDS.map((other) => ({
        id: other, title: systems[other].title,
        level: Math.max(0, ...state[other].alerts.map((a) => systems[other].ch[a].level)),
        ring: frontRing(other, order(other)[0], DOT_LANES),
      })), id);
    }
    strip.innerHTML = fr.alert
      ? `<strong>${front.name}:</strong> ${fr.alert.why}. <button class="primary" data-resolve="${ord[0]}">${fr.alert.verb}</button>`
      : calmStrip(sys.title, front.name, hidden, how);
  };

  // ─── Direct controls ───
  // The dial updates in place, without repainting the layer: a repaint would
  // recreate the o-progress and cut the drag.
  const setDial = (key: string, v: number) => {
    const ch = sys.ch[key], dial = ch.dial!;
    const value = dialValue(dial, v);
    v = (value - dial.min) / (dial.max - dial.min);
    state[id].values[key] = v;
    const layer = layers.get(key)!, r = reading(id, key, ch);
    const ringEl = layer.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(value));
    ringEl?.setAttribute('aria-valuetext', `${num(value)}${dial.unit}`);
    const label = layer.querySelector('.face-label');
    if (label) label.textContent = r.label;
  };
  const fraction = (key: string) => reading(id, key, sys.ch[key]).v ?? 0;
  ctx.onCleanup(dialControls(el, {
    locked: () => locked,
    ringOf: (key) => layers.get(key)?.querySelector('.orbit-12') ?? null,
    current: fraction,
    stepOf: (key) => { const d = sys.ch[key].dial!; return d.step / (d.max - d.min); },
    set: setDial,
    activate: 'o-arc[data-pick], o-arc[data-seg]',
  }));

  const toggle = (key: string, i: number) => {
    const ch = sys.ch[key], st = state[id];
    const lit = [...lightsOf(id, key, ch, st.alerts.includes(key))];
    lit[i] = !lit[i];
    st.lit[key] = lit;
    // Switching off the light that caused the alert resolves it.
    if (st.alerts.includes(key) && ch.al.seg === i && !lit[i]) st.alerts = st.alerts.filter((a) => a !== key);
    paint();
    layers.get(key)!.querySelector<HTMLElement>(`[data-seg="${i}"]`)?.focus();
  };

  const lock = () => {
    locked = true;
    stage.classList.add('is-locked');
    setTimeout(() => { locked = false; stage.classList.remove('is-locked'); }, LOCK_MS);
  };

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const pick = target.closest<HTMLElement>('[data-pick]')?.dataset.pick;
    const resolve = target.closest<HTMLElement>('[data-resolve]')?.dataset.resolve;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = target.closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go) { goSystem(go); return; }
    const seg = target.closest<HTMLElement>('[data-seg]');
    if (seg) { toggle(seg.closest<HTMLElement>('.layer')!.dataset.ch!, Number(seg.dataset.seg)); return; }
    if (pick && !locked) { state[id].pick = pick; lock(); }
    else if (resolve) { state[id].alerts = state[id].alerts.filter((a) => a !== resolve); lock(); }
    else if (act === 'view') flat = !flat;
    else if (act === 'alert') {
      const st = state[id];
      if (st.alerts.length) st.alerts = [];
      else { st.alerts = [sys.front.find((k) => sys.ch[k].level === 2) ?? sys.front[0]]; st.pick = null; }
      lock();
    } else return;
    paint();
  });

  // ─── Phone: from one system to the next ───
  const goSystem = (other: string) => {
    if (other !== id) void app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // The browser leaves the horizontal gesture to the page (otherwise it cancels
  // it as a scroll) so Zumly's lateral swipe sees it.
  if (PHONE) el.style.touchAction = 'pan-y';
  parallax(stage, obj, () => !flat);

  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
}

// ─── Channel detail ─────────────────────────────────────────────────

function detail(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const ch = systems[id].ch[key];
  const el = ctx.target;
  el.dataset.title = ch.name;
  // The same controls as the object, with more room.
  const paint = () => {
    const r = reading(id, key, ch);
    let control = '';
    if (ch.dial && r.dial) {
      control = `<label class="slider">${ch.dial.label[0].toUpperCase()}${ch.dial.label.slice(1)}
        <input type="range" min="${ch.dial.min}" max="${ch.dial.max}" step="${ch.dial.step}" value="${r.dial.value}"></label>`;
    } else if (ch.toggles && r.segs) {
      control = `<ul class="switches">${r.segs.map((s, i) => `<li><label>
        <input type="checkbox" data-seg="${i}"${s.on ? ' checked' : ''}> ${s.label}</label></li>`).join('')}</ul>`;
    } else if (r.segs) {
      control = `<ol class="segments">${r.segs.map((s, i) =>
        `<li class="${r.alert?.fail?.includes(i) ? 'fail' : s.on ? 'on' : ''}">${s.label}</li>`).join('')}</ol>`;
    }
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${systems[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      <p class="detail-big">${r.big}</p>
      <p class="detail-label">${r.label}</p>
      ${r.alert ? `<p class="detail-why">${r.alert.why}</p>` : ''}
      ${control}
    </div>`;
  };
  paint();
  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.type === 'range' && ch.dial) {
      state[id].values[key] = (Number(input.value) - ch.dial.min) / (ch.dial.max - ch.dial.min);
      el.querySelector('.detail-label')!.textContent = reading(id, key, ch).label;
    } else if (input.dataset.seg !== undefined) {
      const st = state[id], i = Number(input.dataset.seg);
      const lit = [...lightsOf(id, key, ch, st.alerts.includes(key))];
      lit[i] = input.checked;
      st.lit[key] = lit;
      if (st.alerts.includes(key) && ch.al.seg === i && !lit[i]) st.alerts = st.alerts.filter((a) => a !== key);
      paint();
      el.querySelector<HTMLElement>(`[data-seg="${i}"]`)?.focus();
    }
  });
}

const app = new Zumly(zumlyOptions({
  board, detail,
  ...Object.fromEntries(IDS.map((id) => [`sys-${id}`, (ctx: ViewContext) => system(ctx, id)])),
}, 'board'));

// The views behind stay in the DOM and do not re-render: on the way back they
// are repainted with the current state (a value changed in the detail, an alert).
app.on('afterZoomOut', () => rerender.forEach((fn) => fn()));

await app.init();

// On the phone, start inside the system that calls the most (or Home).
if (PHONE) {
  const level = (id: string) => Math.max(0, ...state[id].alerts.map((a) => systems[id].ch[a].level));
  await startInside(app, [...IDS].sort((a, b) => level(b) - level(a))[0]);
}
Object.assign(window, { pulseProto: { app, state } });
