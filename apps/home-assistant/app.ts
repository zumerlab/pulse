import { mountBoard, type BoardHandle, type BoardMode, type BoardSettings, type Look, type Status } from '@zumer/pulse';
import { hostOf } from './host.ts';
import type { PulseSource } from './source.ts';
import { t } from './strings.ts';

// The object over a PulseSource, mounted on an element: the core's board over
// the host `host.ts` makes of the source. The standalone app (`main.ts`)
// mounts it on the page with the WebSocket or a demo home; the card (`card/`)
// in its shadow root with the `hass` object. This file only translates the
// Home Assistant words (areas, entities) into the board's (groups, picks).

export { BOARD_MODES, DAYS, DIALS } from '@zumer/pulse';
export type { BoardMode, Look } from '@zumer/pulse';

export type PulseSettings = Omit<BoardSettings, 'groups' | 'picks'> & {
  // Only the entities in these areas (registry ids); nothing set: everywhere.
  areas?: string[];
  // The entity a channel follows instead of the first of its kind: { 'lights/brightness': 'light.kitchen' }.
  entities?: Record<string, string>;
};

export type PulseOptions = {
  source: PulseSource;
  // Which systems the object may show (default: all of model.ts); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Only what is in these areas (registry ids); the gear chooses among them.
  areas?: string[];
  // How the object draws (the gear's defaults): see Look.
  look?: Look;
  // Where the viewer's choices are kept: a localStorage key (default
  // 'pulse-ha-settings'); `false` hides the gear and keeps nothing.
  settings?: string | false;
  // The connection line of the board (HTML); the shell decides what it says.
  status?: (source: PulseSource) => string;
  // A button with `data-action` in that line was pressed.
  onAction?: (action: string) => void;
  onStatus?: (status: Status) => void;
};

export type PulseHandle = Omit<BoardHandle, 'host' | 'setHost' | 'settings' | 'setSettings'> & {
  readonly source: PulseSource;
  setSource(src: PulseSource): void;
  settings(): PulseSettings;
  setSettings(patch: PulseSettings): void;
};

const toBoard = ({ areas, entities, ...rest }: PulseSettings): BoardSettings => ({ ...rest, groups: areas, picks: entities });
const fromBoard = ({ groups, picks, ...rest }: BoardSettings): PulseSettings => ({ ...rest, areas: groups, entities: picks });

export function mountPulse(canvas: HTMLElement, options: PulseOptions): PulseHandle {
  let source = options.source;
  const board = mountBoard(canvas, {
    host: hostOf(source),
    systems: options.systems, mode: options.mode, start: options.start, groups: options.areas, look: options.look,
    settings: options.settings === false ? false : options.settings ?? 'pulse-ha-settings',
    status: options.status ? () => options.status!(source) : undefined,
    onAction: options.onAction, onStatus: options.onStatus,
    strings: {
      connecting: t.connecting, things: t.entitiesInHA, hostError: t.haError,
      groupsField: t.areasField, groupsHint: t.areasHint, pickFor: t.entityFor,
    },
  });
  return {
    app: board.app,
    get source() { return source; },
    setSource: (src) => { if (src === source) return; source = src; board.setHost(hostOf(src)); },
    settings: () => fromBoard(board.settings()),
    setSettings: (patch) => board.setSettings(toBoard(patch)),
    repaint: board.repaint,
    ready: board.ready,
    destroy: board.destroy,
    ui: board.ui,
    readings: board.readings,
  };
}
