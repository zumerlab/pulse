// How the object lives with Zumly: the options every board uses, the start
// inside a system on a phone, and the ways back Zumly does not offer.

import type { ZumlyOptions } from 'zumly';
import type Zumly from 'zumly';
import { PHONE } from './sizes.ts';

// Navigation recedes (the levels behind fade, see .z-view.is-previous-view in
// style.css); the object's layers never do. That keeps "previous level" apart
// from "channel behind". No filter on the views behind: a blurred view the
// size of the screen is filtered again on every frame it is drawn, and under
// the zoom that starved the raster of the view in front (tiles missing, the
// "black sectors" of 31/10).
export function zumlyOptions(views: ZumlyOptions['views'], initialView: string, mount: ZumlyOptions['mount'] = '#canvas'): ZumlyOptions {
  return {
    mount,
    initialView,
    views,
    transitions: {
      duration: '0.8s',
      ease: 'cubic-bezier(.2,.8,.2,1)',
      effects: ['none'],
      hideTrigger: 'fade',
    },
    // Going back: the button names where it goes (depthNav 'title'); a swipe
    // and a pinch move the view while the gesture lasts (gestures.follow).
    // Never the wheel: on a trackpad any two-finger movement over a view (an
    // inertial scroll past the end of a panel included) would start the
    // zoom-out scrub, and the blurred views behind, scaled up, took the
    // screen for a moment (31/10, Martin's recording). The dials and the
    // lists keep their own wheel.
    depthNav: { style: 'title' },
    inputs: { pinch: true, wheel: false },
    gestures: { follow: true },
    // On the phone, swiping sideways moves between systems (sibling views sys-*).
    // No Zumly bar: the mini-ring dots belong to the view. A gesture that starts
    // on the dial is not a swipe (Zumly ignores those born on a slider).
    lateralNav: PHONE ? { swipe: true, mode: 'auto', arrows: false, dots: false } : false,
  };
}

// On the phone, start inside a system: the board stays behind as the overview,
// a pinch or the back button away.
export async function startInside(app: Zumly, systemId: string, root: ParentNode = document) {
  const tile = root.querySelector<HTMLElement>(`.zoom-me[data-system="${systemId}"]`);
  if (!tile) return;
  tile.dataset.withDuration = '1ms';
  await app.zoomIn(tile);
  delete tile.dataset.withDuration;
}

// The ways back Zumly does not offer on its own. The trackpad's pinch reaches
// the page as a wheel with ctrl (the browser's zoom), and Pulse keeps Zumly's
// wheel off (zumlyOptions): pinching in over a view inside the board zooms out,
// once per pinch, and pinching out does nothing. On a touch screen the pinch
// is Zumly's (inputs.pinch), also when it is born on a dial or a list: a
// second finger cancels the drag (dialControls and the lists), so the touch
// end reaches Zumly. Returns the cleanup.
export function zoomOutGestures(app: Zumly, canvas: HTMLElement) {
  let acc = 0, cooldown = false;
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();     // never the browser's zoom over the object
    e.stopPropagation();    // nor the dial's or the list's own wheel
    if (e.deltaY <= 0) { acc = 0; return; }
    acc += e.deltaY;
    if (acc < 40 || cooldown) return;
    acc = 0;
    if (canvas.querySelectorAll('.z-view').length < 2) return;   // the board: nowhere back
    cooldown = true;
    setTimeout(() => { cooldown = false; }, 700);
    void app.zoomOut();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => canvas.removeEventListener('wheel', onWheel, { capture: true });
}
