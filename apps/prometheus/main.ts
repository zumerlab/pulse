import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { BOARD_MODES, esc, mountBoard, type BoardMode } from '@zumer/pulse';
import { NODE_EXPORTER, type FleetConfig } from './config.ts';
import { DemoSource } from './demo/source.ts';
import { hostOf } from './host.ts';
import { HttpSource, lastAlertmanager, lastServer, loadConfig, remember, type PromSource } from './source.ts';
import { t } from './strings.ts';

// The Prometheus app: a fleet of hosts read with PromQL, with the connect
// panel in front while nothing answers. `?server=http://host:9090` says
// which Prometheus, `?alertmanager=http://host:9093` lets the alerts be
// silenced, `?config=url` loads systems and channels of your own (the
// default is a fleet of node_exporter hosts); `?demo` opens the hosts that
// are not there.

const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const connectSlot = document.querySelector<HTMLElement>('#connect')!;
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const demo = new DemoSource();
let config: FleetConfig = NODE_EXPORTER, configError = '';
try { config = await loadConfig(query.get('config')); } catch (error) { configError = t.errConfig(query.get('config') ?? '', error instanceof Error ? error.message : String(error)); }
let source: PromSource = query.has('demo') ? demo : new HttpSource(query.get('server') ?? lastServer(), query.get('alertmanager') ?? lastAlertmanager(), config);

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
  settings: 'pulse-prometheus-settings',
  // An operator's screen: the deep theme on a flat ground, hour marks on the day rings.
  look: { theme: 'deep', day: 'marks' },
  status,
  strings: { connecting: t.connecting, things: t.things, hostError: t.hostError, noGroup: t.noGroup },
  onAction: (action) => { if (action === 'disconnect') disconnect(); },
  onStatus: (s) => {
    const out = s === 'signed-out' || (s === 'error' && !source.series.size && !source.targets.size);
    shell.classList.toggle('disconnected', out);
    connectSlot.hidden = !out;
    if (out) paintConnect();
  },
});

function use(src: PromSource) {
  if (src !== source) { source.stop(); source = src; board.setHost(hostOf(src)); }
  src.start();
}
function disconnect() {
  const q = new URLSearchParams(location.search);
  q.delete('demo'); q.delete('server'); q.delete('alertmanager');
  history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
  source.stop();
  shell.classList.add('disconnected');
  connectSlot.hidden = false;
  paintConnect();
}

// The connect panel: which Prometheus, which Alertmanager, or the demo.
function paintConnect() {
  const url = source instanceof HttpSource ? source.url : lastServer(), am = source instanceof HttpSource ? source.alertmanager : lastAlertmanager();
  connectSlot.innerHTML = `<form class="connect">
    <h1>Pulse</h1>
    <p class="connect-lead">${t.connectLead}</p>
    ${source.status === 'error' && source.error ? `<p class="error">${esc(source.error)}</p>` : ''}
    ${configError ? `<p class="error">${esc(configError)}</p>` : ''}
    <label>${t.serverField}<input name="url" type="url" value="${esc(url)}" required></label>
    <p class="connect-hint">${t.serverHint}</p>
    <label>${t.alertmanagerField}<input name="alertmanager" type="url" value="${esc(am)}"></label>
    <p class="connect-hint">${t.alertmanagerHint}</p>
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
  const url = String(data.get('url') ?? '').trim().replace(/\/+$/, ''), am = String(data.get('alertmanager') ?? '').trim().replace(/\/+$/, '');
  if (!url) return;
  remember(url, am);
  const q = new URLSearchParams(location.search);
  q.set('server', url); if (am) q.set('alertmanager', am); else q.delete('alertmanager');
  history.replaceState(null, '', `${location.pathname}?${q}`);
  use(new HttpSource(url, am, config));
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

Object.assign(window, { pulsePrometheus: { app: board.app, get source() { return source; }, demo, ui: board.ui, readings: board.readings } });
