import Zumly, { type ViewContext } from 'zumly';
import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '../zumly-radial/style.css';
import './style.css';
import { HomeAssistant, type Call, type HassState } from './ha.ts';
import { nameOf, systems, type Alert, type Channel, type Reading } from './model.ts';
import { mountTunePanel, tune } from './tune.ts';

// Mismo objeto que el prototipo zumly-radial, pero con Home Assistant vivo:
// las lecturas, los avisos y su resolución vienen del WebSocket. Lo que se ve
// es lo confirmado por Home Assistant; mientras no confirma, el segmento o el
// dial queda "enviando".

const ha = new HomeAssistant();
const SYS = Object.fromEntries(systems.map((s) => [s.id, s]));
const IDS = systems.map((s) => s.id);

type Ui = {
  pick: string | null;                 // canal elegido a mano
  since: Map<string, number>;          // cuándo apareció cada aviso (regla 1: estable)
  sig: Map<string, string>;            // qué dice cada aviso: si cambia, deja de estar visto
  seen: Set<string>;                   // avisos dados por vistos (sin onda, van detrás)
};
const ui: Record<string, Ui> = Object.fromEntries(IDS.map((id) => [id, { pick: null, since: new Map(), sig: new Map(), seen: new Set() }]));
let readings: Record<string, Map<string, { ch: Channel; r: Reading }>> = {};
// Entidades con una orden sin confirmar, y valores de dial que el usuario está moviendo.
const pending = new Map<string, number>();
const hold = new Map<string, { value: number; until: number }>();
const log: { at: Date; text: string; level: number; entity?: string }[] = [];
const rerender = new Set<() => void>();
let toast = '';

const PHONE = matchMedia('(max-width: 600px)').matches;
const GROW = PHONE ? 0.24 : 0.42;
const SIZE = Array.from({ length: PHONE ? 2 : 3 }, (_, d) => 1 + GROW * d);
const STROKE = [6, 3, 2.5];
const LOCK_MS = 800;
const PENDING_MS = 8000;
// Vista en capas del tablero: siete sistemas, cada capa un poco más grande
// (tune.layerGrow, 16% por defecto), y las etiquetas de las capas de atrás
// repartidas para que no se pisen.
const LABEL_AT = [300, 30, 330, 60, 280, 80];

const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const sig = (a: Alert) => `${a.level}|${a.big}|${a.why}`;

// ─── Lectura ────────────────────────────────────────────────────────

function compute() {
  const now = Date.now(), fresh: { id: string; key: string; a: Alert }[] = [];
  readings = {};
  for (const sys of systems) {
    const map = new Map<string, { ch: Channel; r: Reading }>(), u = ui[sys.id];
    for (const ch of sys.channels) {
      const r = ch.read(ha.states, { temp: ha.unit });
      if (!r) continue;
      if (r.dial) {
        const h = hold.get(r.dial.entity);
        if (h && h.until > now) { r.dial.value = h.value; r.v = (h.value - r.dial.min) / (r.dial.max - r.dial.min); }
      }
      map.set(ch.key, { ch, r });
      if (r.alert) {
        if (u.sig.get(ch.key) !== sig(r.alert)) {
          u.seen.delete(ch.key);
          u.sig.set(ch.key, sig(r.alert));
          if (!u.since.has(ch.key)) { u.since.set(ch.key, now); fresh.push({ id: sys.id, key: ch.key, a: r.alert }); }
        }
      } else { u.since.delete(ch.key); u.sig.delete(ch.key); u.seen.delete(ch.key); }
    }
    readings[sys.id] = map;
    // Un aviso nuevo cancela la elección a mano.
    if (fresh.some((f) => f.id === sys.id)) u.pick = null;
  }
  return fresh;
}

function order(id: string): string[] {
  const map = readings[id], u = ui[id];
  const keys = [...map.keys()];
  const alerts = keys.filter((k) => map.get(k)!.r.alert);
  // Regla 1: el de adelante se queda; solo lo desplaza uno más grave. Los vistos van detrás.
  alerts.sort((a, b) => Number(u.seen.has(a)) - Number(u.seen.has(b))
    || map.get(b)!.r.alert!.level - map.get(a)!.r.alert!.level
    || u.since.get(a)! - u.since.get(b)!);
  const rest = keys.filter((k) => !alerts.includes(k));
  const all = [...alerts.filter((k) => !u.seen.has(k)), ...rest, ...alerts.filter((k) => u.seen.has(k))];
  if (u.pick && all.includes(u.pick)) all.sort((a, b) => Number(b === u.pick) - Number(a === u.pick));
  return all;
}

const live = (id: string) => order(id).filter((k) => readings[id].get(k)!.r.alert && !ui[id].seen.has(k));
const worst = (id: string) => Math.max(0, ...live(id).map((k) => readings[id].get(k)!.r.alert!.level));
const isPending = (r: Reading) => r.entities.some((e) => pending.has(e));

// ─── Órdenes a Home Assistant ───────────────────────────────────────

async function send(calls: Call[]) {
  for (const c of calls) {
    const ids = ([] as string[]).concat((c.data.entity_id as string | string[]) ?? []);
    ids.forEach((e) => pending.set(e, Date.now()));
    try {
      await ha.call(c);
    } catch (error) {
      ids.forEach((e) => { pending.delete(e); hold.delete(e); });
      toast = `Home Assistant: ${error instanceof Error ? error.message : String(error)}`;
      setTimeout(() => { toast = ''; repaint(); }, 5000);
    }
  }
  repaint();
  // Si Home Assistant no cambia nada (por ejemplo, un servicio sin efecto), se deja de esperar.
  setTimeout(() => {
    let changed = false;
    for (const [e, t] of pending) if (Date.now() - t >= PENDING_MS) { pending.delete(e); changed = true; }
    if (changed) repaint();
  }, PENDING_MS + 50);
}

function repaint() {
  compute();
  rerender.forEach((fn) => fn());
}

