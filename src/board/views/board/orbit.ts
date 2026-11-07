// Orbit: the home's pulse in the center and the systems around it, the most
// serious first, clockwise from the top. The center holds the alert that
// matters most (the latest changes, or the clock, when all is calm); its ring
// shows which system calls and, with time on, the news of the last hours.

import { localeOf, time } from '../../../i18n.ts';
import { esc, icon, orbitHub, type HubLook, type HubNews } from '../../../radial/index.ts';
import { tune } from '../../../tune.ts';
import type { Board } from '../../context.ts';
import { ring, setHTML } from '../../draw.ts';
import { look } from '../../settings.ts';
import { live, uiOf, watched, worst } from '../../state.ts';
import { PAST_MS, hourCounts, loadPast, timeMarks } from '../../time.ts';
import { boardLanes, front, urgencyOrder } from './shared.ts';

// The whole orbit is one Orbit system: the universe is the space left, the
// pulse is the center satellite and the systems, satellites of orbit-10
// (tune.orbit). In 3D, like each system's object: the pulse in front and the
// systems one step behind (Orbit layers); the pointer tilts the whole.
export const orbitStage = () => `<div class="stage orbit-stage"><div class="obj"><div class="bigbang"><div class="gravity-spot depth outer-perspective">
  <div class="orbit-0 hub-orbit layer-front"><div class="satellite at-center"><div class="capsule">
    <div class="hub"><div class="hub-ring-slot"></div>
      <div class="hub-face"><div class="hub-slide" aria-live="polite"></div><div class="hub-before"></div></div></div>
  </div></div></div>
  <div class="orbit-${tune.orbit} orbit-tiles" data-depth="1"></div></div></div></div></div>`;

// A system of the orbit: an Orbit satellite. Orbit places it; the ring fills the
// satellite and the text hangs outward with Orbit's `.outward-y` (above in the
// top half, below in the rest).
function orbitTile(b: Board, id: string) {
  const f = front(b, id), level = worst(b, id), title = b.sys[id].title;
  return `<div class="satellite"><div class="capsule">
    <button class="otile zoom-me${level ? ` has-alert level-${level}` : ''}" data-to="sys-${id}" data-system="${id}"
      aria-label="${b.t.open(title)}">
      <span class="otile-ring"><span class="bigbang"><span class="gravity-spot">${ring(b, f.key, f.r, boardLanes(level), false, !f.r.alert)}</span></span>
        <span class="otile-glyph">${icon(f.ch.glyph, 24)}</span></span>
      <span class="otile-label outward-y"><span class="tile-title">${title}</span>
      <span class="tile-big">${esc(f.big)}</span></span>
    </button></div></div>`;
}

// The alerts open now, the most serious first: what the orbit's face steps through.
function openAlerts(b: Board) {
  return b.ids.flatMap((id) => live(b, id).map((k) => ({ id, k, ...b.readings[id].get(k)! })))
    .sort((x, y) => y.r.alert!.level - x.r.alert!.level || (uiOf(b, x.id).since.get(x.k) ?? 0) - (uiOf(b, y.id).since.get(y.k) ?? 0));
}
// The measures of the hub, from the gear's tuning.
const hubLook = (): HubLook => ({ gap: tune.timeGap, pointer: 'triangle', size: tune.timePointer, bar: tune.timeBar });
// Center of the orbit: one segment per system, facing its tile and pointing at
// it, painted if that system calls; inside, with time on, the news (orbitHub).
function hubRing(b: Board, ids: string[], news?: HubNews) {
  return orbitHub({ levels: ids.map((id) => worst(b, id)), news, look: hubLook(), rounded: look(b).ends === 'rounded', aria: b.t.hubAria });
}

