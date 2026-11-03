import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { lastServer, rememberServer, WebSocketSource, type VesselSource } from './source.ts';
import { t } from './strings.ts';

// The Signal K app: the object over a Signal K server (the one on board, or
// the public demo vessel), with the connect panel in front while nothing
// answers. `?server=https://demo.signalk.org&token=…` fixes where to look;
// `?demo` opens the yacht that is not there.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const demo = new DemoSource();
let source: VesselSource = query.has('demo') ? demo : new WebSocketSource(query.get('server') ?? lastServer(), query.get('token') ?? '');

function status() {
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}
    <button class="plain" data-action="disconnect">${source === demo ? t.leaveDemo : t.disconnect}</button></span>`;
}

// `?systems=navigation,wind&mode=orbit&start=navigation` fixes what the page
// shows (a helm screen, a shared link); the gear chooses within that.
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const modeParam = query.get('mode') as BoardMode | null;

const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-signalk-settings',
  // A helm at night: the deep theme over a sea-blue glow, glass faces, instruments as open dials with rounded ends.
  look: { theme: 'deep', ground: 'glow', glow: '#0f4c6e', faces: 'glass', dial: 'open', ends: 'rounded' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError },
  onAction: (action) => { if (action === 'disconnect') disconnect(); },
  // Nothing answers yet: the connect panel covers the canvas; something does: the object.
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.values.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintConnect();
  },
});

function use(src: VesselSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function disconnect() {
  const q = new URLSearchParams(location.search);
  q.delete('demo'); q.delete('server'); q.delete('token');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  source.stop();
  shell.classList.add('disconnected');
  connectSlot.hidden = false;
  paintConnect();
}

// The connect panel: which server, or the demo.
function paintConnect() {
  const url = source instanceof WebSocketSource ? source.url : lastServer();
  connectSlot.innerHTML = `<form class="connect">
    <h1>Pulse</h1>
    <p class="connect-lead">${t.connectLead}</p>
    ${source.status === 'error' && source.error ? `<p class="error">${esc(source.error)}</p>` : ''}
    <label>${t.serverField}<input name="url" type="url" value="${esc(url)}" required></label>
    <p class="connect-hint">${t.serverHint}</p>
    <label>${t.tokenField}<input name="token" type="password" autocomplete="off"></label>
    <button class="primary" type="submit">${t.connect}</button>
    <div class="connect-demo">
      <button class="plain" type="button" data-demo>${t.exploreDemo}</button>
      <p class="connect-hint">${t.demoHint}</p>
    </div>
  </form>`;
}
connectSlot.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const url = String(data.get('url') ?? '').trim().replace(/\/+$/, ''), token = String(data.get('token') ?? '');
  if (!url) return;
  rememberServer(url);
  const q = new URLSearchParams(location.search);
  q.set('server', url); if (token) q.set('token', token); else q.delete('token');
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(new WebSocketSource(url, token));
});
connectSlot.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('[data-demo]')) return;
  const q = new URLSearchParams(location.search);
  q.set('demo', '1'); q.delete('server');
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(demo);
});

await board.ready;
use(source);

Object.assign(window, { pulseSignalK: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