// ─── Anillos ────────────────────────────────────────────────────────

function color(r: Reading) {
  return r.alert ? (r.alert.level === 2 ? 'var(--grave)' : 'var(--leve)') : 'var(--ink)';
}

// `call`: el aviso de este anillo llama (adelante y sin silenciar): su segmento en falla ondea.
function ring(key: string, r: Reading, lanes: number, controls = false, muted = false, call = false) {
  const fill = muted ? 'var(--muted)' : color(r);
  const size = `--o-size-ratio:${lanes.toFixed(3)}`;
  const busy = isPending(r) ? ' is-pending' : '';
  if (r.kind === 'p') {
    const pct = ((r.v ?? 0) * 100).toFixed(1);
    const dial = controls && r.dial;
    if (!dial) {
      return `<div class="orbit-12${busy}" style="${size}"><o-progress value="${pct}"
        style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress></div>`;
    }
    return `<div class="orbit-12${busy}" style="${size}"><o-progress value="${pct}" class="dial" data-dial="${key}"
        interactive hit-width="12" role="slider" tabindex="0" aria-label="${dial.label}"
        aria-valuemin="${dial.min}" aria-valuemax="${dial.max}" aria-valuenow="${dial.value}"
        aria-valuetext="${num(dial.value)}${dial.unit}" style="--o-fill:${fill}; --o-back-fill:var(--line)"></o-progress>
      <div class="satellite knob at-value" style="--o-size-ratio:1.4"></div></div>`;
  }
  const segs = (r.segs ?? []).map((s, i) => {
    const fail = !!r.alert?.fail?.includes(i) && !muted;
    const f = fail ? fill : s.on ? 'var(--ink)' : 'var(--dim)';
    // Regla 2: la onda sale del segmento en falla (o-arc.ripple).
    const wait = (pending.has(s.entity) ? ' is-pending' : '') + (call && fail ? ' ripple' : '');
    if (!(controls && s.act)) return `<o-arc class="${wait.trim()}" style="--o-fill:${f}"></o-arc>`;
    return `<o-arc style="--o-fill:${f}" class="toggle${wait}" data-seg="${i}" interactive hit-width="10"
      role="switch" tabindex="0" aria-checked="${s.on}" aria-label="${esc(s.label)}"></o-arc>`;
  }).join('');
  const gap = (r.segs?.length ?? 0) > 1 ? 24 : 0;
  return `<div class="orbit-12" style="${size}; --o-gap:${gap}">${segs}</div>`;
}

function icon(path: string, size = 22) {
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
}

// ─── Tablero ────────────────────────────────────────────────────────

function mini(id: string) {
  const sys = SYS[id], key = order(id)[0];
  if (!key) return '';
  const { ch, r } = readings[id].get(key)!;
  const level = worst(id);
  return `<button class="tile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="Abrir ${sys.title}">
    <span class="bigbang mini-ring"><span class="gravity-spot">${ring(key, r, 6 / 3.5, false, !r.alert)}</span></span>
    <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
    <span class="tile-title">${sys.title}</span>
    <span class="tile-big">${esc(r.alert && !ui[id].seen.has(key) ? r.alert.big : r.big)}</span>
  </button>`;
}

function headline() {
  if (ha.status !== 'live') return 'Conectando con tu casa…';
  const calling = IDS.flatMap((id) => live(id).map((k) => ({ id, k, a: readings[id].get(k)!.r.alert! })))
    .sort((a, b) => b.a.level - a.a.level);
  if (!calling.length) return 'Todo en calma.';
  if (calling.length === 1) return `${calling[0].a.why}.`;
  return `${calling.length} cosas llaman · ${calling[0].a.why.toLowerCase()}.`;
}

function status() {
  const label = { connecting: 'conectando', live: 'en vivo', offline: 'sin conexión, reintentando', error: 'error' }[ha.status];
  return `<span class="conn conn-${ha.status}"><span class="conn-dot"></span>Home Assistant${ha.version ? ` ${ha.version}` : ''} · ${label}</span>`;
}

// Tres formas de mirar la casa entera, sobre los mismos datos:
// - grilla: un mini anillo por sistema (lo de siempre);
// - órbita: el pulso de la casa en el centro y los sistemas girando alrededor;
// - capas: un solo objeto, un sistema por capa; el que más llama va adelante.
type BoardMode = 'grilla' | 'orbita' | 'capas';
const MODES: [BoardMode, string][] = [['grilla', 'Grilla'], ['orbita', 'Órbita'], ['capas', 'Capas']];
let boardMode: BoardMode = 'grilla';
try {
  const saved = localStorage.getItem('pulse-ha-board');
  if (MODES.some(([m]) => m === saved)) boardMode = saved as BoardMode;
} catch { /* sin almacenamiento: arranca en grilla */ }
let boardPick: string | null = null;

const time = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

// Sistemas de adelante hacia atrás: la elección a mano, los que llaman (más
// grave primero) y después el orden de siempre. Un aviso nuevo cancela la elección.
function boardOrder() {
  const base = IDS.filter((id) => order(id).length);
  const calling = base.filter((id) => worst(id)).sort((a, b) => worst(b) - worst(a));
  const all = [...calling, ...base.filter((id) => !calling.includes(id))];
  if (boardPick && all.includes(boardPick)) all.sort((a, b) => Number(b === boardPick) - Number(a === boardPick));
  return all;
}

// Lectura que representa a un sistema: su canal de adelante.
function front(id: string) {
  const key = order(id)[0], { ch, r } = readings[id].get(key)!;
  const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
  return { key, ch, r, a, big: a ? a.big : r.big, label: a ? a.label : r.label };
}

