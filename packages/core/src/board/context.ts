// One mounted board: everything its parts share. The modules of the board
// (settings, state, the views, the gear) are functions of it; mount.ts makes
// one and wires it to a host and to Zumly. Fields that change over the
// board's life (the host, the viewer's choices, the readings) are always read
// through the board, never kept in a local.

import type Zumly from 'zumly';
import type { ViewContext } from 'zumly';
import type { Action, Channel, CodeFormat, PulseHost, Reading, StateChange, System } from '../model.ts';
import type { ScrollState } from '../radial/index.ts';
import type { Axis, BoardMode, BoardOptions, BoardSettings, Look, Strings, Tab } from './types.ts';

export type View = (ctx: ViewContext) => void;
// A channel and what it read.
export type Item = { ch: Channel; r: Reading };

// What the shell allows (a card's config, the page's URL). The viewer chooses
// within it with the gear; that choice is kept per browser.
export type Frame = {
  systems: string[]; mode?: BoardMode; start?: string; axis?: Axis; groups?: string[];
  look?: Look; layers?: number; stack?: number;
};

// A code being entered for actions that ask for one: the keypad is over the object meanwhile.
export type Code = { key: string; acts: Action[]; title: string; verb: string; format: CodeFormat; value: string; wrong: boolean; level?: 1 | 2 };
// What a system's view remembers between paints.
export type Ui = {
  pick: string | null;                 // channel chosen by hand
  code: Code | null;                   // the keypad open on a channel
  since: Map<string, number>;          // when each alert appeared (rule 1: stable)
  sig: Map<string, string>;            // what each alert says: if it changes, it is no longer seen
  seen: Set<string>;                   // alerts marked as seen (no wave, they go behind)
};
export type LogLine = { at: Date; text: string; level: number; id?: string; system?: string };

export type Board = {
  // ─── Fixed for the board's life ───
  canvas: HTMLElement;
  options: BoardOptions;
  t: Strings;                          // the object's words, with the shell's over them
  // The systems by id: the host's, and its groups as systems once it names
  // them. Another host (setHost) brings its own channels under the same ids.
  sys: Record<string, System>;
  all: string[];                       // the host's system ids
  frame: Frame;
  store: string | null;                // the localStorage key of the viewer's choices; null: no gear
  views: Record<string, View>;         // what Zumly zooms between; the groups join as the host names them
  app: Zumly;

  // ─── The host and what the viewer chose ───
  host: PulseHost;
  local: BoardSettings;                // the viewer's choices, as kept
  ids: string[];                       // the systems on the board (or the groups, on that axis)
  chosen: string[];                    // the systems chosen; on the groups axis, what each group is made of
  objects: string[];                   // the objects opened from a segment or a row (Seg.to), the latest first: read with the rest
  mode: BoardMode;
  axis: Axis;

  // ─── Readings and actions ───
  ui: Record<string, Ui>;
  readings: Record<string, Map<string, Item>>;
  // Every channel with something to show, hidden ones included: what the gear lists.
  channels: Record<string, (Item & { hidden: boolean })[]>;
  pending: Map<string, number>;        // things with an action sent and not confirmed
  // Actions the host refused, by thing: a red outline and a Retry until a
  // retry goes through or the thing changes anyway.
  failed: Map<string, { acts: Action[]; message: string }>;
  hold: Map<string, { value: number; until: number }>;   // dial values the viewer is moving
  log: LogLine[];                      // what this session saw change, the newest first
  toast: string;
  loaded: boolean;                     // the host went live once (the log runs from then)
  rerender: Set<() => void>;           // each view's paint

  // ─── What the views keep ───
  boardPick: string | null;            // the system brought to the front of the layers by hand
  listFocus: string | null;            // the system in the list's center (null: the most serious)
  orbitPage: number;                   // past twelve systems, which eleven the orbit shows (0: the most urgent)
  hubAt: number;                       // which open alert the orbit's face shows
  tab: Tab;                            // the gear's tab last open
  scrolls: Map<string, ScrollState>;   // each scrolling list: first item shown, focus
  scrollOpened: Set<string>;

  // ─── What the host is asked for once in a while ───
  months: Map<string, { values: (number | null)[]; at: number; error?: boolean }>;
  monthLoading: Set<string>;
  pastChanges: { at: number; changes: Record<string, StateChange[]> } | null;
  pastLoading: boolean;
  histories: Map<string, { at: number; values: (number | null)[] | null; error?: boolean }>;
  dayChanges: Map<string, { at: number; changes: Record<string, StateChange[]> | null; error?: boolean }>;

  // ─── Set by mount.ts, so the parts below call up without importing it ───
  repaint(): void;
  systemView(id: string): View;
};
