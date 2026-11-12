# The Pulse contract, field by field

Taken from `src/model.ts`, `src/board/types.ts` and `src/radial/` of `@zumer/pulse` 0.1.x. The type declarations in `node_modules/@zumer/pulse/dist/` are the authority; everything here is exported from `@zumer/pulse`.

## System, Channel, ReadContext

```ts
type System = { id: string; title: string; channels: Channel[] };
type Channel = { key: string; name: string; glyph: string; read: (ctx: ReadContext) => Reading | null };
type ReadContext = { groups: string[] | null; picks: Record<string, string> };
```

- `glyph` is the `d` of an SVG path on a 24×24 grid.
- `ctx.groups` are the group ids in force (`null`: everywhere). `ctx.picks` maps `'system/channel'` to the thing the viewer chose for a channel that follows one thing. A host without groups or picks can ignore `ctx`.

## Reading

```ts
type Reading = {
  kind: 'p' | 's' | 'c';      // a band, switches, a choice
  big: string; label: string; // the face: the value and one line
  ids: string[];              // the things it depends on
  v?: number;                 // 'p': progress 0..1
  segs?: Seg[];               // 's' and 'c'
  dial?: Dial;                // 'p': draggable
  range?: Range;              // 'p': two knobs
  now?: number;               // the measurement, in the dial's units, when the band is a target
  name?: string;              // replaces the channel's name when it follows one thing
  alert?: Alert;
  tint?: string;              // CSS color of what is on (a light's color)
  bearing?: number;           // degrees clockwise from the top: a mark on the ring
  // Detail content: any of these gives the channel a detail one level deeper.
  history?: string;           // a numeric thing's id: its last 24 h as a ring (host.history)
  tracks?: TrackSpec[];       // a day per thing as concentric rings (host.changes)
  events?: Event[];           // moments named on the timeline
  image?: Picture;            // a picture in the face and the detail
  color?: Color;              // a hue and saturation wheel
  list?: Seg[];               // every option of a long choice, as a scrolling list
  month?: string;             // a meter's id: this month as a calendar (host.statistics)
  plots?: Plot[]; radar?: RadarSpec;   // things around a point: a radar in the face
  globe?: GlobeSpec;          // things on the Earth: the disc as a globe
  map?: MapSpec;              // things on a tiled map; its detail is the map, big
  link?: Seg;                 // a button out to the thing elsewhere
  to?: string;                // the face opens this thing's own object (host.objectOf) instead of a detail
  choice?: string; choices?: string[]; // the thing a channel follows, and the others the gear offers
};
```

```ts
type Seg = { label: string; on: boolean; id: string; act?: Action; to?: string; detail?: string; level?: 1 | 2 };
type Dial = { min: number; max: number; step: number; unit: string; label: string; value: number; id: string; set: (value: number) => Action };
type Range = { lo: number; hi: number; set: (lo: number, hi: number) => Action };
type Color = { hs: [number, number] | null; id: string; set: (h: number, s: number) => Action };
type Picture = { src: string; alt: string; id: string; live?: boolean; video?: string };
type TrackSpec = { id: string; on: (state: string) => boolean; now: boolean; tone?: 'warn' | 'critical'; act?: Action };
type Event = { id: string; text: string; tone?: 'warn' | 'critical' };
```

- In a choice (`'c'`), `on` marks the option chosen. In switches (`'s'`), off is dim.
- `Seg.to` names a thing with an object of its own: tapping the segment or row zooms into `host.objectOf(to)`.
- `Picture.src` may be relative: the board resolves it with `host.url`. `live: true` asks for the still again every few seconds. `video` is an HLS stream (`.m3u8`) or a video file, played muted over the still.

## Alert

```ts
type Alert = {
  level: 1 | 2;               // 1 minor, 2 critical
  big: string; label: string; // the face while it calls
  why: string;                // one sentence: the strip, the board's headline, the log
  verb: string;               // the button
  acts: Action[];             // what the verb does; empty: the verb only marks it as seen
  key?: string;               // stable identity when big or why carry a drifting value
  busy?: boolean;             // already being resolved: no button until the host confirms
  fail?: number[];            // indexes of the segments painted in the alert color
};
```

The board orders alerts: the one in front stays until a more serious one displaces it; a critical alert that appears while the board is showing opens its system on its own; a seen alert goes behind and comes back if its text (or `key`) changes.

## Action

```ts
type Action = { ids: string[]; asks?: 'number' | 'text' | 'words'; code?: string; hint?: string } & Record<string, unknown>;
```

The board only reads `ids` (what beats as "sending") and `asks`. Everything else is yours: put whatever `host.act` needs (a service name, a topic, a value). With `asks: 'number'` or `'text'` the board opens a keypad and calls `act` again with `code`; with `'words'` it opens a text input, using `hint` as the prompt, and the words come back in `code`.

## PulseHost