// Un sistema de la órbita: un satélite de Orbit. Orbit lo ubica; el anillo
// ocupa el satélite y el texto cuelga hacia afuera con `.outward-y` de Orbit
// (encima en la mitad de arriba, debajo en el resto).
function orbitTile(id: string) {
  const f = front(id), level = worst(id);
  return `<div class="satellite"><div class="capsule">
    <button class="otile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="Abrir ${SYS[id].title}">
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${ring(f.key, f.r, 6 / 3.5, false, !f.r.alert)}</span></span>
        <span class="otile-glyph">${icon(f.ch.glyph, 24)}</span></span>
      <span class="otile-label outward-y"><span class="tile-title">${SYS[id].title}</span>
      <span class="tile-big">${esc(f.big)}</span></span>
    </button></div></div>`;
}

// Centro de la órbita: un segmento por sistema, frente a su tarjeta y pintado
// si ese sistema llama.
function hubRing(ids: string[]) {
  const segs = ids.map((id) => {
    const level = worst(id);
    return `<o-arc style="--o-fill:${level === 2 ? 'var(--grave)' : level === 1 ? 'var(--leve)' : 'var(--dim)'}"></o-arc>`;
  }).join('');
  // Los sistemas están corridos medio paso (ninguno justo arriba): cada segmento
  // queda frente al suyo sin rotar el anillo.
  return `<span class="bigbang hub-ring"><span class="gravity-spot">
    <div class="orbit-12" style="--o-size-ratio:.5; --o-gap:30">${segs}</div></span></span>`;
}

// Adentro del centro, una cosa a la vez: cada aviso (el más grave primero) y al
// final el pulso de la casa. Se pasa solo cada 6 s, o con los puntos.
type Slide = { key: string; level: number; html: string };
function hubSlides(): Slide[] {
  const alerts = IDS.flatMap((id) => live(id).map((k) => ({ id, ...readings[id].get(k)!, k })))
    .sort((a, b) => b.r.alert!.level - a.r.alert!.level);
  const list: Slide[] = alerts.map(({ id, k, ch, r }) => {
    const a = r.alert!;
    return { key: `${id}:${k}`, level: a.level, html: `<div class="slide level-${a.level}">
      <p class="eyebrow">${esc(`${SYS[id].title} · ${ch.name}`)}</p>
      <p class="slide-big">${esc(a.big)}</p>
      <p class="slide-why">${esc(a.why)}</p>
      <button class="plain slide-go" data-open="${id}">Abrir</button></div>` };
  });
  // Las tres entidades mostradas que cambiaron último, con su valor de ahora.
  const rows = [...watched()].map((e) => ha.states.get(e)!).filter(Boolean)
    .sort((a, b) => b.last_changed.localeCompare(a.last_changed)).slice(0, 3)
    .map((s) => `<li><span>${esc(nameOf(ha.states, s.entity_id))}</span><strong>${esc(stateText(s))}</strong></li>`);
  list.push({ key: 'pulso', level: 0, html: `<div class="slide">
    <p class="eyebrow">Pulso</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? `${alerts.length} aviso${alerts.length > 1 ? 's' : ''}` : 'En calma'}</p>
    <ul class="hub-rows">${rows.join('') || '<li><span>Esperando cambios…</span></li>'}</ul></div>` });
  return list;
}
let slideKey: string | null = null;
const SLIDE_MS = 6000;

// Reemplaza el contenido solo si cambió: los o-arc nuevos tardan un momento en
// dibujarse (y en recibir toques), y la casa manda cambios cada pocos segundos.
const drawn = new WeakMap<HTMLElement, string>();
function setHTML(el: HTMLElement, html: string) {
  if (drawn.get(el) === html) return;
  drawn.set(el, html);
  el.innerHTML = html;
}

