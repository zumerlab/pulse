// The board's public shapes: its views and axes, what a viewer chooses (kept
// in the browser), how the object draws, and what a shell passes to mount it.

import type Zumly from 'zumly';
import type { PulseHost, Status } from '../model.ts';
import { DEFAULT_THEME, type Theme, type ThemeName } from '../themes.ts';
import type { t as T } from '../i18n.ts';
import type { Knob } from './knob.ts';

export type BoardMode = 'grid' | 'orbit' | 'layers' | 'list';
export const BOARD_MODES: BoardMode[] = ['grid', 'orbit', 'layers', 'list'];
// The axis the board groups by: its systems, or the host's groups (the rooms
// of a home, each with the systems' channels read within it; see PulseHost.byGroup).
export type Axis = 'systems' | 'groups';
export const AXES: Axis[] = ['systems', 'groups'];

// What a screen shows: the viewer's choices (the gear on the board), kept in
// the browser. The shell's `BoardOptions` are the frame they are made within.
export type BoardSettings = {
  systems?: string[];
  mode?: BoardMode;
  // The board grouped by system or by group.
  axis?: Axis;
  start?: string;
  // Only the things in these groups (the host's ids); nothing set: everywhere.
  groups?: string[];
  // Channels each system does not show: { lights: ['plugs'] }.
  channels?: Record<string, string[]>;
  // The thing a channel follows instead of the first of its kind: { 'lights/brightness': 'light.kitchen' }.
  picks?: Record<string, string>;
  // How the object draws: the dial as a full ring or open at the bottom with its ends; the day ring bare or with hour marks.
  look?: Look;
  // How many systems the Layers view stacks (the rest are named under the object); nothing set: all of them.
  layers?: number;
  // How many channels a system stacks as layers (the rest are named under the object); nothing set: three (two on a phone).
  stack?: number;
  // The calm systems shown even while something calls (folded by default).
  calm?: 'open';
};
// time: what the orbit's center shows of time (nothing; the changes of the last 12 h on its ring; the clock and the
// day while all is calm; or both). month: the energy month as a calendar (the 1st at the top) or the last 30 days (today at the top).
// theme: one of the object's, or 'custom' with the viewer's own colors (`colors`, over the default theme's).
export type Look = { dial?: 'full' | 'open'; day?: 'plain' | 'marks'; ends?: 'flat' | 'rounded'; theme?: ThemeName | 'custom';
  colors?: Partial<Theme>; time?: 'off' | 'changes' | 'clock' | 'both'; month?: 'calendar' | 'rolling';
  // The switch between grid, orbit, layers and list on the board itself (the gear always has it).
  modes?: 'shown' | 'hidden';
  // The ground behind everything: the theme's flat color, a glow (a spherical gradient of `glow` into the ground),
  // one of the three abstract grounds (`art`: drawn by the browser from the theme's own colors, so they weigh nothing),
  // or a photo (`photo`: an address, or 'upload' for the one chosen in this browser), dimmed toward the ground and blurred.
  ground?: 'flat' | 'glow' | 'art' | 'photo'; glow?: string; art?: Art; photo?: string; dim?: number; blur?: number;
  // Over a glow or a photo, the faces of the systems: solid, or glass (see-through and blurred).
  faces?: 'solid' | 'glass' };
export type LookFull = Required<Omit<Look, 'colors'>> & Pick<Look, 'colors'>;
// The gear's tabs.
export const SETTINGS_TABS = ['content', 'board', 'look', 'tune'] as const;
export type Tab = typeof SETTINGS_TABS[number];
export const DIALS = ['full', 'open'] as const, DAYS = ['plain', 'marks'] as const, ENDS = ['flat', 'rounded'] as const;
export const GROUNDS = ['flat', 'glow', 'art', 'photo'] as const, FACES = ['solid', 'glass'] as const;
// The abstract grounds: veils of color, fine lines from a corner, a vignette with film grain.
export const ARTS = ['aurora', 'contours', 'grain'] as const;
export type Art = typeof ARTS[number];
export const TIMES = ['off', 'changes', 'clock', 'both'] as const, MONTHS = ['calendar', 'rolling'] as const;
export const LOOK_DEFAULT: LookFull = { dial: 'full', day: 'plain', ends: 'flat', theme: DEFAULT_THEME, time: 'off', month: 'calendar', modes: 'hidden',
  ground: 'flat', glow: '#4f7cac', art: 'aurora', photo: '', dim: 0.45, blur: 0, faces: 'glass' };

export type Strings = typeof T;

export type BoardOptions = {
  host: PulseHost;
  // Which systems the object may show (default: all of the host's); unknown ids are ignored.
  systems?: string[];
  // The board's view when it opens, until the viewer picks another on this browser.
  mode?: BoardMode;
  // The board grouped by system (default) or by group, until the viewer picks the other.
  axis?: Axis;
  // Start inside this system (the board stays behind, one step out).
  start?: string;
  // Only what is in these groups (the host's ids); the gear chooses among them.
  groups?: string[];
  // How the object draws (the gear's defaults): see Look.
  look?: Look;
  // How many systems the Layers view stacks by default; nothing set: all of them.
  layers?: number;
  // How many channels a system stacks as layers by default; nothing set: three (two on a phone).
  stack?: number;
  // Where the viewer's choices are kept: a localStorage key (default
  // 'pulse-settings'); `false` hides the gear and keeps nothing.
  settings?: string | false;
  // The connection line of the board (HTML); the shell decides what it says.
  status?: () => string;
  // A button with `data-action` in that line was pressed.
  onAction?: (action: string) => void;
  // A way out of the host (sign out, leave the demo): an icon next to the gear, `data-action="signout"`.
  exit?: () => string | null;
  onStatus?: (status: Status) => void;
  // A round screen: the canvas is the circle inscribed in its box and every view keeps inside it (the way
  // back at the bottom of the circle, no gear, no corners). Opens on the orbit unless `mode` says otherwise,
  // and keeps no choices in the browser unless `settings` names where.
  round?: boolean;
  // Handled with one knob: the arrows and the wheel turn, Enter and Space press, a long press or Escape
  // goes back (see knob.ts). Without it the knob is still there to be driven by code: `BoardHandle.knob`.
  knob?: boolean;
  // The shell's words over the object's (what the host calls its things, its groups, its errors).
  strings?: Partial<Strings>;
};

export type BoardHandle = {
  app: Zumly;
  readonly host: PulseHost;
  // Another host with the same systems (a demo instead of the live one).
  setHost(host: PulseHost): void;
  settings(): BoardSettings;
  setSettings(patch: BoardSettings): void;
  repaint(): void;
  // The object by one knob, for an input the browser does not bring as keys or a wheel (a GPIO encoder, a message).
  knob: Knob;
  ready: Promise<unknown>;
  destroy(): void;
  ui: unknown;
  readings(): unknown;
};
