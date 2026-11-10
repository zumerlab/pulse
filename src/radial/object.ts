// The object in layers: the face of the front layer, the layers behind, the
// index beside them, the system view's skeleton and its strip, the dots of the
// phone, and the pointer's tilt.

import { t } from '../i18n.ts';
import { esc, icon } from './markup.ts';
import { globe, type GlobeSpec } from './globe.ts';
import { mapFace, type MapSpec } from './map.ts';
import { radar, type Plot, type RadarSpec } from './radar.ts';
import { videoMarkup } from './video.ts';
import { GROW, LANE, PHONE } from './sizes.ts';

export type Face = {
  glyph: string; name: string; big: string; label: string;
  // The Zumly view the disc opens. Without it the disc is just the face: a
  // control of one entity that is resolved on the face has no detail to open
  // (a detail only exists when it adds something the face does not have).
  to?: string;
  // The thing the face is about, when it has an object of its own: a tap opens that object (the host's `data-object`).
  object?: string;
  props?: Record<string, string>;      // data-* for that view
  aria: string;
  extra?: string;                      // more markup inside the disc ("sending…")
  // A picture inside the disc (a camera, a cover, a plan, a map): the text sits over it.
  image?: { src: string; alt: string; key?: string; video?: string };   // video: it moves (a live stream), the still as its poster
  // Things around a point, as a radar behind the text: the center is here (home, the boat, you);
  // how the radar reads (its rings named, the center's own course).
  plots?: Plot[];
  radar?: RadarSpec;
  // Things on the Earth, the disc as a globe behind the text.
  globe?: GlobeSpec;
  // Things on a city or a field, the disc as a window on a tiled map.
  map?: MapSpec;
  // The ring is a choice, its names along the inside of it: the face's lines keep clear of them.
  choice?: boolean;
};

// The front layer's center: the face in an at-center satellite of orbit-0,
// which is the Zumly trigger of the next level when there is one (`to`).
export function face(f: Face) {
  const props = Object.entries(f.props ?? {}).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const img = f.image?.video ? videoMarkup({ src: f.image.video, poster: f.image.src, alt: f.image.alt, cls: 'face-image' })
    : f.image ? `<img class="face-image" src="${esc(f.image.src)}" alt="${esc(f.image.alt)}"${f.image.key ? ` data-image="${esc(f.image.key)}"` : ''}>` : '';
  const plots = f.map ? mapFace(f.map, f.name) : f.globe && (f.globe.plots.length || f.globe.center) ? globe(f.globe, f.name) : f.plots?.length ? radar(f.plots, f.name, f.radar) : '';
  const opens = f.to ? ` role="button" tabindex="0" data-to="${f.to}"${props} aria-label="${esc(f.aria)}"`
    : f.object ? ` role="button" tabindex="0" data-object="${esc(f.object)}" aria-label="${esc(f.aria)}"` : '';
  return `<div class="orbit-0" style="--o-size-ratio:21.2"><div class="satellite at-center">
    <div class="capsule disc${f.to ? ' zoom-me' : ''}${f.object ? ' opens-object' : ''}${img ? ' has-image' : ''}${plots ? ' has-radar' : ''}${f.map ? ' has-map' : ''}${f.choice ? ' has-choice' : ''}"${opens}>
      ${img}${plots}${icon(f.glyph)}<span class="face-name">${esc(f.name)}</span>
      <span class="face-big${f.big.length > 9 ? ' is-long' : ''}">${esc(f.big)}</span><span class="face-label">${esc(f.label)}</span>${f.extra ?? ''}</div></div></div>`;
}

export type BackLayer = {
  text: string;                        // the arc label, "Channel · value"
  at: number;                          // degrees where the label starts
  grow: number;                        // the layer's growth (SIZE[d]); text and strokes are divided by it
  stroke: number;                      // apparent stroke, px
  hit: number;                         // touch margin of the ring, px
  pick: { attr: string; value: string; aria: string };
};