function tablero(ctx: ViewContext) {
  const el = ctx.target;
  el.dataset.title = 'Tablero';   // lo muestra el botón de volver de Zumly
  el.innerHTML = `<div class="board">
    <header class="board-head"><h1></h1><span class="conn-slot"></span>
      <nav class="modes" aria-label="Vista">${MODES.map(([m, label]) =>
        `<button class="mode" data-mode="${m}">${label}</button>`).join('')}</nav></header>
    <p class="error" hidden></p>
    <div class="board-body"></div>
    <ol class="ticker" aria-label="Últimos cambios"></ol>
  </div>`;
  const board = el.querySelector<HTMLElement>('.board')!;
  const body = el.querySelector<HTMLElement>('.board-body')!;
  let built: BoardMode | null = null;
  let layers = new Map<string, HTMLElement>();
  let beat = log[0];

  // Órbita y capas se dimensionan con el espacio que queda (--S, en px). En la
  // órbita, Orbit ubica todo desde su universo; --S solo escala texto e íconos.
  const fit = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    const S = Math.max(240, Math.min(width, height));
    body.style.setProperty('--S', `${S}px`);
    // Capas: 7 sistemas crecen hasta 1,96× el disco de 240 px, con zoom 1,1×.
    body.style.setProperty('--fit', String(Math.min(1, Math.min(width, height) / (240 * 1.96 * 1.1))));
  });
  fit.observe(body);
  ctx.onCleanup(() => fit.disconnect());

  // Paralaje en la órbita y en capas (±7° por defecto, tune.tilt), como en el
  // objeto de cada sistema (no en el celular).
  const tilt = (rx: number, ry: number) => {
    const obj = body.querySelector<HTMLElement>('.stage .obj');
    if (!obj) return;
    obj.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    obj.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  };
  body.addEventListener('pointermove', (e) => {
    if (boardMode === 'grilla' || PHONE || e.pointerType === 'touch') return;
    const b = body.getBoundingClientRect();
    tilt(-((e.clientY - b.top) / b.height - 0.5) * 2 * tune.tilt, ((e.clientX - b.left) / b.width - 0.5) * 2 * tune.tilt);
  });
  body.addEventListener('pointerleave', () => tilt(0, 0));

  const build = () => {
    built = boardMode;
    layers = new Map();
    board.className = `board mode-${boardMode}`;
    drawn.delete(body);
    if (boardMode === 'orbita') {
      // Toda la órbita es un sistema de Orbit: el universo es el espacio que queda,
      // el pulso es el satélite del centro y los sistemas, satélites de orbit-10
      // (tune.orbit).
      // En 3D, como el objeto de cada sistema: el pulso adelante y los sistemas
      // un paso atrás (capas de Orbit); el puntero inclina el conjunto.
      body.innerHTML = `<div class="stage orbit-stage"><div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective">
        <div class="orbit-0 hub-orbit layer-front"><div class="satellite at-center"><div class="capsule">
          <div class="hub"><div class="hub-ring-slot"></div>
            <div class="hub-face" aria-live="polite"><div class="hub-slide"></div></div><nav class="hub-dots" aria-label="Avisos"></nav></div>
        </div></div></div>
        <div class="orbit-${tune.orbit} orbit-tiles" data-depth="1"></div></div></div></div></div>`;
    } else if (boardMode === 'capas') {
      // En 3D, como la órbita: cada capa un paso más atrás y el puntero inclina el objeto.
      body.innerHTML = `<div class="stage board-stage" data-zoom="calm"><div class="obj"><div class="bigbang">
        <div class="gravity-spot depth outer-perspective" style="--o-depth-grow:${tune.layerGrow}"></div></div></div></div>`;
    } else body.innerHTML = '';
  };

  const paintLayers = (ids: string[]) => {
    const depth = body.querySelector<HTMLElement>('.depth')!;
    for (const [id, layer] of layers) if (!ids.includes(id)) { layer.remove(); layers.delete(id); }
    ids.forEach((id, i) => {
      let layer = layers.get(id);
      if (!layer) {
        layer = document.createElement('div');
        layer.className = 'gravity-spot layer';
        depth.append(layer);
        layers.set(id, layer);
      }
      const f = front(id), grow = 1 + tune.layerGrow * i, level = worst(id);
      // Orbit redibuja los arcos ante cualquier cambio de atributo, aunque sea el
      // mismo valor: solo se escribe lo que cambió.
      if (layer.dataset.depth !== String(i)) layer.dataset.depth = String(i);
      if (layer.dataset.level !== String(level)) layer.dataset.level = String(level);
      if (layer.classList.contains('layer-front') !== (i === 0)) layer.classList.toggle('layer-front', i === 0);
      if (layer.classList.contains('is-alert') !== level > 0) layer.classList.toggle('is-alert', level > 0);
      const stroke = i === 0 ? 6 : 2.5;
      setHTML(layer, ring(f.key, f.r, stroke / grow / 10, false, !level) + (i === 0
        ? `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
             <div class="capsule disc zoom-me" role="button" tabindex="0" data-to="sys-${id}" data-system="${id}"
               aria-label="Abrir ${SYS[id].title}">
               ${icon(f.ch.glyph)}<span class="face-name">${SYS[id].title}</span>
               <span class="face-big">${esc(f.big)}</span><span class="face-label">${esc(f.a ? f.a.why : `${f.ch.name.toLowerCase()} · ${f.label}`)}</span>
             </div></div></div>`
        : `<div class="orbit-11" style="--o-from:${LABEL_AT[(i - 1) % LABEL_AT.length]}deg">
             <o-arc range="auto" class="arc-label" style="font-size:${(11 / grow).toFixed(2)}px">${esc(`${SYS[id].title} · ${f.big}`)}</o-arc></div>
           <div class="orbit-12" style="--o-size-ratio:${(stroke / grow / 10).toFixed(3)}">
             <o-arc interactive hit-width="${(8 / grow).toFixed(1)}" data-bpick="${id}" class="ring-hit"
               role="button" tabindex="0" aria-label="Traer ${SYS[id].title} al frente"></o-arc></div>`));
    });
    const stage = body.querySelector<HTMLElement>('.board-stage')!;
    const zoom = ids.some((id) => worst(id)) ? 'alert' : 'calm';
    if (stage.dataset.zoom !== zoom) stage.dataset.zoom = zoom;
  };

  const paint = () => {
    if (built !== boardMode) build();
    el.querySelector('h1')!.textContent = headline();
    el.querySelector('.conn-slot')!.innerHTML = status();
    for (const b of el.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === boardMode));
    const err = el.querySelector<HTMLElement>('.error')!;
    err.hidden = ha.status !== 'error';
    err.textContent = ha.error;
    const ready = ha.status === 'live' || ha.states.size > 0;
    const ids = ready ? boardOrder() : [];
    if (boardMode === 'grilla') setHTML(body, `<div class="tiles">${IDS.filter((id) => ids.includes(id)).map(mini).join('')}</div>`);
    else if (boardMode === 'orbita') {
      // Los sistemas quedan en su lugar de siempre: en la órbita lo que se mueve es el color, no el orden.
      // Cada parte se reemplaza por separado: el carrusel no redibuja los anillos.
      const fixed = IDS.filter((id) => ids.includes(id));
      const hubEl = body.querySelector<HTMLElement>('.hub')!;
      if (hubEl.hidden !== !ready) hubEl.hidden = !ready;
      setHTML(body.querySelector<HTMLElement>('.hub-ring-slot')!, ready ? hubRing(fixed) : '');
      const tilesEl = body.querySelector<HTMLElement>('.orbit-tiles')!;
      // Medio paso de corrimiento: ningún sistema justo arriba, y cada uno queda
      // frente a su segmento del anillo del centro.
      tilesEl.style.setProperty('--o-from', `${180 / Math.max(1, fixed.length)}deg`);
      setHTML(tilesEl, fixed.map(orbitTile).join(''));
      if (ready) paintSlide();
      if (log[0] !== beat) { hubEl.classList.remove('beat'); void hubEl.offsetWidth; hubEl.classList.add('beat'); }
    } else if (ready) paintLayers(ids);
    beat = log[0];
    // En la órbita los últimos cambios ya están en el centro.
    el.querySelector('.ticker')!.innerHTML = boardMode === 'orbita' ? '' : log.slice(0, PHONE ? 3 : 4).map((l) =>
      `<li class="${l.level ? `level-${l.level}` : ''}"><time>${time(l.at)}</time> ${esc(l.text)}</li>`).join('');
  };

  const paintSlide = () => {
    const list = hubSlides();
    const at = Math.max(0, list.findIndex((x) => x.key === slideKey));
    slideKey = list[at].key;
    setHTML(body.querySelector<HTMLElement>('.hub-slide')!, list[at].html);
    setHTML(body.querySelector<HTMLElement>('.hub-dots')!, list.length < 2 ? '' : list.map((x, i) =>
      `<button class="hub-dot${x.level ? ` level-${x.level}` : ' pulse'}" data-slide="${x.key}" aria-current="${i === at}"
        aria-label="${x.key === 'pulso' ? 'Pulso de la casa' : `Aviso ${i + 1} de ${list.length - 1}`}"></button>`).join(''));
  };
  // Avance solo, salvo con el puntero o el foco adentro del centro.
  let held = false;
  const advance = () => {
    if (boardMode !== 'orbita' || held || app.getCurrentViewName() !== 'tablero') return;
    const list = hubSlides();
    if (list.length < 2) return;
    slideKey = list[(list.findIndex((x) => x.key === slideKey) + 1) % list.length].key;
    paintSlide();
  };
  let timer = window.setInterval(advance, SLIDE_MS);
  ctx.onCleanup(() => clearInterval(timer));

  // El panel de ajustes (solo en desarrollo) cambia la órbita o las capas: se rearma.
  const retune = () => { built = null; paint(); };
  window.addEventListener('pulse-tune', retune);
  ctx.onCleanup(() => window.removeEventListener('pulse-tune', retune));
  const hold = (on: boolean) => (e: Event) => { if ((e.target as HTMLElement).closest?.('.hub')) held = on; };
  el.addEventListener('pointerover', hold(true));
  el.addEventListener('pointerout', hold(false));
  el.addEventListener('focusin', hold(true));
  el.addEventListener('focusout', hold(false));

  let locked = false;
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const slide = t.closest<HTMLElement>('[data-slide]')?.dataset.slide;
    const open = t.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (slide) {
      slideKey = slide;
      clearInterval(timer);
      timer = window.setInterval(advance, SLIDE_MS);
      paintSlide();
      return;
    }
    if (open) {
      const tile = body.querySelector<HTMLElement>(`.otile[data-system="${open}"]`);
      if (tile) void app.zoomIn(tile);
      return;
    }
    const mode = t.closest<HTMLElement>('[data-mode]')?.dataset.mode as BoardMode | undefined;
    const pick = t.closest<HTMLElement>('[data-bpick]')?.dataset.bpick;
    if (mode && mode !== boardMode) {
      boardMode = mode;
      try { localStorage.setItem('pulse-ha-board', mode); } catch { /* solo para recordar la vista */ }
      paint();
    } else if (pick && !locked) {
      boardPick = pick;
      locked = true;
      setTimeout(() => { locked = false; }, LOCK_MS);
      paint();
    }
  });
  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('o-arc[data-bpick]')) { e.preventDefault(); t.click(); }
  });

  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
}

