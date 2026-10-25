import Zumly, { type ViewContext } from 'zumly';
import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import './style.css';
import { systems, type Channel, type PulseSystem } from './systems.ts';

// Estado por sistema, fuera de las vistas: Zumly descarta la vista hija al
// volver, y la de atrás no se vuelve a renderizar sola.
type SystemState = {
  pick: string | null; alerts: string[];
  values: Record<string, number>;          // dial: 0..1
  lit: Record<string, boolean[]>;          // toggles: un valor por segmento
};
const state: Record<string, SystemState> = Object.fromEntries(
  Object.keys(systems).map((id) => [id, { pick: null, alerts: [], values: {}, lit: {} }]),
);
const rerender = new Set<() => void>();

// En el celular se mira un sistema a la vez: dos capas visibles, menos
// crecimiento entre capas, sin paralaje y deslizamiento lateral entre sistemas.
// Se decide al cargar; cambiar el ancho después no cambia el modo.
const PHONE = matchMedia('(max-width: 600px)').matches;
const GROW = PHONE ? 0.24 : 0.42;                  // --o-depth-grow
const SIZE = Array.from({ length: PHONE ? 2 : 3 }, (_, d) => 1 + GROW * d);
const STROKE = [6, 3, 2.5];        // trazo aparente por profundidad, px
const IDS = Object.keys(systems);
const LOCK_MS = 800;

function order(id: string): string[] {
  const sys = systems[id], st = state[id];
  const alerts = [...st.alerts].sort((a, b) => sys.ch[b].level - sys.ch[a].level);
  const rest = sys.front.filter((c) => !alerts.includes(c));
  if (!alerts.length && st.pick) rest.sort((a, b) => Number(b === st.pick) - Number(a === st.pick));
  return [...alerts, ...rest];
}

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

type Dial = NonNullable<Channel['dial']>;
// Valor del dial en sus unidades, redondeado al paso.
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
  if (!list.length) return 'todas apagadas';
  const low = list.map((n) => n.toLowerCase());
  return low.length === 1 ? low[0] : `${low.slice(0, -1).join(', ')} y ${low.at(-1)}`;
}

function reading(id: string, key: string, ch: Channel) {
  const alert = state[id].alerts.includes(key);
  const base = alert ? ch.al : ch.ok;
  const v = state[id].values[key] ?? base.v;
  let { big, label } = base;
  let lit: boolean[] | undefined;
  if (ch.dial && !alert && v !== undefined) label = `${ch.dial.label} ${num(dialValue(ch.dial, v))}${ch.dial.unit}`;
  if (ch.toggles) {
    lit = lightsOf(id, key, ch, alert);
    if (!alert) {
      big = `${lit.filter(Boolean).length} de ${lit.length}`;
      label = names(ch.toggles.filter((_, i) => lit![i]));
    }
  }
  return { alert, ...base, big, label, v, lit, seg: alert ? ch.al.seg : undefined };
}

// Anillo de un canal en orbit-12, que toca el borde del universo (.bigbang).
// El grosor va en carriles (un carril = radio / 12): `lanes` = px / carril.
// Con `controls`, el anillo de adelante se maneja directo: el dial se
// arrastra (role="slider") y cada segmento de un toggle es un interruptor.
function ring(id: string, key: string, ch: Channel, lanes: number, controls = false) {
  const r = reading(id, key, ch);
  const color = r.alert ? (ch.level === 2 ? 'var(--grave)' : 'var(--leve)') : 'var(--ink)';
  const size = `--o-size-ratio:${lanes.toFixed(3)}`;
  if (ch.type === 'p') {
    const v = r.v ?? 0, pct = (v * 100).toFixed(1);
    const dial = controls && ch.dial;
    if (!dial) {
      return `<div class="orbit-12" style="${size}"><o-progress value="${pct}"
        style="--o-fill:${color}; --o-back-fill:var(--line)"></o-progress></div>`;
    }
    const t = dialValue(dial, v);
    return `<div class="orbit-12" style="${size}"><o-progress value="${pct}" class="dial" data-dial="${key}"
        interactive hit-width="12" role="slider" tabindex="0" aria-label="${dial.label} de ${ch.name}"
        aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${t}"
        aria-valuetext="${num(t)}${dial.unit}" style="--o-fill:${color}; --o-back-fill:var(--line)"></o-progress></div>
      <div class="orbit-12 knob-orbit" style="--o-range:0deg; --o-from:${(v * 360).toFixed(1)}deg">
        <div class="satellite knob" style="--o-size-ratio:1.4"></div></div>`;
  }
  const segs = Array.from({ length: ch.segs ?? 4 }, (_, i) => {
    const on = r.lit ? r.lit[i] : i < (r.on ?? 0);
    const fill = r.seg === i && on ? color : on ? 'var(--ink)' : 'var(--dim)';
    if (!(controls && ch.toggles)) return `<o-arc style="--o-fill:${fill}"></o-arc>`;
    return `<o-arc style="--o-fill:${fill}" class="toggle" data-seg="${i}" interactive hit-width="10"
      role="switch" tabindex="0" aria-checked="${on}" aria-label="${ch.toggles[i]}"></o-arc>`;
  }).join('');
  return `<div class="orbit-12" style="${size}; --o-gap:24">${segs}</div>`;
}