// Inside the center, one thing at a time: each alert (most serious first) and
// at the end the pulse.
type Slide = { key: string; level: number; html: string };
function hubSlides(b: Board): Slide[] {
  const { t, host } = b;
  const alerts = b.ids.flatMap((id) => live(b, id).map((k) => ({ id, ...b.readings[id].get(k)!, k })))
    .sort((x, y) => y.r.alert!.level - x.r.alert!.level);
  const list: Slide[] = alerts.map(({ id, k, ch, r }) => {
    const a = r.alert!;
    return { key: `${id}:${k}`, level: a.level, html: `<div class="slide level-${a.level}">
      <p class="eyebrow">${esc(`${b.sys[id].title} · ${ch.name}`)}</p>
      <p class="slide-big">${esc(a.big)}</p>
      <p class="slide-why">${esc(a.why)}</p>
      <button class="plain slide-go" data-open="${id}">${t.openShort}</button></div>` };
  });
  // The three shown things that changed last, with their current value.
  const rows = [...watched(b)].map((e) => ({ id: e, at: host.changedAt?.(e) ?? 0 })).filter((x) => x.at > 0)
    .sort((x, y) => y.at - x.at).slice(0, 3)
    .map((x) => `<li><span>${esc(host.nameOf(x.id))}</span><strong>${esc(host.stateOf(x.id))}</strong></li>`);
  list.push({ key: 'pulse', level: 0, html: `<div class="slide">
    <p class="eyebrow">${t.pulse} · ${time(new Date()).slice(0, 5)}</p>
    <p class="slide-big${alerts.length ? ' is-calling' : ''}">${alerts.length ? t.nAlerts(alerts.length) : t.allCalm.replace(/\.$/, '')}</p>
    <ul class="hub-rows">${rows.join('') || `<li><span>${t.waitingChanges}</span></li>`}</ul></div>` });
  return list;
}

// The center of the orbit holds what matters most: the most serious alert,
// or the pulse when all is calm. The rest call from their tiles around it.
function paintSlide(b: Board, body: HTMLElement) {
  const { t } = b;
  const slides = hubSlides(b), tm = look(b).time, alerts = slides.filter((x) => x.level);
  const shown = alerts.length ? alerts[Math.min(b.hubAt, alerts.length - 1)] : slides[slides.length - 1];
  // All calm and the clock chosen: the time itself.
  const clock = !alerts.length && (tm === 'clock' || tm === 'both');
  const now = new Date();
  // Several open with time on: a dot each, in its color, to step through them (all the same size).
  const dots = tm !== 'off' && alerts.length > 1 ? `<nav class="hub-dots" aria-label="${t.alerts}">${alerts.map((a, i) =>
    `<button class="hub-dot level-${a.level}" data-hubat="${i}" aria-current="${i === b.hubAt}" aria-label="${esc(t.alertNof(i + 1, alerts.length))}"></button>`).join('')}</nav>` : '';
  setHTML(body.querySelector<HTMLElement>('.hub-slide')!, clock ? `<div class="slide hub-clock">
    <p class="eyebrow">${esc(now.toLocaleDateString(localeOf(), { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
    <p class="slide-big clock-big">${time(now).slice(0, 5)}</p>
    </div>` : shown.html.replace(/<\/div>\s*$/, `${dots}</div>`));
}

// Past twelve the orbit has no room to name them all: it shows eleven, the
// most urgent first, and the twelfth place turns to the next eleven (`+N`).
const ORBIT_MAX = 12;
function moreTile(b: Board, rest: number, at: string) {
  return `<div class="satellite"><div class="capsule">
    <button class="otile orbit-more" data-orbit-more aria-label="${esc(b.t.showMore(rest))}">
      <span class="otile-ring calm-ring">${'<i></i>'.repeat(Math.min(rest, 5))}</span>
      <span class="otile-label outward-y"><span class="tile-title">${esc(b.t.moreN(rest))}</span><span class="tile-big">${esc(at)}</span></span>
    </button></div></div>`;
}