// ─── Sistema: objeto radial en capas ────────────────────────────────

function sistema(ctx: ViewContext, id: string) {
  ctx.target.dataset.title = SYS[id].title;
  const sys = SYS[id];
  const el = ctx.target;
  let flat = true, locked = false, dragging = false;

  el.innerHTML = `<div class="system">
    <p class="eyebrow sys-title">${sys.title}</p>
    <div class="stage" data-zoom="calm">
      <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective is-flat"
        style="--o-depth-grow:${GROW}"></div></div></div>
    </div>
    <div class="strip" aria-live="polite"></div>
    ${PHONE ? `<nav class="dots" aria-label="Sistemas"></nav>` : ''}
    <div class="controls"><button class="plain" data-act="view">Ver en 3D</button></div>
  </div>`;
  const stage = el.querySelector<HTMLElement>('.stage')!;
  const obj = el.querySelector<HTMLElement>('.obj')!;
  const depth = el.querySelector<HTMLElement>('.depth')!;
  const strip = el.querySelector<HTMLElement>('.strip')!;
  // El objeto se achica si no entra: el disco de adelante, con el zoom de aviso
  // (1,7 × 240 px), tiene que caber en el escenario.
  const fit = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    stage.style.setProperty('--fit', String(Math.min(1, Math.min(width, height) / (240 * 1.7))));
  });
  fit.observe(stage);
  ctx.onCleanup(() => fit.disconnect());
  const dots = el.querySelector<HTMLElement>('.dots');

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
    if (dragging) return;              // repintar cortaría el arrastre del dial
    const ord = order(id), u = ui[id], map = readings[id];
    // Solo se repinta si cambió algo de este sistema.
    const now = JSON.stringify([ord, ord.map((k) => [map.get(k)!.r, isPending(map.get(k)!.r)]), [...u.seen], flat, toast,
      PHONE ? IDS.map((o) => [order(o)[0], worst(o)]) : 0]);
    if (now === last) return;
    last = now;
    // El foco vuelve al mismo control después de repintar.
    const focus = document.activeElement as HTMLElement | null;
    const focusSel = focus && el.contains(focus) ? focusKey(focus) : null;

    const alert = live(id).length > 0;
    if (alert) flat = false;
    stage.dataset.zoom = alert ? 'alert' : 'calm';
    stage.classList.toggle('is-3d', !flat);
    depth.classList.toggle('is-flat', flat);
    el.querySelector<HTMLElement>('[data-act="view"]')!.textContent = flat ? 'Ver en 3D' : 'Ver plano';

    for (const [key, layer] of layers) if (!map.has(key)) { layer.remove(); layers.delete(key); }
    const waiting = live(id).filter((k) => k !== ord[0]);
    ord.forEach((key, i) => {
      const layer = layerOf(key), { ch, r } = map.get(key)!;
      const seen = u.seen.has(key);
      const d = Math.min(i, SIZE.length - 1);
      layer.hidden = i >= SIZE.length;
      layer.dataset.depth = String(d);
      layer.classList.toggle('layer-front', i === 0);
      layer.classList.toggle('is-alert', !!r.alert);
      layer.classList.toggle('is-seen', seen);
      layer.dataset.level = String(r.alert?.level ?? 0);
      const grow = SIZE[d];
      const shown = r.alert && !seen ? r.alert : r;
      // Regla 3: los avisos que esperan orbitan el anillo de adelante con su ícono.
      const sats = i === 0 ? waiting.map((k, j) => {
        const w = map.get(k)!;
        return `<div class="orbit-12 sat-orbit" style="--o-range:0deg; --o-from:${(45 + j * 32)}deg">
          <div class="satellite sat level-${w.r.alert!.level}" data-pick="${k}" role="button" tabindex="0"
            aria-label="Aviso en ${w.ch.name}: ${esc(w.r.alert!.why)}" style="--o-size-ratio:3">${icon(w.ch.glyph, 14)}</div></div>`;
      }).join('') : '';
      layer.innerHTML = ring(key, r, STROKE[d] / grow / 10, i === 0, false, i === 0 && !!r.alert && !seen) + sats + (i === 0
        ? `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
             <div class="capsule disc zoom-me" role="button" tabindex="0" data-to="detalle"
               data-system="${id}" data-channel="${key}" aria-label="Detalle de ${ch.name}">
               ${icon(ch.glyph)}<span class="face-name">${ch.name}</span>
               <span class="face-big">${esc(shown.big)}</span><span class="face-label">${esc(shown.label)}</span>
               ${isPending(r) ? '<span class="face-wait">enviando…</span>' : ''}</div></div></div>`
        : `<div class="orbit-11" style="--o-from:${i === 1 ? 300 : 30}deg">
             <o-arc range="auto" class="arc-label" style="font-size:${(11 / grow).toFixed(2)}px">${esc(`${ch.name} · ${shown.big}`)}</o-arc></div>
           <div class="orbit-12" style="--o-size-ratio:${(STROKE[d] / grow / 10).toFixed(3)}">
             <o-arc interactive hit-width="${(12 / grow).toFixed(1)}" data-pick="${key}" class="ring-hit"
               role="button" tabindex="0" aria-label="Traer ${ch.name} al frente"></o-arc></div>`);
    });

    const front = map.get(ord[0]);
    if (!front) { strip.textContent = 'Sin entidades para este sistema.'; return; }
    const extra = ord.length - SIZE.length;
    const fa = front.r.alert && !u.seen.has(ord[0]) ? front.r.alert : null;
    const how = front.r.dial ? 'Arrastrá el anillo · tocá el centro para ver más'
      : front.r.segs?.some((s) => s.act) ? 'Tocá cada segmento para cambiarlo' : '';
    if (dots) {
      dots.innerHTML = IDS.map((other) => {
        const k = order(other)[0], level = worst(other);
        if (!k) return '';
        return `<button class="dot${level ? ` has-alert level-${level}` : ''}" data-go="${other}"
          aria-label="${SYS[other].title}"${other === id ? ' aria-current="true"' : ''}>
          <span class="bigbang"><span class="gravity-spot">${ring(k, readings[other].get(k)!.r, 2.5 / (22 / 24))}</span></span></button>`;
      }).join('');
    }
    strip.innerHTML = toast ? `<span class="error">${esc(toast)}</span>`
      : fa ? `<strong>${front.ch.name}:</strong> ${esc(fa.why)}.
          ${fa.busy ? '<span class="face-wait">en curso…</span>' : `<button class="primary" data-resolve="${ord[0]}">${esc(fa.verb)}</button>
          ${fa.calls.length ? `<button class="plain" data-seen="${ord[0]}">Silenciar</button>` : ''}`}
          ${waiting.length ? `<span class="how">${waiting.length} aviso${waiting.length > 1 ? 's' : ''} más esperando</span>` : ''}`
      : `<strong>${sys.title}</strong> · adelante ${front.ch.name}${extra > 0 ? ` · +${extra} al fondo` : ''}${
        how ? `<span class="how">${how}</span>` : ''}`;

    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  };

  const focusKey = (t: HTMLElement) => {
    const layer = t.closest<HTMLElement>('.layer')?.dataset.ch;
    for (const a of ['data-seg', 'data-dial', 'data-pick', 'data-resolve', 'data-act']) {
      const v = t.getAttribute(a);
      if (v !== null) return `${a === 'data-seg' && layer ? `.layer[data-ch="${layer}"] ` : ''}[${a}="${v}"]`;
    }
    return null;
  };

  // ─── Controles directos ───
  const dialOf = (key: string) => readings[id].get(key)!.r.dial!;
  const snap = (key: string, v: number) => {
    const dial = dialOf(key);
    const raw = dial.min + Math.min(1, Math.max(0, v)) * (dial.max - dial.min);
    return Math.round(raw / dial.step) * dial.step;
  };
  // El dial se mueve en el lugar; la orden sale al soltar (o tras una pausa del teclado).
  const setDial = (key: string, t: number, until = Infinity) => {
    const dial = dialOf(key);
    t = Math.min(dial.max, Math.max(dial.min, t));
    hold.set(dial.entity, { value: t, until });
    const v = (t - dial.min) / (dial.max - dial.min);
    const layer = layers.get(key)!;
    const ringEl = layer.querySelector<HTMLElement>('[data-dial]');
    ringEl?.setAttribute('value', (v * 100).toFixed(1));
    ringEl?.setAttribute('aria-valuenow', String(t));
    ringEl?.setAttribute('aria-valuetext', `${num(t)}${dial.unit}`);
    const label = layer.querySelector('.face-label');
    if (label) label.textContent = `${dial.label} ${num(t)}${dial.unit}`;
    return t;
  };
  const commit = (key: string) => {
    const dial = dialOf(key), h = hold.get(dial.entity);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    void send([dial.set(h.value)]);
  };
  let keyTimer = 0;
  const commitSoon = (key: string) => {
    clearTimeout(keyTimer);
    keyTimer = window.setTimeout(() => commit(key), 500);
  };

  let drag: { key: string; last: number } | null = null;
  let swallowUntil = 0;
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
    if (drag.last > 0.75 && v < 0.25) v = 1;
    else if (drag.last < 0.25 && v > 0.75) v = 0;
    drag.last = v;
    setDial(drag.key, snap(drag.key, v));
  };

  el.addEventListener('pointerdown', (e) => {
    const ringEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ringEl || locked) return;
    e.preventDefault();
    ringEl.setPointerCapture(e.pointerId);
    ringEl.focus({ preventScroll: true });
    const key = ringEl.dataset.dial!, dial = dialOf(key);
    drag = { key, last: (dial.value - dial.min) / (dial.max - dial.min) };
    dragging = true;
    swallowUntil = Infinity;
    dragTo(e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => { if (drag) dragTo(e.clientX, e.clientY); });
  const endDrag = () => {
    if (!drag) return;
    const key = drag.key;
    drag = null;
    dragging = false;
    swallowUntil = performance.now() + 400;
    commit(key);
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  const swallow = (e: Event) => { if (performance.now() < swallowUntil) e.stopPropagation(); };
  for (const type of ['mouseup', 'touchend', 'click']) window.addEventListener(type, swallow, true);
  ctx.onCleanup(() => {
    for (const type of ['mouseup', 'touchend', 'click']) window.removeEventListener(type, swallow, true);
  });

  el.addEventListener('wheel', (e) => {
    const ringEl = (e.target as HTMLElement).closest<HTMLElement>('[data-dial]');
    if (!ringEl) return;
    e.preventDefault();
    e.stopPropagation();
    const key = ringEl.dataset.dial!, dial = dialOf(key);
    const cur = hold.get(dial.entity)?.value ?? dial.value;
    setDial(key, cur + (e.deltaY < 0 ? dial.step : -dial.step));
    commitSoon(key);
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
    const seenKey = t.closest<HTMLElement>('[data-seen]')?.dataset.seen;
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
    if (go) { goSystem(go); return; }
    const seg = t.closest<HTMLElement>('[data-seg]');
    if (seg && !locked) {
      const key = seg.closest<HTMLElement>('.layer')!.dataset.ch!;
      const s = readings[id].get(key)!.r.segs![Number(seg.dataset.seg)];
      if (s.act && !pending.has(s.entity)) void send([s.act]);
      return;
    }
    if (pick && !locked) { ui[id].pick = pick; lock(); }
    else if (resolve) {
      const a = readings[id].get(resolve)?.r.alert;
      if (!a) return;
      if (a.calls.length) void send(a.calls);
      else ui[id].seen.add(resolve);
      lock();
    } else if (seenKey) { ui[id].seen.add(seenKey); lock(); }
    else if (act === 'view') flat = !flat;
    else return;
    repaint();
  });

  el.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.matches('o-arc[data-pick], o-arc[data-seg], .sat[data-pick]')) {
      e.preventDefault();
      t.click();
      return;
    }
    if (!t.matches('[data-dial]')) return;
    const key = t.dataset.dial!, dial = dialOf(key);
    const cur = hold.get(dial.entity)?.value ?? dial.value, s = dial.step;
    const next: Record<string, number> = {
      ArrowRight: cur + s, ArrowUp: cur + s, ArrowLeft: cur - s, ArrowDown: cur - s,
      PageUp: cur + s * 4, PageDown: cur - s * 4, Home: dial.min, End: dial.max,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    setDial(key, next[e.key]);
    commitSoon(key);
  });

  // ─── Celular: de un sistema al otro ───
  const goSystem = (other: string) => {
    if (other !== id) void app.goTo(`sys-${other}`, { mode: 'lateral' });
  };
  // Deslizar a los costados pasa al sistema vecino: lo hace Zumly
  // (lateralNav.swipe) entre las vistas hermanas sys-*. Empezar en el dial es
  // arrastrarlo, no deslizar (Zumly ignora los gestos que nacen en un slider), y
  // pellizcar vuelve al tablero (inputs.pinch). El navegador deja el gesto
  // horizontal a la página (si no, lo cancela como scroll).
  if (PHONE) el.style.touchAction = 'pan-y';

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