| Member | Required | What it is |
|---|---|---|
| `status` | yes | `'signed-out' \| 'connecting' \| 'live' \| 'offline' \| 'error'` |
| `error` | yes | Why, when `status` is `'error'` |
| `hasData` | yes | There is something to show already, before `'live'` |
| `systems` | yes | The systems, their channels bound to your state |
| `onChange(fn)` | yes | Call `fn([{ id, logged }])` when things change; returns an unsubscribe function |
| `onStatus(fn)` | yes | Call `fn()` when `status` changes; returns an unsubscribe function |
| `act(action)` | yes | Runs an action; resolve when accepted, reject (with an `Error`) when refused |
| `nameOf(id)`, `stateOf(id)` | yes | A thing's name, and its state as text |
| `url(path)` | yes | Resolves a picture's relative URL; `(path) => path` when there are none |
| `onStructure(fn)` | no | Something structural changed (groups, names): the board repaints |
| `changedAt(id)` | no | When it last changed, ms since the epoch |
| `whereIs(id)`, `unitOf(id)` | no | Where a thing is; the unit of a numeric thing |
| `stream(id)` | no | A live stream of a picture |
| `history(id, hours)` | no | A promise of one value per hour, oldest first (`null` for a gap) |
| `changes(ids, hours)` | no | A promise of `{ [id]: { state, ago }[] }`, `ago` in hours, oldest first |
| `statistics(id, days?)` | no | A promise of one value per day of this month, or of the last `days` days |
| `groups()` | no | `{ title, items: { id, name }[] }[]`: what the gear can filter by |
| `byGroup(chosen, hidden, noGroup)` | no | The board's second axis: one `System` per group |
| `objectOf(id)` | no | The `System` of one thing named by `Seg.to` or `Reading.to`, or `null` |
| `language` | no | A BCP 47 tag for numbers and times |

`hourly(rows, hours)`, `changesOf(rows, hours)` and `spansOf(changes, on)` turn rows of `{ s: state, lu: secondsSinceEpoch }` into what `history` and `changes` return.

## BoardOptions and BoardHandle

```ts
type BoardOptions = {
  host: PulseHost;
  systems?: string[];          // which systems the board may show (default: all); unknown ids are ignored
  mode?: 'grid' | 'orbit' | 'layers' | 'list';
  axis?: 'systems' | 'groups'; // 'groups' needs host.byGroup
  start?: string;              // open inside this system
  groups?: string[];           // only what is in these groups
  look?: Look;
  layers?: number;             // how many systems the Layers view stacks
  stack?: number;              // how many channels a system stacks (default 3, 2 on a phone)
  settings?: string | false;   // localStorage key (default 'pulse-settings'); false: no gear, nothing kept
  status?: () => string;       // HTML of the connection line
  onAction?: (action: string) => void;   // a button with data-action in that line was pressed
  exit?: () => string | null;  // a way out next to the gear (data-action="signout")
  onStatus?: (status: Status) => void;
  strings?: Partial<Strings>;  // overrides for the dictionary `t`
};
```

`mode`, `axis`, `start`, `look`, `layers` and `stack` are defaults: once the viewer picks something in the gear, that browser keeps its own choice under the `settings` key.

```ts
type Look = {
  theme?: 'graphite' | 'paper' | 'deep' | 'slate' | 'mist' | 'fog' | 'night' | 'custom';
  colors?: Partial<Theme>;     // with theme 'custom': bg, ink, muted, dim, line, minor, critical
  dial?: 'full' | 'open'; day?: 'plain' | 'marks'; ends?: 'flat' | 'rounded';
  time?: 'off' | 'changes' | 'clock' | 'both'; month?: 'calendar' | 'rolling';
  modes?: 'shown' | 'hidden';  // the view switch on the board itself
  ground?: 'flat' | 'glow' | 'art' | 'photo'; glow?: string; art?: 'aurora' | 'contours' | 'grain';
  photo?: string; dim?: number; blur?: number;
  faces?: 'solid' | 'glass';
};
```

The handle: `app` (the Zumly instance), `host`, `setHost(host)` (another host with the same systems), `settings()`, `setSettings(patch)`, `repaint()`, `ready` (a promise), `destroy()`.

## Radar, globe and map

```ts
type Plot = { bearing: number; range: number; label: string; id?: string; on?: boolean; tone?: 'warn' | 'critical'; course?: number; vector?: number };
type RadarSpec = { rings?: { at: number; label: string }[]; course?: number; vector?: number };
type GeoPlot = { lat: number; lon: number; label: string; id?: string; on?: boolean; tone?: 'warn' | 'critical'; size?: number; course?: number };
type GlobeSpec = { center?: { lat: number; lon: number }; plots: GeoPlot[]; land?: [number, number][][] };
type MapSpec = { center: { lat: number; lon: number }; zoom: number; plots: GeoPlot[]; tiles?: string; attribution?: string };
```

- `Plot.bearing` is degrees clockwise from the top; `range` is a share of the radar, 0 at the center and 1 at the rim.
- `MapSpec.zoom` is the tile zoom (11 a city, 14 a district, 16 a field). Tiles default to OpenStreetMap's, whose policy asks for light use: pass your own `tiles` template (`{z}`, `{x}`, `{y}`) and `attribution` for anything heavier.

## Themes

`THEMES`, `THEME_NAMES`, `DEFAULT_THEME` (`'graphite'`), `LIGHT_THEMES`, `applyTheme(el, name)`, `applyColors(el, colors)`. A theme is seven CSS custom properties: `--bg`, `--ink`, `--muted`, `--dim`, `--line`, `--minor` (a level 1 alert), `--critical` (a level 2 alert). Inside a shadow root, adopt the three stylesheets there and mount on an element of that root.
