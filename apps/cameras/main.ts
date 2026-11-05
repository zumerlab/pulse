import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { LiveSource, type CameraSource } from './source.ts';
import { t } from './strings.ts';

// The cameras app: London's roads from TfL's open data, the incidents with the
// nearest camera's picture. No server, no key. `?demo` opens a recorded evening.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };

const demo = new DemoSource();
let source: CameraSource = query.has('demo') ? demo : new LiveSource();

function status() {
  const failing = source.failed.length && source.status === 'live' ? ` · <span class="conn-failing">${esc(source.failed.join(', '))} not answering</span>` : '';
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}${failing}
    ${source === demo ? `<button class="plain" data-action="leave">${t.leaveDemo}</button>` : ''} · <a class="plain" href="https://tfl.gov.uk/info-for/open-data-users/" target="_blank" rel="noopener">${t.credit}</a></span>`;
}

const modeParam = query.get('mode') as BoardMode | null;
const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-cameras-settings',
  // A traffic control room at night: graphite over a faint amber glow, glass faces, open dials with rounded ends.
  look: { theme: 'graphite', ground: 'glow', glow: '#3a2a10', faces: 'glass', dial: 'open', ends: 'rounded' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError, noGroup: t.noGroup },
  onAction: (action) => { if (action === 'leave') leaveDemo(); },
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.cameras.size && !source.disruptions.length);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintPanel();
  },
});

function use(src: CameraSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function leaveDemo() {
  query.delete('demo');
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  use(new LiveSource());
}

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

Object.assign(window, { pulseCameras: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
