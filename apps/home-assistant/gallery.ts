// The index: every way to see Pulse, as cards to pick from. Your own Home
// Assistant, the demo app with simulated systems (in development), and the
// six homes of demo.home-assistant.io, each previewed with the mini rings its
// entities fill, computed from the same model the board uses.

import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { MINI_LANES, esc, icon, ring, type Reading } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { homes, type Home } from './demo/homes/index.ts';
import { systems } from './model.ts';
import { t } from './strings.ts';

// The demo app runs beside this one in development; elsewhere, point to it
// with VITE_DEMO_APP_URL or the card does not appear.
const DEMO_APP: string = import.meta.env.VITE_DEMO_APP_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5173/' : '');

const root = document.querySelector<HTMLElement>('#gallery')!;

const card = (href: string, title: string, lead: string, body: string, foot: string, cls = '') =>
  `<a class="home-card ${cls}" href="${esc(href)}">
    <span class="home-head"><strong>${esc(title)}</strong><span class="home-open">${t.openShort}</span></span>
    <span class="home-lead">${esc(lead)}</span>
    ${body}
    <span class="home-foot">${esc(foot)}</span>
  </a>`;

// The links name index.html: a static host that does not serve a folder as its
// index (Home Assistant's /local/, for one) still reaches the app.
// One mini ring per system the home fills: the channel calling the most, or the first.
function preview(source: DemoSource) {
  const tiles: string[] = [];
  for (const sys of systems) {
    const read = sys.channels.map((ch) => ({ ch, r: ch.read(source.states, { temp: source.unit, reg: source.registry }) }))
      .filter((x): x is { ch: typeof x.ch; r: Reading } => !!x.r)
      .sort((a, b) => (b.r.alert?.level ?? 0) - (a.r.alert?.level ?? 0));
    if (!read.length) continue;
    const { ch, r } = read[0], level = r.alert?.level ?? 0;
    tiles.push(`<span class="tile${level ? ` has-alert level-${level}` : ''}" data-system="${sys.id}">
      <span class="bigbang mini-ring"><span class="gravity-spot">${ring(ch.key, r, MINI_LANES, { muted: !r.alert })}</span></span>
      <span class="mini-glyph">${icon(ch.glyph, 26)}</span>
      <span class="tile-title">${sys.title}</span>
      <span class="tile-big">${esc(r.alert ? r.alert.big : r.big)}</span>
    </span>`);
  }
  return tiles;
}

async function homeCard(home: Home) {
  const source = new DemoSource();
  await source.start(home.id);
  const tiles = preview(source), entities = source.states.size;
  source.stop(false);
  return card(`./index.html?demo=${home.id}`, home.name, `${home.author} · ${home.description}`,
    `<span class="tiles">${tiles.join('')}</span>`,
    t.homeFoot(entities, tiles.length), 'home-card-demo');
}

root.innerHTML = `<h1>Pulse</h1><p class="gallery-lead">${t.galleryLead}</p>
  <section class="home-cards">
    ${card('./index.html', t.yourHA, t.yourHALead, '', t.signIn, 'home-card-live')}
    ${DEMO_APP ? card(DEMO_APP, t.demoApp, t.demoAppLead, '', t.openShort, 'home-card-app') : ''}
  </section>
  <h2>${t.demoHomes}</h2><p class="gallery-lead">${t.demoHomesLead}</p>
  <section class="home-cards" data-homes></section>`;
const list = root.querySelector<HTMLElement>('[data-homes]')!;
for (const home of homes) list.insertAdjacentHTML('beforeend', await homeCard(home));
