import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import './style.css';
import { WebSocketSource, type PulseSource } from './source.ts';
import { DemoSource } from './demo/source.ts';
import { mountLogin } from './login.ts';
import { BOARD_MODES, mountPulse, type BoardMode } from './app.ts';
import { mountTunePanel } from '@zumer/pulse';
import { t } from './strings.ts';

// The standalone app: the object (`app.ts`) on the page, over Home Assistant's
// WebSocket (`source.ts`) or over one of the demo homes (`demo/`), with the
// sign-in panel in front while there is no source.

const socket = new WebSocketSource();
const demo = new DemoSource();
const shell = document.querySelector<HTMLElement>('.shell')!;
const canvas = document.querySelector<HTMLElement>('#canvas')!;
const loginSlot = document.querySelector<HTMLElement>('#login')!;

function status(ha: PulseSource) {
  return `<span class="conn conn-${ha.status}"><span class="conn-dot"></span>Home Assistant${ha.version ? ` ${ha.version}` : ''} · ${t.status[ha.status]}
    <button class="plain" data-action="signout">${ha === demo ? t.leaveDemo : t.signOut}</button></span>`;
}

// `?systems=lights,climate&mode=orbit&start=climate&areas=kitchen,living_room`
// fixes what the page shows (a kiosk, a shared link); the gear chooses within that.
const query = new URLSearchParams(location.search);
const listParam = (name: string) => { const v = query.get(name)?.split(',').map((s) => s.trim()).filter(Boolean); return v?.length ? v : undefined; };
const modeParam = query.get('mode') as BoardMode | null;

const pulse = mountPulse(canvas, {
  source: socket,
  systems: listParam('systems'),
  areas: listParam('areas'),
  mode: modeParam && BOARD_MODES.includes(modeParam) ? modeParam : undefined,
  start: query.get('start') ?? undefined,
  status,
  onAction: (action) => { if (action === 'signout') void leave(); },
  // Signed out: the login covers the canvas; signed in: the object.
  onStatus: (s) => {
    const out = s === 'signed-out';
    shell.classList.toggle('signed-out', out);
    loginSlot.hidden = !out;
  },
});

// A demo home opens from the sign-in panel or from `?demo=<home>`, a link that
// can be shared; leaving it goes back to the sign-in (or to the saved session).
let resumed = false;
function startDemo(homeId: string) {
  pulse.setSource(demo);
  const q = new URLSearchParams(location.search);
  q.set('demo', homeId);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  void demo.start(homeId);
}
async function leave() {
  if (pulse.source !== demo) { await socket.signOut(); return; }
  demo.stop(false);
  pulse.setSource(socket);
  history.replaceState(null, '', location.pathname);
  if (!resumed) { resumed = true; await socket.resume(); }
}
mountLogin(loginSlot, socket, startDemo);

await pulse.ready;
mountTunePanel();
const wanted = new URLSearchParams(location.search).get('demo');
if (wanted) startDemo(wanted);
else { resumed = true; await socket.resume(); }

Object.assign(window, { pulseHA: { app: pulse.app, get ha() { return pulse.source; }, demo, ui: pulse.ui, readings: pulse.readings } });
