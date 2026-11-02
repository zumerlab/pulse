# @zumer/pulse

The shared interface components and board used by Pulse. Systems appear as
circular objects with layers for their channels. The active channel sits in
front, and alerts can bring another channel forward.

The core handles rendering, interactions, navigation and command feedback.
Each app supplies readings and runs actions through a `PulseHost` adapter.
The Home Assistant and homelab apps use the complete board; the demo builds
its own board from the radial components.

[Orbit](https://github.com/zumerlab/orbit) provides rings and layer depth.
[Zumly](https://github.com/zumerlab/zumly) provides zoom navigation.
The package is used through this repository's npm workspace and is not
currently published to npm.

## Mount a board

Load the dependency styles and Orbit runtime before mounting:

```ts
import 'zumly/style.css';
import '@zumer/orbit/style';
import '@zumer/orbit';
import '@zumer/pulse/style.css';
import { mountBoard } from '@zumer/pulse';

const board = mountBoard(canvas, {
  host,
  settings: 'my-settings',
  strings: { things: 'Sensors' },
});

// When removing the interface:
board.destroy();
```

Here, `canvas` is the element inside your page's shell and `host` implements
`PulseHost`. For the page structure and a complete adapter example, follow
[In your project](../../docs/adapt.html).

## Connect your data

A host supplies systems, reports changes and runs actions. It also provides
names and state labels for the data. Optional methods supply history, camera
streams, statistics and groups such as rooms.

Each system has channels. A channel returns a `Reading`, or `null` when it
has nothing to show. Readings describe one of three ring types:

| Kind | Display and interaction |
|---|---|
| `'p'` | Progress band; an optional dial or range makes it adjustable |
| `'s'` | Segments representing switches |
| `'c'` | Named options with one selected |

Readings also include the main value, a label and the entity ids they depend
on. They can add alerts and detail content such as history, an image, a color
control or a longer list.

Actions belong to the host. The board sends them through `act`, tracks the
ids they affect and waits for reported changes. An action that requires a
code opens a keypad first.

The types are defined in [model.ts](src/model.ts). See
[the homelab host](../../apps/homelab/host.ts) for a small adapter or
[the Home Assistant host](../../apps/home-assistant/host.ts) for one with
rooms, registries and richer history.

## Board options and lifecycle

`mountBoard(canvas, options)` returns a handle for updating and removing the
interface. Options include available systems and groups, initial view,
starting system, appearance, layer counts, status text and translated strings.

Browser preferences are saved under the key supplied as `settings`.
Set `settings: false` to disable the settings panel and saved preferences.

Use `setHost` to change data sources, `setSettings` to update display choices,
`repaint` to refresh the views and `destroy` to release the board's resources.
The `ready` promise tracks initialization. See
[board/types.ts](src/board/types.ts) for the full options and handle types.

## Source layout

| Module | Responsibility |
|---|---|
| [model.ts](src/model.ts) | Host, system, channel, reading and action contracts |
| [board/](src/board/) | Board state, settings, commands, views and lifecycle |
| [radial/](src/radial/) | Visual components, gestures, dimensions and Zumly setup |
| [themes.ts](src/themes.ts) | Seven themes and helpers for applying colors |
| [tune.ts](src/tune.ts) | Layout parameters exposed by the Tuning tab |
| [history.ts](src/history.ts) | Hourly aggregation and state-change helpers |
| [i18n.ts](src/i18n.ts) | Shared interface text and locale formatting |
| [style.css](src/style.css) | Entry stylesheet, importing the modules in `styles/` |

Inside `board/`, `mount.ts` handles setup and cleanup, `context.ts` defines the
shared state, and separate modules handle settings, actions, drawing, history,
dials and the settings panel. `views/` contains system, detail and change
views, with a module for each board layout.

Inside `radial/`, components are grouped by family: rings, objects, keypads,
color controls, time displays and lists. You can use these independently of
`mountBoard`; the [demo app](../../apps/demo/README.md) does this.

The base stylesheet uses Graphite. Other built-in themes are Paper, Deep,
Slate, Mist, Fog and Night. `applyTheme` selects one; `applyColors` supplies
custom colors. Apps can extend the shared text dictionary and use `setLocale`
for numbers and times.

## Development

From the repository root:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The app tests exercise the shared core through simulated data. To inspect
individual components, run `npm run dev` and open
[the component gallery](http://127.0.0.1:5173/elements.html).

For design decisions, see [Why](../../docs/principles.html). For component
examples and parameters, see [Elements](../../docs/elements.html).