// The systems around, the hub in the center with the news inside it. `changed`:
// something new entered the log since the last paint (the center beats).
export function paintOrbit(b: Board, body: HTMLElement, ids: string[], ready: boolean, changed: boolean) {
  const { t } = b;
  // The systems queue by urgency, clockwise from the top: the most serious first (urgencyOrder).
  // Each part is replaced on its own: the carousel does not redraw the rings.
  const queue = urgencyOrder(b, b.ids.filter((id) => ids.includes(id)));
  const per = ORBIT_MAX - 1, pages = queue.length > ORBIT_MAX ? Math.ceil(queue.length / per) : 1;
  if (b.orbitPage >= pages) b.orbitPage = 0;
  const fixed = pages > 1 ? queue.slice(b.orbitPage * per, b.orbitPage * per + per) : queue;
  const hubEl = body.querySelector<HTMLElement>('.hub')!;
  if (hubEl.hidden !== !ready) hubEl.hidden = !ready;
  const tm = look(b).time, calling = fixed.some((id) => worst(b, id));
  const changesRing = tm === 'changes' || (tm === 'both' && calling), clock = (tm === 'clock' || tm === 'both') && !calling;
  if ((changesRing || clock) && b.host.changes && b.host.status === 'live' && (!b.pastChanges || Date.now() - b.pastChanges.at > PAST_MS)) void loadPast(b);
  const timeOn = changesRing || clock;
  hubEl.classList.toggle('has-time', timeOn);
  // The news inside the ring: the last 12 hours with the open alerts at the moment they began, or the calm day by hour.
  const alerts = openAlerts(b);
  if (b.hubAt >= alerts.length) b.hubAt = 0;
  const now = Date.now();
  const news: HubNews | undefined = changesRing
    ? { span: 12, alerts: alerts.map((a, i) => ({ ago: (now - (uiOf(b, a.id).since.get(a.k) ?? now)) / 3_600_000, level: a.r.alert!.level, current: i === b.hubAt })) }
    : clock ? { span: 24, bars: hourCounts(b) } : undefined;
  const hub = ready ? hubRing(b, fixed, news) : null;
  setHTML(body.querySelector<HTMLElement>('.hub-ring-slot')!, hub ? `<div class="hub-ring">${hub.svg}</div>` : '');
  if (hub) hubEl.style.setProperty('--hub-face-inset', `${(hub.inset * 100).toFixed(2)}%`);
  hubEl.style.setProperty('--hub-split', String(tune.timeSplit));
  // With time on, the face splits: now above the line, before under it (the last change, and the way into all of them).
  const span = changesRing ? 12 : 24, all = timeOn ? timeMarks(b, span, 500) : [];
  const last = all.find((m) => !m.level);
  hubEl.querySelector('.hub-face')!.classList.toggle('is-split', ready && timeOn);
  setHTML(body.querySelector<HTMLElement>('.hub-before')!, ready && timeOn ? `${last ? `<span class="hub-last">${esc(`${last.when} · ${last.text}`)}</span>` : ''}
    <button class="hub-changes zoom-me" data-to="changes" data-span="${span}" aria-label="${esc(t.openChanges(span))}">${esc(t.nChanges(all.length))} ›</button>` : '');
  const tilesEl = body.querySelector<HTMLElement>('.orbit-tiles')!;
  // Half a step of offset: no system right at the top, and each one faces its
  // segment of the center ring.
  tilesEl.style.setProperty('--o-from', `${180 / Math.max(1, fixed.length + (pages > 1 ? 1 : 0))}deg`);
  const from = b.orbitPage * per;
  setHTML(tilesEl, fixed.map((id) => orbitTile(b, id)).join('') + (pages > 1 ? moreTile(b, queue.length - fixed.length, t.nextOf(from + 1, from + fixed.length, queue.length)) : ''));
  if (ready) paintSlide(b, body);
  if (changed) { hubEl.classList.remove('beat'); void hubEl.offsetWidth; hubEl.classList.add('beat'); }
}
