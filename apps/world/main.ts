import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DEFAULT_SERVICES, serviceOf } from './feeds.ts';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { DEFAULT_WHERE, LiveSource, type WorldSource } from './source.ts';
import { t } from './strings.ts';

// The world app: the sun, the earth, the sky over a place and a few services,
// read straight from public feeds. No server, no sign-in: the page is live
// wherever it is served. `?at=lat,lon&place=Name` says where the sky is read
// (`?here` asks the browser), `?services=github,cloudflare,status.example.com`
// which status pages to follow; `?demo` opens a recorded stormy day.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);

const whereOf = () => {
  const at = query.get('at')?.split(',').map(Number);
  const lat = at && at.length === 2 && at.every(Number.isFinite) ? at[0] : Number(query.get('lat'));
  const lon = at && at.length === 2 && at.every(Number.isFinite) ? at[1] : Number(query.get('lon'));
  const known = Number.isFinite(lat) && Number.isFinite(lon) && (query.has('at') || query.has('lat'));
  return known ? { lat, lon, place: query.get('place') ?? `${lat.toFixed(2)}, ${lon.toFixed(2)}` } : { ...DEFAULT_WHERE, place: query.get('place') ?? DEFAULT_WHERE.place };
};
const services = (query.get('services')?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SERVICES).map(serviceOf);
const demo = new DemoSource();
let source: WorldSource = query.has('demo') ? demo : new LiveSource(whereOf(), services);

function status() {
  const failing = source.failed.length && source.status === 'live' ? ` · <span class="conn-failing">${esc(source.failed.join(', '))} not answering</span>` : '';
  const here = source === demo || !('geolocation' in navigator) ? '' : `<button class="plain" data-action="here">${t.useLocation}</button>`;
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}${failing}
    ${source === demo ? `<button class="plain" data-action="leave">${t.leaveDemo}</button>` : here}</span>`;
}

// `?systems=sun,sky&mode=orbit&start=sky` fixes what the page shows (a kiosk, a shared link); the gear chooses within that.
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const modeParam = query.get('mode') as BoardMode | null;

const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : 'orbit',
  start: query.get('start') ?? undefined,
  settings: 'pulse-world-settings',
  // The world reads best as an orbit under a night sky: a deep glow, glass faces, the clock in the center while all is calm.
  look: { ground: 'glow', glow: '#2a3f8f', faces: 'glass', time: 'both' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError },
  onAction: (action) => { if (action === 'leave') leaveDemo(); else if (action === 'here') useHere(); },
  // Nothing answers: the panel covers the canvas; something does: the objects.
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.things.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintPanel();
  },
});

function use(src: WorldSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function leaveDemo() {
  query.delete('demo');
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  use(new LiveSource(whereOf(), services));
}
function useHere() {
  navigator.geolocation.getCurrentPosition((pos) => {
    query.set('at', `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`);
    query.set('place', t.here);
    history.replaceState(null, '', `${location.pathname}?${query}`);
    use(new LiveSource(whereOf(), services));
  });
}

// The panel while nothing answers: why, a retry, and the demo.
function paintPanel() {
  connectSlot.innerHTML = `<div class="connect">
    <h1>Pulse</h1>
    <p class="connect-lead">${t.lead}</p>
    ${source.status === 'error' && source.error ? `<p class="error">${esc(source.error)}</p>` : ''}
    <button class="primary" type="button" data-retry>${t.retry}</button>
    <div class="connect-demo">
      <button class="plain" type="button" data-demo>${t.exploreDemo}</button>
      <p class="connect-hint">${t.demoHint}</p>
    </div>
  </div>`;
}
connectSlot.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-retry]')) { use(source); return; }
  if (!target.closest('[data-demo]')) return;
  query.set('demo', '1');
  history.replaceState(null, '', `${location.pathname}?${query}`);
  use(demo);
});

await board.ready;
use(source);

Object.assign(window, { pulseWorld: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