function icon(path: string, size = 22) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

// ─── Tablero ────────────────────────────────────────────────────────

function mini(id: string) {
  const sys = systems[id], key = order(id)[0], ch = sys.ch[key];
  const alert = state[id].alerts.length > 0;
  return `<button class="tile zoom-me${alert ? ' has-alert' : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="Abrir ${sys.title}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(id, key, ch, 6 / 3.5)}</span></span>
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
  </button>`;
}

function tablero(ctx: ViewContext) {
  const el = ctx.target;
  const paint = () => {
    el.innerHTML = `<div class="board">
      <header class="board-head"><p class="eyebrow">PULSE · TABLERO</p><h1>Todo en calma, salvo lo que llame.</h1></header>
      <div class="tiles">${Object.keys(systems).map(mini).join('')}</div>
      <div class="board-actions">
        <button class="plain" data-act="grave">Simular aviso grave en Auto</button>
      </div>
    </div>`;
  };
  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act !== 'grave') return;
    if (!state.auto.alerts.includes('cubiertas')) state.auto.alerts.push('cubiertas');
    paint();
    // Un aviso grave abre su tarjeta sola, desde la tarjeta (no desde el centro).
    const tile = el.querySelector<HTMLElement>('.tile[data-system="auto"]');
    if (tile) void app.zoomIn(tile);
  });
}

// ─── Sistema: objeto radial en capas ────────────────────────────────