// A layer behind: the label takes the length of its text (range="auto") and a
// transparent interactive arc on the ring receives the tap that brings it forward.
// The label rides just outside its ring (orbit 13), never over the rings inside it.
export function backLayer(b: BackLayer) {
  return `<div class="orbit-13" style="--o-from:${b.at}deg">
      <o-arc range="auto" class="arc-label" style="font-size:${(11 / b.grow).toFixed(2)}px">${esc(b.text)}</o-arc></div>
    <div class="orbit-12" style="--o-size-ratio:${(b.stroke / b.grow / LANE).toFixed(3)}">
      <o-arc interactive hit-width="${(b.hit / b.grow).toFixed(1)}" ${b.pick.attr}="${esc(b.pick.value)}" class="ring-hit"
        role="button" tabindex="0" aria-label="${esc(b.pick.aria)}"></o-arc></div>`;
}

// Labels of the layers behind alternate sides so they never share a line. On a
// phone the layers behind run past the edges of the screen, so the labels sit
// nearer the top, where the width is. In an alert the object zooms in and only
// the first layer behind fits whole (fitFor): the ones past it run off the top
// and the bottom of a wide stage, so their labels move to the side, where they show.
export const labelAt = (i: number, alert = false) => (PHONE ? (i === 1 ? 332 : 18) : (i === 1 ? 300 : alert ? 62 : 30));

// The system view's skeleton: stage with the universe, strip, dots on the
// phone and the buttons below.
// The system's screen: the title, the stage with the object, the strip under
// it and a footer bar: room at the left for the back button (Zumly's, at the
// bottom left of the canvas), the systems' dots in the middle on the phone,
// the secondary controls at the right.
export function systemShell(title: string | null, buttons: string) {
  return `<div class="system">
    ${title ? `<p class="eyebrow sys-title">${esc(title)}</p>` : ''}
    <div class="stage" data-zoom="calm">
      <div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective is-flat"
        style="--o-depth-grow:${GROW}"></div></div></div>
      <div class="layer-index-slot"></div>
      <div class="keypad-slot"></div>
    </div>
    <div class="strip" aria-live="polite"></div>
    <footer class="foot">
      <span class="foot-back"></span>
      ${PHONE ? `<nav class="dots" aria-label="${t.systems}"></nav>` : '<span></span>'}
      <div class="controls">${buttons}</div>
    </footer>
  </div>`;
}