const stateWords: Record<string, string> = {
  on: 'encendido', off: 'apagado', open: 'abierta', closed: 'cerrada', opening: 'abriendo', closing: 'cerrando',
  locked: 'con llave', unlocked: 'sin llave', jammed: 'trabada', playing: 'sonando', paused: 'en pausa',
  cleaning: 'limpiando', docked: 'en la base', returning: 'volviendo', disarmed: 'desarmada', armed_home: 'en casa',
  armed_away: 'fuera', arming: 'armando', triggered: 'disparada', unavailable: 'sin conexión',
};
function stateText(e: HassState) {
  const u = e.attributes.unit_of_measurement;
  return `${stateWords[e.state] ?? e.state}${u ? ` ${String(u)}` : ''}`;
}

function detalle(ctx: ViewContext) {
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const el = ctx.target;
  el.dataset.title = readings[id]?.get(key)?.ch.name ?? key;
  let last = '';
  const paint = () => {
    const item = readings[id]?.get(key);
    if (!item) return;
    const { ch, r } = item;
    const now = JSON.stringify([r, [...pending.keys()], toast]);
    if (now === last) return;
    last = now;
    if (el.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input[type="range"]')) return;
    const a = r.alert && !ui[id].seen.has(key) ? r.alert : null;
    let control = '';
    if (r.dial) {
      control = `<label class="slider">${r.dial.label[0].toUpperCase()}${r.dial.label.slice(1)} · <output>${num(r.dial.value)}${r.dial.unit}</output>
        <input type="range" min="${r.dial.min}" max="${r.dial.max}" step="${r.dial.step}" value="${r.dial.value}"></label>`;
    } else if (r.segs) {
      control = `<ul class="switches">${r.segs.map((s, i) => `<li><label class="${pending.has(s.entity) ? 'is-pending' : ''}${
        r.alert?.fail?.includes(i) ? ` fail level-${r.alert.level}` : ''}">
        <input type="checkbox" data-seg="${i}"${s.on ? ' checked' : ''}${s.act ? '' : ' disabled'}> ${esc(s.label)}
        <span class="state">${esc(stateText(ha.states.get(s.entity)!))}</span></label></li>`).join('')}</ul>`;
    }
    const cam = r.camera ? String(ha.states.get(r.camera)?.attributes.entity_picture ?? '') : '';
    el.innerHTML = `<div class="detail">
      <p class="eyebrow">${SYS[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      <p class="detail-big${a ? ` level-${a.level}` : ''}">${esc(a ? a.big : r.big)}</p>
      <p class="detail-label">${esc(a ? a.label : r.label)}</p>
      ${a ? `<p class="detail-why level-${a.level}">${esc(a.why)}. ${a.busy ? '<span class="face-wait">en curso…</span>'
        : `<button class="primary" data-resolve>${esc(a.verb)}</button>`}</p>` : ''}
      ${toast ? `<p class="error">${esc(toast)}</p>` : ''}
      ${cam ? `<img class="camera" alt="Cámara del patio" src="${esc(cam)}&t=${Date.now() >> 13}">` : ''}
      ${control}
      <details class="entities"><summary>Entidades en Home Assistant</summary><ul>${r.entities.map((e) => {
        const s = ha.states.get(e);
        return s ? `<li><code>${e}</code> <span>${esc(nameOf(ha.states, e))}</span> <strong>${esc(stateText(s))}</strong></li>` : '';
      }).join('')}</ul></details>
    </div>`;
  };
  paint();
  rerender.add(paint);
  ctx.onCleanup(() => { rerender.delete(paint); });
  el.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type === 'range' && r.dial) {
      hold.set(r.dial.entity, { value: Number(input.value), until: Infinity });
      el.querySelector('output')!.textContent = `${num(Number(input.value))}${r.dial.unit}`;
    }
  });
  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, r = readings[id].get(key)!.r;
    if (input.type === 'range' && r.dial) {
      hold.set(r.dial.entity, { value: Number(input.value), until: Date.now() + PENDING_MS });
      void send([r.dial.set(Number(input.value))]);
      input.blur();
    } else if (input.dataset.seg !== undefined) {
      const s = r.segs![Number(input.dataset.seg)];
      if (s.act) void send([s.act]);
    }
  });
  el.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-resolve]')) return;
    const a = readings[id].get(key)?.r.alert;
    if (!a) return;
    if (a.calls.length) void send(a.calls);
    else { ui[id].seen.add(key); repaint(); }
  });
}