// Una vista por sistema (sys-casa, sys-auto…): Zumly navega de lado solo entre
// vistas de nombre distinto.
function sistema(ctx: ViewContext, id: string) {
  const sys: PulseSystem = systems[id];
  const el = ctx.target;
  let flat = true, locked = false;

  // Capas de Orbit: cada canal es un .gravity-spot anidado con data-depth;
  // .depth lo mueve en z y compensa la escala. El universo (.bigbang) mide lo
  // que la capa de adelante; outer-perspective deja la perspectiva al
  // escenario para que el paralaje gire todo el objeto.
  el.innerHTML = `<div class="system">
    <div class="stage" data-zoom="calm">
      <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective is-flat"
        style="--o-depth-grow:${GROW}"></div></div></div>
    </div>
    <div class="strip" aria-live="polite"></div>
    ${PHONE ? `<nav class="dots" aria-label="Sistemas"></nav>` : ''}
    <div class="controls">
      <button class="plain" data-act="view">Ver en 3D</button>
      <button class="plain" data-act="alert">Simular aviso</button>
    </div>
  </div>`;
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  const dots = el.querySelector<HTMLElement>('.dots');

  // Una capa por canal, creada una vez: al reordenar solo cambia data-depth,
  // así la transición de profundidad de Orbit anima el cambio.
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
    el.querySelector<HTMLElement>('[data-act="view"]')!.textContent = flat ? 'Ver en 3D' : 'Ver plano';
    el.querySelector<HTMLElement>('[data-act="alert"]')!.textContent = alert ? 'Resolver avisos' : 'Simular aviso';

    ord.forEach((key, i) => {
      const layer = layers.get(key)!, ch = sys.ch[key], r = reading(id, key, ch);
      const d = Math.min(i, SIZE.length - 1);
      layer.hidden = i >= SIZE.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', r.alert);
      layer.dataset.level = String(ch.level);
      // La capa crece con --o-depth-grow; el trazo se divide para que se vea igual.
      // Un carril mide 10 px: el radio del universo (120 px) / 12.
      const grow = SIZE[d];
      layer.innerHTML = ring(id, key, ch, STROKE[d] / grow / 10, i === 0) + (i === 0
        ? `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
             <div class="capsule disc zoom-me" role="button" tabindex="0" data-to="detalle"
               data-system="${id}" data-channel="${key}" aria-label="Detalle de ${ch.name}">
               ${icon(ch.glyph)}<span class="face-name">${ch.name}</span>
               <span class="face-big">${r.big}</span><span class="face-label">${r.label}</span></div></div></div>`
        // La etiqueta toma el largo de su texto (range="auto"). El toque es la
        // banda del anillo con "interactive", transparente, y hit-width de margen.
        : `<div class="orbit-11" style="--o-from:${i === 1 ? 300 : 30}deg">
             <o-arc range="auto" class="arc-label" style="font-size:${(11 / grow).toFixed(2)}px">${ch.name.toUpperCase()} · ${r.big}</o-arc></div>
           <div class="orbit-12" style="--o-size-ratio:${(STROKE[d] / grow / 10).toFixed(3)}">
             <o-arc interactive hit-width="${(12 / grow).toFixed(1)}" data-pick="${key}" class="ring-hit"
               role="button" tabindex="0" aria-label="Traer ${ch.name} al frente"></o-arc></div>`);
    });

    const front = sys.ch[ord[0]], fr = reading(id, ord[0], front);
    const extra = ord.length - SIZE.length;
    const how = front.dial ? 'Arrastrá el anillo · tocá el centro para ver más'
      : front.toggles ? 'Tocá cada luz para prenderla o apagarla' : '';
    // Puntos: un mini anillo por sistema; el de un sistema con aviso late.
    if (dots) {
      dots.innerHTML = IDS.map((other) => {
        const k = order(other)[0], c = systems[other].ch[k];
        const level = Math.max(0, ...state[other].alerts.map((a) => systems[other].ch[a].level));
        return `<button class="dot${level ? ` has-alert level-${level}` : ''}" data-go="${other}"
          aria-label="${systems[other].title}"${other === id ? ' aria-current="true"' : ''}>
          <span class="bigbang"><span class="gravity-spot">${ring(other, k, c, 2.5 / (22 / 24))}</span></span></button>`;
      }).join('');
    }
    strip.innerHTML = fr.alert
      ? `<strong>${front.name}:</strong> ${front.al.why}. <button class="primary" data-resolve="${ord[0]}">${front.al.verb}</button>`
      : `<strong>${sys.title}</strong> · adelante ${front.name}${extra > 0 ? ` · +${extra} al fondo` : ''}${
        how ? `<span class="how">${how}</span>` : ''}`;
  };

  // ─── Controles directos ───
  // El dial se actualiza en el lugar, sin repintar la capa: repintar
  // recrearía el o-progress y cortaría el arrastre.
  const setDial = (key: string, v: number) => {
    const ch = sys.ch[key], dial = ch.dial!;
    const t = dialValue(dial, v);
    v = (t - dial.min) / (dial.max - dial.min);
    state[id].values[key] = v;
    const layer = layers.get(key)!, r = reading(id, key, ch);
    const ring = layer.querySelector<HTMLElement>('[data-dial]');
    ring?.setAttribute('value', (v * 100).toFixed(1));
    ring?.setAttribute('aria-valuenow', String(t));
    ring?.setAttribute('aria-valuetext', `${num(t)}${dial.unit}`);
    layer.querySelector<HTMLElement>('.knob-orbit')?.style.setProperty('--o-from', `${(v * 360).toFixed(1)}deg`);
    const label = layer.querySelector('.face-label');
    if (label) label.textContent = r.label;
  };

  const toggle = (key: string, i: number) => {
    const ch = sys.ch[key], st = state[id];
    const lit = [...lightsOf(id, key, ch, st.alerts.includes(key))];
    lit[i] = !lit[i];
    st.lit[key] = lit;
    // Apagar la luz que causaba el aviso lo resuelve.
    if (st.alerts.includes(key) && ch.al.seg === i && !lit[i]) st.alerts = st.alerts.filter((a) => a !== key);
    paint();
    layers.get(key)!.querySelector<HTMLElement>(`[data-seg="${i}"]`)?.focus();
  };

  let drag: { key: string; last: number } | null = null;
  let swallowUntil = 0;
  // Ángulo del puntero (0 arriba, en sentido horario) como fracción de vuelta.
  // Cerca del centro el ángulo salta con cualquier movimiento: ahí no cambia.
  const angleAt = (key: string, x: number, y: number) => {
    const b = layers.get(key)!.querySelector('.orbit-12')!.getBoundingClientRect();
    const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2);
    if (Math.hypot(dx, dy) < b.width * 0.2) return null;
    return ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360 / 360;
  };
  const dragTo = (x: number, y: number) => {
    if (!drag) return;
    let v = angleAt(drag.key, x, y);
    if (v === null) return;
    // Sin saltos por el cero: del final al principio (y al revés) se queda en el tope.
    if (drag.last > 0.75 && v < 0.25) v = 1;
    else if (drag.last < 0.25 && v > 0.75) v = 0;
    drag.last = v;
    setDial(drag.key, v);
  };

  el.addEventListener('pointerdown', (e) => {
    const ring = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ring || locked) return;
    e.preventDefault();
    ring.setPointerCapture(e.pointerId);
    ring.focus({ preventScroll: true });
    drag = { key: ring.dataset.dial!, last: state[id].values[ring.dataset.dial!] ?? 0 };
    swallowUntil = Infinity;
    dragTo(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => { if (drag) dragTo(e.clientX, e.clientY); });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    swallowUntil = performance.now() + 400;
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  // Zumly escucha mouseup y touchend en el canvas: soltar sobre el disco haría
  // zoom-in, y en tacto deslizar a la izquierda hace zoom-out. Mientras se
  // arrastra (y un instante después) esos eventos no le llegan.
  const swallow = (e: Event) => {
    if (performance.now() < swallowUntil) e.stopPropagation();
  };
  for (const type of ['mouseup', 'touchend', 'click']) window.addEventListener(type, swallow, true);
  ctx.onCleanup(() => {
    for (const type of ['mouseup', 'touchend', 'click']) window.removeEventListener(type, swallow, true);
  });
  // Un toque que empieza en el dial no cuenta como gesto de Zumly.
  el.addEventListener('touchstart', (e) => {
    if ((e.target as HTMLElement).closest('[data-dial]')) e.stopPropagation();
  }, { passive: true });

  // La rueda sobre el dial mueve el valor (Zumly la usaría para volver).
  el.addEventListener('wheel', (e) => {
    const ring = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ring) return;
    e.preventDefault();
    e.stopPropagation();
    const key = ring.dataset.dial!, dial = sys.ch[key].dial!;
    const stepV = dial.step / (dial.max - dial.min);
    setDial(key, (state[id].values[key] ?? 0) + (e.deltaY < 0 ? stepV : -stepV));
  }, { passive: false });

  const lock = () => {
    locked = true;
    stage.classList.add('is-locked');
    setTimeout(() => { locked = false; stage.classList.remove('is-locked'); }, LOCK_MS);
  };

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>('[data-pick]')?.dataset.pick;
    const resolve = t.closest<HTMLElement>('[data-resolve]')?.dataset.resolve;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go) { goSystem(go); return; }
    const seg = t.closest<HTMLElement>('[data-seg]');
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

  // Los o-arc no son botones nativos: Enter y Espacio los activan. El dial
  // responde a las flechas como un slider (Zumly ignora role="slider").
  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('o-arc[data-pick], o-arc[data-seg]')) {
      e.preventDefault();
      t.click();
      return;
    }
    if (!t.matches('[data-dial]')) return;
    const key = t.dataset.dial!, dial = sys.ch[key].dial!;
    const stepV = dial.step / (dial.max - dial.min), v = state[id].values[key] ?? 0;
    const next: Record<string, number> = {
      ArrowRight: v + stepV, ArrowUp: v + stepV, ArrowLeft: v - stepV, ArrowDown: v - stepV,
      PageUp: v + stepV * 4, PageDown: v - stepV * 4, Home: 0, End: 1,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setDial(key, Math.min(1, Math.max(0, next[e.key])));
  });

  // ─── Celular: de un sistema al otro ───
  const goSystem = (other: string) => {
    if (other !== id) void app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // Deslizar a los costados pasa al sistema vecino. Zumly no tiene
  // deslizamiento lateral y a la izquierda haría zoom-out: el gesto se
  // resuelve acá y no le llega. Empezar en el dial es arrastrarlo, no deslizar.
  let swipe: { x: number; y: number } | null = null;
  if (PHONE) {
    el.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      swipe = t.closest('[data-dial], .dots') ? null : { x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swallowUntil = performance.now() + 400;
      const at = IDS.indexOf(id), next = IDS[at + (dx < 0 ? 1 : -1)];
      if (next) goSystem(next);
    });
    el.addEventListener('pointercancel', () => { swipe = null; });

    // Pellizcar (dos dedos que se juntan) vuelve al tablero.
    let pinch = 0;
    const span = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = span(e.touches); }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (pinch && e.touches.length === 2 && span(e.touches) < pinch * 0.7) {
        pinch = 0;
        swallowUntil = performance.now() + 400;
        void app.zoomOut();
      }
    }, { passive: true });
    el.addEventListener('touchend', () => { pinch = 0; }, { passive: true });
  }

  // Paralaje ±7° solo en 3D, y no en el celular (no hay puntero).
  stage.addEventListener('pointermove', (e) => {
    if (flat || PHONE) return;
    const b = stage.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    obj.style.setProperty('--rx', `${(-y * 14).toFixed(2)}deg`);
    obj.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
  });
  stage.addEventListener('pointerleave', () => {
    obj.style.setProperty('--rx', '0deg');
    obj.style.setProperty('--ry', '0deg');
  });

  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
}

