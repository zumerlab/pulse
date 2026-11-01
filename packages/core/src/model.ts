// The contract between the object and whoever feeds it. The board knows
// nothing about where the states come from: a host turns its own data (a
// home, a machine, a shop, a fleet) into systems with channels, each channel
// read into a Reading with a level of urgency, and runs the actions the board
// hands back. Every "thing" a reading depends on is an opaque id: the board
// uses it to mark what was sent and not confirmed, to log changes and to ask
// the host for names, states and a day of history.

import type { Tone } from './radial.ts';

export type Level = 1 | 2;

// Something the host can do. The board only looks at `ids`: the things the
// action touches, which beat ("sending") until the host reports them changed.
// The rest is the host's own (a service call, an HTTP request).
export type Action = { ids: string[] } & Record<string, unknown>;

export type Seg = { label: string; on: boolean; id: string; act?: Action };
export type Dial = {
  min: number; max: number; step: number; unit: string; label: string;
  value: number; id: string; set: (value: number) => Action;
};
// A dial with two ends (a comfort range): the band goes from lo to hi.
export type Range = { lo: number; hi: number; set: (lo: number, hi: number) => Action };
// A hue and saturation (null when off or white), and how to set them.
export type Color = { hs: [number, number] | null; id: string; set: (h: number, s: number) => Action };
export type Alert = {
  level: Level; big: string; label: string; why: string;
  verb: string; acts: Action[];     // without acts, the verb only marks the alert as seen
  busy?: boolean;                   // already being resolved: no button until the host confirms
  fail?: number[];                  // segments painted in the alert color
};
// A ring of the detail's timeline: when the thing's state counted as on, and whether it is now.
export type TrackSpec = { id: string; on: (state: string) => boolean; now: boolean; tone?: Tone; act?: Action };
// A moment worth a word on the timeline: since the thing last changed.
export type Event = { id: string; text: string; tone?: Tone };
export type Picture = { src: string; alt: string; id: string; live?: boolean };   // live: ask again every few seconds

export type Reading = {
  kind: 'p' | 's' | 'c';            // the object's primitives: a band, switches, a choice
  v?: number;                       // progress 0..1
  segs?: Seg[];
  dial?: Dial;
  range?: Range;
  now?: number;                     // the measurement, in the dial's units, when the band is a target
  big: string; label: string;
  name?: string;                    // replaces the channel's name when it follows one thing
  alert?: Alert;
  ids: string[];                    // the things it depends on (detail, "sending", the log)
  image?: Picture;                  // a picture for the face (a relative URL: the host resolves it)
  tint?: string;                    // CSS color of what is on (a light's color)
  color?: Color;
  history?: string;                 // a numeric thing worth a day's ring in the detail
  tracks?: TrackSpec[];             // things worth a day each in the detail, as rings (outermost first)
  events?: Event[];
  choice?: string;                  // a channel that follows one thing: the one it follows…
  choices?: string[];               // …and the others it could (the gear offers them)
};

// What the board tells a channel when it reads: the groups in force (only
// what is in them counts; null: everywhere) and the viewer's picks
// ('system/channel' → the thing the channel should follow).
export type ReadContext = { groups: string[] | null; picks: Record<string, string> };
export type Channel = { key: string; name: string; glyph: string; read: (ctx: ReadContext) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

// signed-out: no credentials. The rest follow the connection.
export type Status = 'signed-out' | 'connecting' | 'live' | 'offline' | 'error';
// A thing that changed. `logged`: its state changed (worth a line in the
// ticker), not just a detail of it.
export type Changed = { id: string; logged: boolean };
// A state history as the moments it changed: `ago` in hours, oldest first.
export type StateChange = { state: string; ago: number };
// A group of things the gear can filter by (areas by floor in a home; hosts, volumes…).
export type Group = { title: string; items: { id: string; name: string }[] };

export interface PulseHost {
  readonly status: Status;
  readonly error: string;         // why, when status is 'error'
  readonly hasData: boolean;      // something to show already (before 'live')
  readonly systems: System[];
  onChange(fn: (changed: Changed[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  // Something structural changed (groups, names): repaint.
  onStructure?(fn: () => void): () => void;
  act(a: Action): Promise<unknown>;
  // Words for a thing: its name, and its state as text (the log, the detail).
  nameOf(id: string): string;
  stateOf(id: string): string;
  // When it last changed (ms since the epoch), for the timeline's events and the ticker.
  changedAt?(id: string): number | undefined;
  // Where a thing is, when that tells it apart from another with its name (the gear's lists).
  whereIs?(id: string): string | undefined;
  // The unit of a numeric thing (the day ring).
  unitOf?(id: string): string;
  // Resolves a picture's relative URL against the host.
  url(path: string): string;
  // A live stream of a picture, when the host can serve one.
  stream?(id: string): string | undefined;
  // A numeric thing's last `hours` hours as one value per hour, oldest first.
  history?(id: string, hours: number): Promise<(number | null)[]>;
  // The last `hours` hours of these things as the moments their state changed.
  changes?(ids: string[], hours: number): Promise<Record<string, StateChange[]>>;
  // The groups the gear offers, in the order to show them.
  groups?(): Group[];
}