// ─── Arranque ───────────────────────────────────────────────────────

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
    effects: ['blur(3px) brightness(.45)', 'blur(8px) brightness(.25)'],
    // El desenfoque se aplica de una vez en lugar de animarse: el zoom va más fluido.
    animateEffects: false,
    hideTrigger: 'fade',
  },
  // Volver: el botón dice a dónde (depthNav 'title'); la rueda, el deslizamiento
  // y el pellizco mueven la vista mientras dura el gesto (gestures.follow).
  depthNav: { style: 'title' },
  inputs: { pinch: true },
  gestures: { follow: true },
  // En el celular, deslizar a los costados pasa entre los sistemas (vistas
  // hermanas). Sin barra de Zumly: los puntos de mini anillos son de la vista.
  lateralNav: PHONE ? { swipe: true, mode: 'auto', arrows: false, dots: false } : false,
});
app.on('afterZoomOut', () => repaint());

// Entidades que algún canal muestra: solo esas entran en el registro de cambios.
const watched = () => new Set(IDS.flatMap((id) => [...readings[id].values()].flatMap((x) => x.r.entities)));
let loaded = false;

ha.onStatus(() => repaint());
ha.onChange((changed) => {
  for (const s of changed) { pending.delete(s.entity_id); const h = hold.get(s.entity_id); if (h && h.until !== Infinity) hold.delete(s.entity_id); }
  const fresh = compute();
  if (fresh.length) boardPick = null;
  if (loaded) {
    const w = watched();
    for (const s of changed) {
      if (!w.has(s.entity_id) || s.last_changed !== s.last_updated) continue;
      log.unshift({ at: new Date(), text: `${nameOf(ha.states, s.entity_id)} → ${stateText(s)}`, level: 0, entity: s.entity_id });
    }
    for (const f of fresh) log.unshift({ at: new Date(), text: `${SYS[f.id].title}: ${f.a.why}`, level: f.a.level });
    log.splice(12);
  }
  rerender.forEach((fn) => fn());
  // Un aviso grave nuevo abre su sistema solo, desde su tarjeta (no desde el centro).
  const grave = loaded && fresh.find((f) => f.a.level === 2);
  if (grave && app.getCurrentViewName() === 'tablero') {
    const tile = document.querySelector<HTMLElement>(`.is-current-view .zoom-me[data-system="${grave.id}"]`);
    if (tile) void app.zoomIn(tile);
  }
  if (!loaded && ha.status === 'live') { loaded = true; void start(); }
});

await app.init();
mountTunePanel();
void ha.connect();

// En el celular se arranca adentro del sistema que más llama.
async function start() {
  if (!PHONE) return;
  const first = [...IDS].sort((a, b) => worst(b) - worst(a))[0];
  const tile = document.querySelector<HTMLElement>(`.zoom-me[data-system="${first}"]`);
  if (tile) {
    tile.dataset.withDuration = '1ms';
    await app.zoomIn(tile);
    delete tile.dataset.withDuration;
  }
}
Object.assign(window, { pulseHA: { app, ha, ui, readings: () => readings } });