// ─── Detalle de un canal ────────────────────────────────────────────

function detalle(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const ch = systems[id].ch[key];
  const el = ctx.target;
  // Los mismos controles que el objeto, con más espacio.
  const paint = () => {
    const r = reading(id, key, ch);
    let control = '';
    if (ch.dial && r.v !== undefined) {
      const t = dialValue(ch.dial, r.v);
      control = `<label class="slider">${ch.dial.label[0].toUpperCase()}${ch.dial.label.slice(1)}
        <input type="range" min="${ch.dial.min}" max="${ch.dial.max}" step="${ch.dial.step}" value="${t}"></label>`;
    } else if (ch.toggles && r.lit) {
      control = `<ul class="switches">${ch.toggles.map((n, i) => `<li><label>
        <input type="checkbox" data-seg="${i}"${r.lit![i] ? ' checked' : ''}> ${n}</label></li>`).join('')}</ul>`;
    } else if (ch.type === 's') {
      control = `<ol class="segments">${Array.from({ length: ch.segs ?? 4 }, (_, i) =>
        `<li class="${r.seg === i ? 'fail' : i < (r.on ?? 0) ? 'on' : ''}">${ch.name} ${i + 1}</li>`).join('')}</ol>`;
    }
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${systems[id].title.toUpperCase()} · DETALLE</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      <p class="detail-big">${r.big}</p>
      <p class="detail-label">${r.label}</p>
      ${r.alert ? `<p class="detail-why">${ch.al.why}</p>` : ''}
      ${control}
      <p class="hint">Para volver: botón de abajo a la izquierda, rueda hacia abajo o flecha izquierda.</p>
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

const app = new Zumly({
  mount: '#canvas',
  initialView: 'tablero',
  views: {
    tablero, detalle,
    ...Object.fromEntries(IDS.map((id) => [`sys-${id}`, (ctx: ViewContext) => sistema(ctx, id)])),
  },
  transitions: {
    duration: '0.8s',
    ease: 'cubic-bezier(.2,.8,.2,1)',
    // La navegación se aleja con desenfoque; las capas del objeto, nunca.
    // Así no se confunde "nivel anterior" con "canal de atrás".
    effects: ['blur(3px) brightness(.45)', 'blur(8px) brightness(.25)'],
    hideTrigger: 'fade',
  },
  lateralNav: false,
});

// Las vistas de atrás siguen en el DOM y no se re-renderizan: al volver, se
// repintan con el estado actual (un valor cambiado en el detalle, un aviso).
app.on('afterZoomOut', () => rerender.forEach((fn) => fn()));

await app.init();

// En el celular se arranca adentro del sistema que más llama (o Casa): el
// tablero queda atrás como vista general, a un pellizco o al botón de volver.
if (PHONE) {
  const level = (id: string) => Math.max(0, ...state[id].alerts.map((a) => systems[id].ch[a].level));
  const first = [...IDS].sort((a, b) => level(b) - level(a))[0];
  const tile = document.querySelector<HTMLElement>(`.tile[data-system="${first}"]`);
  if (tile) {
    tile.dataset.withDuration = '1ms';
    await app.zoomIn(tile);
    delete tile.dataset.withDuration;
  }
}
Object.assign(window, { pulseProto: { app, state } });
