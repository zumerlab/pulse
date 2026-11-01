import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { CollectorSource, lastCollector, rememberCollector, type MachineSource } from './source.ts';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { t } from './strings.ts';

// The homelab app: the object over the collector running on a machine (or on
// another one, on the LAN), with the connect panel in front while nothing
// answers. `?collector=http://host:5180&token=…` fixes where to look;
// `?demo` opens the MacBook that is not there.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const demo = new DemoSource();
let source: MachineSource = query.has('demo') ? demo : new CollectorSource(query.get('collector') ?? lastCollector(), query.get('token') ?? '');

function status() {
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}
    <button class="plain" data-action="disconnect">${source === demo ? t.leaveDemo : t.disconnect}</button></span>`;
}

// `?systems=compute,network&mode=orbit&start=network` fixes what the page
// shows (a kiosk, a shared link); the gear chooses within that.
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const modeParam = query.get('mode') as BoardMode | null;

const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-homelab-settings',
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError },
  onAction: (action) => { if (action === 'disconnect') disconnect(); },
  // Nothing answers yet: the connect panel covers the canvas; something does: the object.
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.things.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintConnect();
  },
});

function use(src: MachineSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function disconnect() {
  const q = new URLSearchParams(location.search);
  q.delete('demo'); q.delete('collector'); q.delete('token');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  source.stop();
  shell.classList.add('disconnected');
  connectSlot.hidden = false;
  paintConnect();
}

// The connect panel: where the collector answers, how to start it, or the demo.
function paintConnect() {
  const url = source instanceof CollectorSource ? source.url : lastCollector();
  connectSlot.innerHTML = `<form class="connect">
    <h1>Pulse</h1>
    <p class="connect-lead">${t.connectLead}</p>
    ${source.status === 'error' && source.error ? `<p class="error">${esc(source.error)}</p>` : ''}
    <label>${t.collectorField}<input name="url" type="url" value="${esc(url)}" required></label>
    <p class="connect-hint">${t.collectorHint}</p>
    <label>${t.tokenField}<input name="token" type="password" autocomplete="off"></label>
    <button class="primary" type="submit">${t.connect}</button>
    <details class="connect-how"><summary>${t.howToStart}</summary>
      <pre><code>${t.startCommand}</code></pre>
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
  const url = String(data.get('url') ?? '').trim().replace(/\/+$/, ''), token = String(data.get('token') ?? '');
  if (!url) return;
  rememberCollector(url);
  const q = new URLSearchParams(location.search);
  q.set('collector', url); if (token) q.set('token', token); else q.delete('token');
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(new CollectorSource(url, token));
});
connectSlot.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('[data-demo]')) return;
  const q = new URLSearchParams(location.search);
  q.set('demo', '1'); q.delete('collector');
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(demo);
});

await board.ready;
use(source);

Object.assign(window, { pulseHomelab: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
