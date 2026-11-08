import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import { mountBoard } from '@zumer/pulse';
import { Greenhouse } from './source.ts';
import { hostOf } from './host.ts';

// The greenhouse of the tutorial (docs/tutorial.html): a simulated greenhouse
// as three Pulse objects. `npm run dev`, then /greenhouse/.

const greenhouse = new Greenhouse();

const board = mountBoard(document.querySelector<HTMLElement>('#canvas')!, {
  host: hostOf(greenhouse),
  settings: 'pulse-greenhouse-settings',
  look: { theme: 'night', ground: 'glow' },
  status: () => `<span class="conn conn-${greenhouse.status}"><span class="conn-dot"></span>Greenhouse · ${greenhouse.status}</span>`,
  strings: { things: 'In the greenhouse', connecting: 'Reading the greenhouse…' },
});

await board.ready;
greenhouse.start();

// For the console: `greenhouse.set('tank.level', 9)` empties the tank,
// `greenhouse.set('air.temperature', 33)` warms the air.
Object.assign(window, { greenhouse, board });
