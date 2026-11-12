// The board over a host: mountBoard and the shapes a shell passes to it. The
// parts behind it (settings, state, the views, the gear) stay inside the core.

export { mountBoard } from './mount.ts';
export { KNOB_HOLD_MS, type Knob } from './knob.ts';
export {
  ARTS, AXES, BOARD_MODES, DAYS, DIALS, ENDS, FACES, GROUNDS, MONTHS, SETTINGS_TABS, TIMES,
  type Art, type Axis, type BoardHandle, type BoardMode, type BoardOptions, type BoardSettings, type Look, type Strings,
} from './types.ts';
