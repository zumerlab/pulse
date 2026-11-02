// The object's measures: how many layers, how much each grows, the strokes,
// the lane (a twelfth of the radius) every thickness is counted in, and how
// much the object scales to fill its stage. Decided on load, phone or not.

// On a phone you look at one system at a time: two visible layers and less
// growth between layers. Decided on load.
export const PHONE = matchMedia('(max-width: 600px)').matches;
export const GROW = PHONE ? 0.24 : 0.42;                   // --o-depth-grow
export const SIZE = Array.from({ length: PHONE ? 2 : 3 }, (_, d) => 1 + GROW * d);
export const STROKE = [6, 3, 2.5];                         // apparent stroke per depth, px
// A system may stack more layers than SIZE's (the viewer chooses, up to this):
// each one GROW bigger than the one in front, the strokes thinner behind.
export const STACK_MAX = PHONE ? 3 : 5;
export const sizes = (n: number) => Array.from({ length: Math.max(1, Math.min(n, STACK_MAX)) }, (_, d) => 1 + GROW * d);
export const strokeAt = (d: number) => STROKE[Math.min(d, STROKE.length - 1)];
export const LOCK_MS = 800;                                // controls locked after a layer change
export const UNIVERSE = 240;                               // px; one lane is radius / 12 = 10 px
export const LANE = UNIVERSE / 2 / 12;
export const ZOOM = { calm: PHONE ? 1.1 : 1.2, alert: 1.35 };   // --zoom of .obj (see .stage[data-zoom])

// How much the object scales to fill its stage (--fit): calm, the outermost
// visible layer touches the shorter side; in an alert, the front disc at its
// zoom does. Never below half nor past 1.5, so a wall panel gets a big object
// and a narrow phone a whole one.
export function fitFor(width: number, height: number, alert: boolean, layers = SIZE.length) {
  const side = Math.min(width, height);
  const extent = alert ? UNIVERSE * ZOOM.alert : UNIVERSE * (1 + GROW * (Math.max(1, layers) - 1)) * ZOOM.calm;
  return Math.min(1.5, Math.max(0.5, side / extent));
}

// A mini ring (a tile, a list item) and a dot of the phone, in lanes.
export const MINI_LANES = 6 / 3.5;
export const DOT_LANES = 2.5 / (22 / 24);
