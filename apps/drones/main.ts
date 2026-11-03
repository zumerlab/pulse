import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { lastServer, rememberServer, RestSource, type SwarmSource } from './source.ts';
import { t } from './strings.ts';

// The drones app: the object over a swarm of ArduPilot vehicles through
// mavlink2rest (the simulator's, or the real ones through a companion
// computer), with the connect panel in front while nothing answers.
// `?server=http://host:8088` fixes where to look; `?demo` opens the six
// copters that are not there.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const demo = new DemoSource();
let source: SwarmSource = query.has('demo') ? demo : new RestSource(query.get('server') ?? lastServer());

function status() {
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}
    <button class="plain" data-action="disconnect">${source === demo ? t.leaveDemo : t.disconnect}</button></span>`;
}

const modeParam = query.get('mode') as BoardMode | null;
const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  axis: query.get('axis') === 'groups' ? 'groups' : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-drones-settings',
  // A field at dusk: a green glow, glass faces, open dials with rounded ends.
  look: { ground: 'glow', glow: '#2f5a2e', faces: 'glass', dial: 'open', ends: 'rounded' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError, noGroup: t.noGroup },
  onAction: (action) => { if (action === 'disconnect') disconnect(); },
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.drones.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintConnect();
  },
});

function use(src: SwarmSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function disconnect() {
  const q = new URLSearchParams(location.search);
  q.delete('demo'); q.delete('server');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  source.stop();
  shell.classList.add('disconnected');
  connectSlot.hidden = false;
  paintConnect();
}

function paintConnect() {
  const url = source instanceof RestSource ? source.url : lastServer();
  connectSlot.innerHTML = `<form class="connect">
    <h1>Pulse</h1>
    <p class="connect-lead">${t.connectLead}</p>
    ${source.status === 'error' && source.error ? `<p class="error">${esc(source.error)}</p>` : ''}
    <label>${t.serverField}<input name="url" type="url" value="${esc(url)}" required></label>
    <p class="connect-hint">${t.serverHint}</p>
    <button class="primary" type="submit">${t.connect}</button>
    <details class="connect-how"><summary>${t.howToStart}</summary>
      <pre><code>${esc(t.startCommand)}</code></pre>
      <p class="connect-hint">${t.startHint}</p></details>
    <div class="connect-demo">
      <button class="plain" type="button" data-demo>${t.exploreDemo}</button>
      <p class="connect-hint">${t.demoHint}</p>
    </div>
  </form>`;
}
connectSlot.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(e.target as HTMLFormElement);
  const url = String(data.get('url') ?? '').trim().replace(/\/+$/, '');
  if (!url) return;
  rememberServer(url);
  const q = new URLSearchParams(location.search);
  q.set('server', url);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(new RestSource(url));
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

Object.assign(window, { pulseDrones: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
