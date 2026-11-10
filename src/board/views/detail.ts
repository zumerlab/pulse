// A channel's detail, one level deeper than its face, only when it adds
// something the face does not have (see detailAdds): the dial big with a
// light's color inside it, a day as rings, a picture, a month, a long list,
// and the things behind the reading.

import type { ViewContext } from 'zumly';
import { localeOf, num } from '../../i18n.ts';
import { spansOf } from '../../history.ts';
import {
  MAP_ZOOM_MAX, MAP_ZOOM_MIN, MAX_TRACKS, colorArcs, panCenter, dialControls, esc, globe, hsCss, icon, mapControls, mapDetail, monthRing, radar,
  ringCenter, satColor, scrollControls, scrollList, scrollTo, timeRing, timeWindow, timeline, turnMap, videoMarkup, type MapSpec,
} from '../../radial/index.ts';
import type { Seg } from '../../model.ts';
import type { Board } from '../context.ts';
import { dialBinding } from '../dials.ts';
import { activeElement, imageOf, ring, scrollState, setHTML } from '../draw.ts';
import { look } from '../settings.ts';
import { PENDING_MS, failuresOf, openObject, repaint, retry, retryCard, send, uiOf, whenCurrent, zoomOutWhenCurrent } from '../state.ts';
import { MONTH_MS, ROLLING_DAYS, loadMonth, monthKey } from '../time.ts';

// The detail's ring: about 11 px of stroke on its 260 px universe.
const DETAIL_LANES = 1;
// A day of a thing (or of a set of things) is asked once per visit, and again after this long.
const HISTORY_MS = 5 * 60_000;
// The detail's map: 176 px of the map from its center to its edge, about a tile's pixel to a screen's.
const MAP_RADIUS = 176;

