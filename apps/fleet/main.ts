import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { HslSource, MODES, type FleetSource } from './source.ts';
import { t } from './strings.ts';

// The fleet app: Helsinki's transit as it moves, from HSL's public MQTT feed
// over WebSocket. `?modes=tram,bus` says which vehicles to listen to (trams
// by default: a hundred objects is a fleet, a thousand is a wall), `?routes=`
// narrows to lines (HSL route ids, 1006 for tram 6); `?demo` opens the
// recorded trams.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const modes = (listParam('modes') ?? ['tram']).filter((m) => MODES.includes(m));
const demo = new DemoSource();
let source: FleetSource = query.has('demo') ? demo : new HslSource(modes.length ? modes : ['tram'], listParam('routes') ?? []);

function status() {
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}
    ${source === demo ? `<button class="plain" data-action="leave">${t.leaveDemo}</button>` : ''}</span>`;
}

const modeParam = query.get('mode') as BoardMode | null;
const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  axis: query.get('axis') === 'groups' ? 'groups' : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-fleet-settings',
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError, noGroup: t.noGroup },
  onAction: (action) => { if (action === 'leave') leaveDemo(); },
  // Nothing answers: the panel covers the canvas; something does: the fleet.
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.vehicles.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintPanel();
  },
});

function use(src: FleetSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function leaveDemo() {
  query.delete('demo');
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  use(new HslSource(modes.length ? modes : ['tram'], listParam('routes') ?? []));
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

Object.assign(window, { pulseFleet: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
