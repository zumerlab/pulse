import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { DEFAULT_PLACE, LiveSource, type IssSource, type Place } from './source.ts';
import { t } from './strings.ts';

// The ISS app: the station from NASA's public telemetry, its position and
// crew, the launches coming up. No server, no sign-in. `?at=lat,lon&place=Name`
// says where "from you" is measured (`Use my location` asks the browser);
// `?demo` opens a recorded pass.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };

const placeOf = (): Place => {
  const at = query.get('at')?.split(',').map(Number);
  const known = at && at.length === 2 && at.every(Number.isFinite);
  return known ? { lat: at[0], lon: at[1], name: query.get('place') ?? `${at[0].toFixed(2)}, ${at[1].toFixed(2)}` } : { ...DEFAULT_PLACE, name: query.get('place') ?? DEFAULT_PLACE.name };
};
const demo = new DemoSource();
let source: IssSource = query.has('demo') ? demo : new LiveSource(placeOf());

function status() {
  const failing = source.failed.length && source.status === 'live' ? ` · <span class="conn-failing">${esc(source.failed.join(', '))} not answering</span>` : '';
  const here = source === demo || !('geolocation' in navigator) ? '' : `<button class="plain" data-action="here">${t.useLocation}</button>`;
  return `<span class="conn conn-${source.status}"><span class="conn-dot"></span>${esc(source.label)} · ${t.status[source.status]}${failing}
    ${source === demo ? `<button class="plain" data-action="leave">${t.leaveDemo}</button>` : here}</span>`;
}

const modeParam = query.get('mode') as BoardMode | null;
const board = mountBoard(canvas, {
  host: hostOf(source),
  systems: listParam('systems'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  start: query.get('start') ?? undefined,
  settings: 'pulse-iss-settings',
  // A control room: the deep theme over a faint blue glow, glass faces, open dials with rounded ends.
  look: { theme: 'deep', ground: 'glow', glow: '#14325c', faces: 'glass', dial: 'open', ends: 'rounded' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError, noGroup: t.noGroup },
  onAction: (action) => { if (action === 'leave') leaveDemo(); else if (action === 'here') useHere(); },
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.samples.size && !source.position);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintPanel();
  },
});

function use(src: IssSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
// "From you" measured from the browser's position.
function useHere() {
  navigator.geolocation.getCurrentPosition((pos) => {
    query.set('at', `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`);
    query.set('place', t.here);
    history.replaceState(null, '', `${location.pathname}?${query}`);
    use(new LiveSource(placeOf()));
  });
}
function leaveDemo() {
  query.delete('demo');
  history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  use(new LiveSource(placeOf()));
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

Object.assign(window, { pulseIss: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