export function detailView(b: Board, ctx: ViewContext) {
  const { t, hold } = b;
  const id = String(ctx.props.system), key = String(ctx.props.channel);
  const el = ctx.target;
  el.dataset.title = b.readings[id]?.get(key)?.ch.name ?? key;
  let last = '';
  let square = false, live = false, dragging = false;
  // The map stays the same element across paints (only its tiles and dots
  // move, `turnMap`), at the reading's zoom and center until the viewer
  // chooses others (a zoom, a drag); the way back to the center is a button.
  let mapEl: HTMLElement | null = null, mapZoom: number | null = null, mapCenter: { lat: number; lon: number } | null = null;
  const mapAt = (m: MapSpec) => ({ radius: MAP_RADIUS, zoom: mapZoom ?? m.zoom, center: mapCenter ?? undefined });
  // What the detail shows can go while it is open (the last notice, dismissed
  // from its row): the detail then closes, back to the object.
  let gone = false;
  const leave = () => {
    if (gone || !el.closest('.is-current-view, .is-new-current-view')) return;
    gone = true;
    zoomOutWhenCurrent(b, el);
  };
  ctx.onActivate(() => { if (!b.readings[id]?.get(key)) leave(); });
  const paint = () => {
    if (dragging) return;              // repainting would cut the drag
    const { host } = b;
    const item = b.readings[id]?.get(key);
    if (!item) { leave(); return; }
    gone = false;
    const { ch, r } = item;
    const history = r.history ? b.histories.get(r.history) : undefined;
    const trackIds = r.tracks?.length && host.changes ? r.tracks.map((x) => x.id).join(' ') : '';
    const changes = trackIds ? b.dayChanges.get(trackIds) : undefined;
    const monthOf = r.month ? b.months.get(monthKey(b, r.month)) : undefined;
    const now = JSON.stringify([r, [...b.pending.keys()], [...b.failed.keys()], b.toast, square, live, history?.values?.length ?? history?.error,
      changes?.at ?? changes?.error, monthOf?.at, host.changedAt?.(r.events?.[0]?.id ?? ''), look(b)]);
    if (now === last) return;
    last = now;
    // Focus returns to the same control after repainting.
    const focus = activeElement(b);
    const focusSel = focus && el.contains(focus) && focus.matches('[data-dial]')
      ? `[data-dial="${focus.dataset.dial}"]${focus.dataset.handle ? `[data-handle="${focus.dataset.handle}"]` : ''}`
      : focus && el.contains(focus) && focus.matches('.scroll-list') ? '.scroll-list' : null;
    const a = r.alert && !uiOf(b, id).seen.has(key) ? r.alert : null;
    // The dial, big, operated like the system's front ring (a knob at each
    // end of a range), what is now in its center; a light's hue and
    // saturation as curved sliders inside it, the center washed with the color.
    let control = '';
    if (r.dial) {
      const color = r.color?.hs ? hsCss(r.color.hs[0], r.color.hs[1]) : undefined;
      const value = r.range ? `${num(r.range.lo)}–${num(r.range.hi)}${r.dial.unit}` : `${num(r.dial.value)}${r.dial.unit}`;
      control = `<div class="bigbang detail-ring"><div class="gravity-spot">${ring(b, key, r, DETAIL_LANES, true, false, false, ch.name)}${
        r.color ? colorArcs(key, r.color.hs, { open: look(b).dial === 'open', name: ch.name }) : ''}${
        ringCenter(value, r.dial.label, r.color ? 13 : 18, color)}</div></div>`;
    } else if (r.list) {
      // A long list: its rows scrolled in the disc; a choice opens at the one that is on.
      const sk = `${id}/${key}`, st = scrollState(b, sk), choice = r.kind === 'c', on = choice ? r.list.findIndex((x) => x.on) : -1;
      if (!b.scrollOpened.has(sk) && on >= 0) { st.focus = on; st.offset = scrollTo(on, r.list.length, true); b.scrollOpened.add(sk); }
      // The rows that call: their own level, or, when the list is the ring's segments, the ones the alert paints.
      const segs = r.segs, fails = r.alert?.fail && segs && segs.length === r.list.length && r.list.every((x, i) => x.id === segs[i].id) ? new Set(r.alert.fail) : null;
      // A row is its name and a line under it: its `detail`, or what its label says after the first " · ".
      const rowOf = (x: Seg) => { if (x.detail) return [x.label, x.detail]; const cut = x.label.indexOf(' · '); return cut > 0 ? [x.label.slice(0, cut), x.label.slice(cut + 3)] : [x.label, '']; };
      control = scrollList(r.list.map((x, i) => { const [label, detail] = rowOf(x); return { label, detail, on: x.on, act: !!(x.act || x.to), level: x.level ?? (fails?.has(i) ? r.alert!.level : undefined) }; }),
        st, { key: sk, name: r.name ?? ch.name, rows: true, choice, pending: r.ids.some((e) => b.pending.has(e)) });
    } else if (r.segs) {
      // Switches, or the options of a choice (radios: the one that is on has no action).
      // A thing that is only read (a sensor, a battery) is not a control: a row with a
      // dot, lit while it is on, in the alert's color when it is what fails, and how it is.
      const type = r.kind === 'c' ? 'radio' : 'checkbox';
      control = `<ul class="switches${r.kind === 'c' ? ' choice' : ''}">${r.segs.map((s, i) => {
        const fail = r.alert?.fail?.includes(i) ? ` fail level-${r.alert.level}` : '';
        const state = `<span class="state">${esc(r.kind === 'c' ? '' : host.stateOf(s.id))}</span>`;
        return r.kind !== 'c' && !s.act
          ? `<li><span class="switch-row is-read${s.on ? ' is-on' : ''}${fail}" data-row="${i}"><span class="seg-dot"></span><span class="switch-name">${esc(s.label)}</span>${state}</span></li>`
          : `<li><label class="switch-row${b.pending.has(s.id) ? ' is-pending' : ''}${fail}" data-row="${i}">
        <input type="${type}" name="seg" data-seg="${i}"${s.on ? ' checked' : ''}${s.act ? '' : ' disabled'}> <span class="switch-name">${esc(s.label)}</span>
        ${state}</label></li>`;
      }).join('')}</ul>`;
    }
    // The picture, round like the face or square on request; a live one can stream.
    let figure = '';
    if (r.image) {
      const stream = r.image.live ? host.stream?.(r.image.id) : undefined;
      const img = imageOf(b, r)!;
      figure = `<figure class="detail-image${square ? ' is-square' : ''}">
        ${img.video ? videoMarkup({ src: img.video, poster: img.src, alt: img.alt, cls: 'detail-video' })
          : `<img src="${esc(live && stream ? stream : img.src)}" alt="${esc(img.alt)}"${img.key && !live ? ` data-image="${esc(img.key)}"` : ''}>`}
        <figcaption><button class="plain" data-shape>${square ? t.showRound : t.showSquare}</button>
          ${stream ? `<button class="plain" data-live aria-pressed="${live}">${live ? t.snapshot : t.live}</button>` : ''}</figcaption></figure>`;
    } else if (r.map) figure = mapEl ? '<figure class="detail-map" data-own="map"></figure>' : mapDetail(r.map, ch.name, mapAt(r.map));
    // The globe or the radar of the face, big: where the things of the list are.
    else if (r.globe && (r.globe.plots.length || r.globe.center)) figure = `<figure class="detail-globe">${globe(r.globe, ch.name)}</figure>`;
    else if (r.plots?.length) figure = `<figure class="detail-globe">${radar(r.plots, ch.name, r.radar)}</figure>`;
    if (!r.map || r.image) mapEl = null;
    const link = r.link ? `<p class="detail-link"><button class="plain" data-link>${esc(r.link.label)} ↗</button></p>` : '';
    // The last 24 hours: a ring per thing (what was on, when), with what is
    // now in the center, or a numeric thing's values as one ring.
    let day = '';
    let rings = false;
    if (trackIds) {
      if (!changes || (Date.now() - changes.at > HISTORY_MS && changes.changes)) void loadChanges(trackIds, r.tracks!.map((x) => x.id));
      rings = !!changes?.changes;
      const list = changes?.changes;
      day = `<div class="history">${list ? timeline({
        hours: 24,
        tracks: r.tracks!.map((x) => ({ key: x.id, name: host.nameOf(x.id), spans: spansOf(list[x.id] ?? [], x.on),
          on: x.now, tone: x.tone, act: !!x.act, pending: b.pending.has(x.id), failed: b.failed.has(x.id) })),
        events: (r.events ?? []).map((ev) => ({ ago: (Date.now() - (host.changedAt?.(ev.id) ?? NaN)) / 3_600_000, text: ev.text, tone: ev.tone }))
          .filter((ev) => Number.isFinite(ev.ago)),
        big: a ? a.big : r.big, label: a ? a.label : r.label, marks: true, names: true, aria: t.dayOf(ch.name),
      }) : `<p class="hint">${changes?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    } else if (r.history && host.history) {
      if (!history || (Date.now() - history.at > HISTORY_MS && history.values)) void loadHistory(r.history);
      const u = host.unitOf?.(r.history) ?? '';
      day = `<div class="history">${history?.values ? timeRing({ values: history.values, label: t.last24h, unit: u === '%' || !u ? u : ` ${u}`, marks: look(b).day === 'marks' })
        : `<p class="hint">${history?.error ? t.historyNone : t.historyLoading}</p>`}</div>`;
    }
    // This month, a day per sector around: a meter's calendar.
    if (r.month && host.statistics) {
      if (!monthOf || (Date.now() - monthOf.at > MONTH_MS)) void loadMonth(b, r.month);
      const nowD = new Date(), name = host.nameOf(r.month);
      if (look(b).month === 'rolling') {
        // The last 30 days, today at the top; a notch where this month began.
        const values = monthOf?.values.length === ROLLING_DAYS ? monthOf.values : Array.from({ length: ROLLING_DAYS }, () => null);
        const v = values[ROLLING_DAYS - 1], first = ROLLING_DAYS - nowD.getDate();
        const total = values.reduce<number>((x, y) => x + (y ?? 0), 0);
        day += `<div class="history">${monthOf?.error ? `<p class="hint">${t.monthNone}</p>` : `<div class="month-window">${timeWindow({ span: ROLLING_DAYS, bars: values,
          turn: first > 0 ? { at: first, label: nowD.toLocaleDateString(localeOf(), { month: 'long' }) } : undefined, aria: t.lastDaysAria(name, ROLLING_DAYS) })}
          <div class="month-window-center"><span class="time-big">${v != null ? `${num(v)} kWh` : monthOf ? '—' : esc(t.loadingMonth)}</span>
          <span class="time-range">${esc(t.lastDays(ROLLING_DAYS, `${num(total, 0)} kWh`))}</span><span class="time-label">${esc(`${t.today} · ${name}`)}</span></div></div>`}</div>`;
      } else {
        const days = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate(), today = nowD.getDate();
        const values = monthOf?.values.length === days ? monthOf.values : Array.from({ length: days }, () => null);
        const title = nowD.toLocaleDateString(localeOf(), { month: 'long', year: 'numeric' }), v = values[today - 1];
        day += `<div class="history">${monthOf?.error ? `<p class="hint">${t.monthNone}</p>` : monthRing({ days, today, values, unit: ' kWh', title, aria: t.monthAria(name, title),
          big: v != null ? `${num(v)} kWh` : monthOf ? '—' : t.loadingMonth, label: `${t.today} · ${name}` })}</div>`;
      }
    }
    // What is now is said once: in the center of the rings, or as the headline.
    const inRing = rings || !!r.dial;
    // Where the things are and which they are, side by side where there is room: the map (or the globe) and the list.
    const pair = !!figure && !!r.list && !r.image && !day;
    setHTML(el, `<div class="detail">
      <p class="eyebrow">${b.sys[id].title}</p>
      <h1>${icon(ch.glyph, 30)} ${ch.name}</h1>
      ${inRing ? '' : `<p class="detail-big${a ? ` level-${a.level}` : ''}">${esc(a ? a.big : r.big)}</p>
      <p class="detail-label">${esc(a ? a.label : r.label)}</p>`}
      ${a ? `<p class="detail-why level-${a.level}">${esc(a.why)}. ${a.busy ? `<span class="face-wait">${t.inProgress}</span>`
        : `<button class="primary level-${a.level}" data-resolve>${esc(a.verb)}</button>`}</p>` : ''}
      ${failuresOf(b, r).length ? `<p class="detail-fail">${retryCard(b, r)}</p>` : b.toast ? `<p class="error">${esc(b.toast)}</p>` : ''}
      ${pair ? `<div class="detail-pair">${figure}${control}</div>${link}` : `${figure}${link}
      ${day}
      ${rings && r.segs ? `<p class="hint rings-order">${t.outsideIn(r.tracks!.length > MAX_TRACKS ? MAX_TRACKS : 0)}</p>` : ''}
      ${control}`}
      ${r.ids.length ? `<details class="things"><summary>${t.things}</summary><ul>${r.ids.map((e) =>
        `<li><code>${esc(e)}</code> <span>${esc(host.nameOf(e))}</span> <strong>${esc(host.stateOf(e))}</strong></li>`).join('')}</ul></details>` : ''}
    </div>`);
    // The map that was there stays (or goes back in its place, if the layout moved it) and follows the reading.
    const slot = el.querySelector('.detail-map:not(:has(svg))');
    if (slot && mapEl) slot.replaceWith(mapEl);
    if (mapEl && r.map && mapEl.isConnected) turnMap(mapEl.querySelector('svg')!, r.map, mapAt(r.map));
    else mapEl = el.querySelector<HTMLElement>('.detail-map');
    if (focusSel) el.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
    light(lit);
  };
  // A row pointed at, or in focus from the keyboard, lights its dot on the map or the globe; the others step back.
  let lit: number | null = null;
  const light = (i: number | null) => {
    lit = i;
    const rowId = i == null ? undefined : b.readings[id]?.get(key)?.r.list?.[i]?.id;
    for (const dot of el.querySelectorAll('.detail-pair [data-plot]')) dot.classList.toggle('is-lit', !!rowId && (dot as SVGElement).dataset.plot === rowId);
  };
  // A day of rings and the rows under it are the same things in the same order:
  // a row pointed at (or in focus) lights its ring and a ring pointed at its row, the rest step back.
  const tie = (i: number | null) => {
    const tracks = el.querySelectorAll('.timeline .track'), rows = el.querySelectorAll('.switches [data-row]');
    if (!tracks.length || tracks.length > rows.length) return;
    el.querySelector('.detail')?.classList.toggle('is-pairing', i != null && i < tracks.length);
    tracks.forEach((x, k) => x.classList.toggle('is-lit', k === i));
    rows.forEach((x, k) => x.classList.toggle('is-lit', k === i && i < tracks.length));
  };
  const tieAt = (target: EventTarget | null) => {
    const x = target as HTMLElement | null, row = x?.closest?.<HTMLElement>('.switches [data-row]');
    if (row) return Number(row.dataset.row);
    const track = x?.closest?.('.timeline .track');
    return track ? [...el.querySelectorAll('.timeline .track')].indexOf(track) : null;
  };
  el.addEventListener('pointerover', (e) => { const i = tieAt(e.target); if (i != null && e.pointerType !== 'touch') tie(i); });
  el.addEventListener('pointerout', (e) => { if (tieAt(e.target) != null && tieAt(e.relatedTarget) == null) tie(null); });
  el.addEventListener('focusin', (e) => { const i = tieAt(e.target); if (i != null && (e.target as HTMLElement).matches(':focus-visible')) tie(i); });
  el.addEventListener('focusout', (e) => { if (tieAt(e.target) != null) tie(null); });
  const rowAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>('.sl-rows .scroll-item[data-opt]');
  el.addEventListener('pointerover', (e) => { const row = rowAt(e.target); if (row) light(Number(row.dataset.opt)); });
  el.addEventListener('pointerout', (e) => { if (rowAt(e.target) && !rowAt(e.relatedTarget)) light(null); });
  el.addEventListener('focusin', (e) => { if ((e.target as HTMLElement).matches?.('.scroll-list:focus-visible')) light(scrollState(b, `${id}/${key}`).focus); });
  el.addEventListener('focusout', (e) => { if ((e.target as HTMLElement).matches?.('.scroll-list')) light(null); });
  const loadChanges = (setKey: string, ids: string[]) => {
    const was = b.dayChanges.get(setKey);
    b.dayChanges.set(setKey, { at: Date.now(), changes: was?.changes ?? null });
    return b.host.changes!(ids, 24).then(
      (changes) => { b.dayChanges.set(setKey, { at: Date.now(), changes }); paint(); },
      () => { b.dayChanges.set(setKey, { at: Date.now(), changes: null, error: true }); paint(); });
  };
  const loadHistory = (thing: string) => {
    const was = b.histories.get(thing);
    b.histories.set(thing, { at: Date.now(), values: was?.values ?? null });
    return b.host.history!(thing, 24).then(
      (values) => { b.histories.set(thing, { at: Date.now(), values: values.some((v) => v != null) ? values : null, error: !values.some((v) => v != null) }); paint(); },
      () => { b.histories.set(thing, { at: Date.now(), values: null, error: true }); paint(); });
  };
  // A live picture's snapshot, refreshed like the face's.
  const refresh = window.setInterval(() => {
    const img = el.querySelector<HTMLImageElement>('.detail-image img[data-image]');
    const r = b.readings[id]?.get(key)?.r, next = r && imageOf(b, r);
    if (img && next && img.src !== next.src) img.src = next.src;
  }, 8000);
  ctx.onCleanup(() => clearInterval(refresh));
  paint();
  whenCurrent(b, ctx, paint);

  // ─── The dial and the color arcs: they move in place; the action goes out on release ───
  const d = dialBinding(b, id, () => el.querySelector<HTMLElement>('.detail-ring'), (_key, v) => {
    const big = el.querySelector('.detail-ring .ring-big');
    if (big) big.textContent = v.big;
  });
  const isHue = (k: string) => k.endsWith(':hue'), isSat = (k: string) => k.endsWith(':sat'), isColor = (k: string) => isHue(k) || isSat(k);
  const hsOf = (): [number, number] => {
    const r = b.readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
    // A white light has no hue yet: the sliders start from a full red, not from white.
    return h ? [Math.floor(h.value / 1000), h.value % 1000] : r.color!.hs ?? [0, 100];
  };
  let colorTimer = 0;
  const sendColor = () => {
    const r = b.readings[id].get(key)!.r, h = hold.get(`${r.color!.id}#hs`);
    if (!h) return;
    h.until = Date.now() + PENDING_MS;
    const [hue, sat] = [Math.floor(h.value / 1000), h.value % 1000];
    void send(b, [r.color!.set(hue, sat)]);
  };
  // The knob follows; the saturation arcs take the hue; the center takes the color.
  const setColor = (what: 'hue' | 'sat', v: number) => {
    const r = b.readings[id].get(key)!.r, [h0, s0] = hsOf();
    const h = what === 'hue' ? Math.round(v * 360) % 360 : h0, sat = what === 'sat' ? Math.round(v * 100) : s0;
    // One number holds both: hue × 1000 + saturation.
    hold.set(`${r.color!.id}#hs`, { value: h * 1000 + sat, until: Infinity });
    const root = el.querySelector<HTMLElement>('.detail-ring');
    if (!root) return;
    const place = (w: 'hue' | 'sat', fraction: number, value: number, color: string) => {
      const grab = root.querySelector<HTMLElement>(`[data-dial="${key}:${w}"]`), knob = root.querySelector<HTMLElement>(`.${w}-knob`);
      if (!grab || !knob) return;
      const cs = getComputedStyle(grab), from = parseFloat(cs.getPropertyValue('--o-from')) || 0, range = parseFloat(cs.getPropertyValue('--o-range')) || 360;
      knob.parentElement!.style.setProperty('--o-from', `${(from + fraction * range).toFixed(2)}deg`);
      knob.style.background = color;
      grab.setAttribute('aria-valuenow', String(value));
    };
    place('hue', h / 360, h, `hsl(${h} 100% 50%)`);
    place('sat', sat / 100, sat, hsCss(h, sat));
    if (what === 'hue') root.querySelectorAll<HTMLElement>('.sat-ring o-arc').forEach((arc, i) => arc.style.setProperty('--o-fill', satColor(h, i)));
    for (const x of root.querySelectorAll('.hue-ring, .sat-ring')) x.classList.remove('is-unset');
    const center = root.querySelector<HTMLElement>('.ring-center');
    if (center) { center.classList.add('has-color'); center.style.setProperty('--c', hsCss(h, sat)); }
  };
  ctx.onCleanup(dialControls(el, {
    locked: () => false,
    ringOf: (k) => { const x = el.querySelector<HTMLElement>(`[data-dial="${k}"]`); return x ? (x.classList.contains('ring-grab') ? x : x.parentElement) : null; },
    current: (k, handle) => isHue(k) ? hsOf()[0] / 360 : isSat(k) ? hsOf()[1] / 100 : d.fraction(k, handle),
    stepOf: (k) => isHue(k) ? 5 / 360 : isSat(k) ? 0.05 : d.stepOf(k),
    set: (k, v, handle) => { if (isHue(k)) setColor('hue', v); else if (isSat(k)) setColor('sat', v); else d.setDial(k, d.snap(k, v), Infinity, handle); },
    nearest: (k, v) => (isColor(k) ? undefined : d.nearest(k, v)),
    onStart: () => { dragging = true; },
    onEnd: (k) => { dragging = false; if (isColor(k)) sendColor(); else d.commit(k); },
    onInput: (k) => { if (isColor(k)) { clearTimeout(colorTimer); colorTimer = window.setTimeout(sendColor, 500); } else d.commitSoon(k); },
  }));

  // The map zooms and moves in place: a step in or out from where it is, a drag from where it was.
  const moveMap = (change: (m: MapSpec) => void) => {
    const m = b.readings[id]?.get(key)?.r.map, svg = mapEl?.querySelector('svg');
    if (!m || !svg) return;
    change(m);
    turnMap(svg, m, mapAt(m));
    const home = mapEl!.querySelector<HTMLElement>('[data-map-home]');
    if (home) home.hidden = !mapCenter;
  };
  ctx.onCleanup(mapControls(el, {
    step: (by) => moveMap((m) => { mapZoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, Math.round(mapZoom ?? m.zoom) + by)); }),
    pan: (dx, dy) => moveMap((m) => { mapCenter = panCenter(mapCenter ?? m.center, mapZoom ?? m.zoom, dx, dy); }),
    home: () => moveMap(() => { mapCenter = null; }),
  }));

  ctx.onCleanup(scrollControls(el, {
    state: (k) => scrollState(b, k),
    count: () => b.readings[id].get(key)?.r.list?.length ?? 0,
    focus: (_, i) => { if (activeElement(b)?.matches('.scroll-list:focus-visible')) light(i); },
    // A row with an object of its own zooms into it; the rest do what they say.
    pick: (_, i) => {
      const x = b.readings[id].get(key)?.r.list?.[i], row = el.querySelector<HTMLElement>(`.scroll-item[data-opt="${i}"]`);
      if (x?.to && row && openObject(b, x.to, row)) return;
      if (x?.act && !b.pending.has(x.id)) void send(b, [x.act]);
    },
  }));

  el.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement, r = b.readings[id].get(key)!.r;
    if (input.dataset.seg === undefined) return;
    const s = r.segs![Number(input.dataset.seg)];
    if (s.act) void send(b, [s.act]);
  });
  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-shape]')) { square = !square; paint(); return; }
    if (target.closest('[data-live]')) { live = !live; paint(); return; }
    const again = target.closest<HTMLElement>('[data-retry]')?.dataset.retry;
    if (again) { retry(b, again); return; }
    const track = target.closest<HTMLElement>('[data-track]')?.dataset.track;
    if (track) {
      const x = b.readings[id].get(key)?.r.tracks?.find((y) => y.id === track);
      if (x?.act && !b.pending.has(track)) void send(b, [x.act]);
      return;
    }
    if (target.closest('[data-link]')) {
      const l = b.readings[id].get(key)?.r.link;
      if (l?.act) void send(b, [l.act]);
      return;
    }
    if (!target.closest('[data-resolve]')) return;
    const a = b.readings[id].get(key)?.r.alert;
    if (!a) return;
    if (a.acts.length) void send(b, a.acts);
    else { uiOf(b, id).seen.add(key); repaint(b); }
  });
}
