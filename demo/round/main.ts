import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import { mountBoard } from '@zumer/pulse';
import { Greenhouse } from '../greenhouse/source.ts';
import { hostOf } from '../greenhouse/host.ts';

// The tutorial's greenhouse on a round screen, handled with one knob: what a
// Raspberry Pi shows in a kiosk on a round display with an encoder beside it.
// `npm run dev`, then /round/. The arrows or the wheel turn, Enter presses,
// Enter held (or Escape) goes back.

const greenhouse = new Greenhouse();

const board = mountBoard(document.querySelector<HTMLElement>('#canvas')!, {
  host: hostOf(greenhouse),
  round: true,
  knob: true,
  look: { theme: 'night', ground: 'glow', time: 'clock' },
  strings: { things: 'In the greenhouse', connecting: 'Reading the greenhouse…' },
});

await board.ready;
greenhouse.start();

// For the console, and for an encoder that arrives some other way:
// `board.knob.turn(1)`, `board.knob.press()`, `board.knob.back()`.
Object.assign(window, { greenhouse, board });