// The toggle between the flat object and its 3D view: an icon button out of
// the main path (the footer); its label says what it would do.
export function viewToggle() {
  return `<button class="plain icon-btn" data-act="view" aria-pressed="false" aria-label="${t.view3d}" title="${t.view3d}">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class="glyph"><path d="M12 4 3 9l9 5 9-5-9-5Z"/><path d="m3 14 9 5 9-5"/></svg></button>`;
}
export function setViewToggle(btn: HTMLElement, flat: boolean) {
  const label = flat ? t.view3d : t.viewFlat;
  btn.setAttribute('aria-pressed', String(!flat));
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

export type Dot = { id: string; title: string; level: number; ring: string; glyph?: string };
// One mini ring per system, its glyph inside (what tells one from the next); the one of a system with an alert beats.
export function dots(list: Dot[], currentId: string) {
  return list.map((d) => `<button class="dot${d.level ? ` has-alert level-${d.level}` : ''}" data-go="${d.id}"
      aria-label="${esc(d.title)}" title="${esc(d.title)}"${d.id === currentId ? ' aria-current="true"' : ''}>
      <span class="bigbang"><span class="gravity-spot">${d.ring}</span></span>${d.glyph ? `<span class="dot-glyph">${icon(d.glyph, 14)}</span>` : ''}</button>`).join('');
}

// The layers of a stacked object named beside it, front to back: a dot per
// layer (its level's color, the front one filled) and the name, each a button
// that brings that layer to the front. Past the cap (`off`), the layer is not
// drawn and its dot is hollow. `attr` is the data attribute the host handles.
export type LayerItem = { id: string; title: string; big?: string; level: number; off?: boolean; front?: boolean };
export function layerIndex(list: LayerItem[], attr: string) {
  return `<nav class="layer-index" aria-label="${esc(t.layerIndex)}">${list.map((l, i) => `<button class="layer-item${l.level ? ` level-${l.level}` : ''}${l.off ? ' is-off' : ''}"
      ${attr}="${esc(l.id)}" aria-label="${esc(t.bringToFront(l.title))}"${(l.front ?? i === 0) ? ' aria-current="true"' : ''}>
      <span class="layer-dot"></span><span class="layer-name">${esc(l.title)}</span>${l.big ? `<span class="layer-big">${esc(l.big)}</span>` : ''}</button>`).join('')}</nav>`;
}

// The channels that do not fit as rings (past SIZE) are named in the strip,
// each a button that brings it to the front, like tapping its ring would.
// No instructions here: the handle, the names on the ring and the hover say
// what can be done.
export function calmStrip(title: string, frontName: string, hidden: { key: string; name: string }[]) {
  const more = hidden.length ? ` · <span class="behind">${t.behind(hidden.length)}: ${hidden.map((h) =>
    `<button class="more" data-pick="${esc(h.key)}" aria-label="${esc(t.bringToFront(h.name))}">${esc(h.name)}</button>`).join(', ')}</span>` : '';
  // A system whose front channel carries its own name says it once.
  return `<strong>${esc(title)}</strong>${frontName === title ? '' : ` · ${t.inFront(frontName)}`}${more}`;
}

// ±7° tilt with the pointer, only in 3D and not on the phone (no pointer).
// `rest` is the tilt the object keeps with no pointer over it (degrees around
// x and y): the 3D view reads as 3D the moment it opens, and on a phone too.
// The function it returns writes the tilt again (call it when `active` changes).
// It goes through the Web Animations API, never through a style attribute:
// Orbit watches every attribute in the document, and a change on an ancestor
// of the rings makes it measure and redraw all of them (31/10: 1,500 raster
// tasks in 3 s of mouse). The animation moves `rotate` on the compositor, in
// half degrees, one write per frame; the stage is measured once per entry.
export function parallax(stage: HTMLElement, obj: () => HTMLElement | null, active: () => boolean, rest: [number, number] = [0, 0]) {
  let px = 0, py = 0, frame = 0, box: DOMRect | null = null, last = '';
  const live: Animation[] = [];
  const write = () => {
    frame = 0;
    const o = obj();
    if (!o) return;
    const on = active(), rx = on ? rest[0] + px : 0, ry = on ? rest[1] + py : 0;
    // rotateX(rx) then rotateY(ry): for small angles, one turn of √(rx²+ry²) around the axis (rx, ry, 0).
    const a = Math.hypot(rx, ry);
    const value = a < 0.01 ? 'none' : `${(rx / a).toFixed(3)} ${(ry / a).toFixed(3)} 0 ${a.toFixed(1)}deg`;
    if (value === last) return;
    last = value;
    // Each turn starts from where the previous one left it (the underlying value
    // includes the earlier animations); the earlier ones go once this one ends.
    const anim = o.animate([{ rotate: value }], { duration: 220, easing: 'ease-out', fill: 'forwards' });
    const earlier = live.splice(0);
    live.push(anim);
    anim.finished.then(() => { for (const e of earlier) e.cancel(); if (value === 'none' && live[0] === anim) { live.length = 0; anim.cancel(); } }, () => {});
  };
  const half = (d: number) => Math.round(d * 2) / 2;
  stage.addEventListener('pointerenter', () => { box = stage.getBoundingClientRect(); });
  stage.addEventListener('pointermove', (e) => {
    if (!active() || PHONE || e.pointerType === 'touch') return;
    if (!box) box = stage.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5, y = (e.clientY - box.top) / box.height - 0.5;
    px = half(-y * 14);
    py = half(x * 14);
    if (!frame) frame = requestAnimationFrame(write);
  });
  stage.addEventListener('pointerleave', () => { box = null; px = 0; py = 0; if (!frame) frame = requestAnimationFrame(write); });
  return () => { if (!frame) frame = requestAnimationFrame(write); };
}
