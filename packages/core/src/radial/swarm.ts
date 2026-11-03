// Many of one thing on a ring: a tick per member, all the way around. The
// ones on are in ink, the ones off dim, the failing ones painted in the
// alert's color and, when the alert calls, pulsing. One SVG, not an Orbit
// arc per member: a fleet of a hundred vehicles is a hundred ticks, a
// thousand sensors a thousand hairlines. Nothing on a tick is operated: a
// member is picked in the detail's list.

import { t } from '../i18n.ts';
import { arcPath } from './arc.ts';
import { esc } from './markup.ts';

// Past this many segments a switches ring draws as a swarm.
export const SWARM_FROM = 12;
export type SwarmTick = { on: boolean; label: string };
export type SwarmOptions = {
  name?: string;                  // what the members are, for the accessible label
  on: string;                     // the color of a member that is on
  fill: string;                   // the color of a failing member (the alert's)
  fail?: number[];                // the failing members
  call?: boolean;                 // the alert calls: the failing ticks pulse
  muted?: boolean;                // everything in gray (a mini ring that must not shout)
};

// The ring sits where orbit-12 would: a satellite over the whole universe
// (24 lanes) holding an SVG of 240 units, so a lane is 10 units and the
// ticks are `lanes` thick, their outer edge on the rim. Each member takes
// an even share of the turn, three fifths of it drawn; past sixty members
// the share is drawn almost whole, or the ring would read as a dotted line.
export function swarmRing(ticks: SwarmTick[], lanes: number, o: SwarmOptions) {
  const n = ticks.length;
  if (!n) return '';
  const thick = Math.max(1.5, lanes * 10), r = 120 - thick / 2, step = 360 / n;
  const share = n > 60 ? 0.85 : 0.6;
  const fail = new Set(o.fail ?? []);
  const paths = ticks.map((tk, i) => {
    const failing = fail.has(i) && !o.muted;
    const cls = failing ? ` is-fail${o.call ? ' is-calling' : ''}` : tk.on ? ' is-on' : ' is-off';
    const color = o.muted ? 'var(--muted)' : failing ? o.fill : tk.on ? o.on : 'var(--dim)';
    const a = i * step + (1 - share) * step / 2;
    return `<path class="swarm-tick${cls}" d="${arcPath(a, a + step * share, r)}" style="stroke:${color}; stroke-width:${thick.toFixed(1)}"><title>${esc(tk.label)}</title></path>`;
  }).join('');
  const onCount = ticks.filter((tk) => tk.on).length;
  const aria = `${o.name ? `${o.name}: ` : ''}${t.swarmOf(onCount, n, fail.size)}`;
  return `<div class="orbit-0 swarm-orbit" style="--o-size-ratio:24"><div class="satellite at-center">
    <svg class="swarm-ring" viewBox="-120 -120 240 240" role="img" aria-label="${esc(aria)}" data-count="${n}">${paths}</svg></div></div>`;
}
