# Pulse

A radial interface for monitoring and controlling systems.

Pulse shows each system as a circular object with layers for its readings and
controls. In a home, for example, the climate system can have a thermostat in
front, with its mode and fan controls behind it. You drag the ring to change the
temperature or tap another layer to bring it forward.

When an alert appears, Pulse brings that layer to the front. Once the alert is
resolved, the layer moves behind the active one. You can see what needs
attention while keeping the other readings and controls within reach.

This repository is the core, `@zumer/pulse`: the object, the board and the
contract a source fills, with a demo of simulated data. The sources are apps
on it, each in its own repository (see [Sources](#sources)).

Site: [zumerlab.com/pulse](https://zumerlab.com/pulse/) (the pages are in
[`docs/`](docs/)). Rings and layers are [Orbit](https://zumerlab.com/orbit/);
the zoom between levels is [Zumly](https://zumerlab.com/zumly/).

![The board of a home: the pulse in the center, the systems around it](docs/images/board-orbit.png)

## How it works

- **Layers show priority.** The active channel sits in front. An alert brings
  its layer forward; a more serious alert takes priority. When resolved, the
  layer moves back behind the active one.
- **A few layers stay visible.** The default is three on a desktop and two on
  a phone. Other channels remain accessible by name. Only the front layer has
  a full disc; the layers behind it show a ring and a label.
- **Alerts mark the affected part.** A heavier stroke, color and a wave draw
  attention to a ring, segment or label. The disc stays unchanged.
- **Controls sit on the ring.** Drag a band to adjust a value, tap a segment to
  toggle a device, or choose a mode by name. Actions that need a code open a
  keypad. A separate detail view opens when there is more to show, such as
  history or a camera feed.
- **Commands wait for confirmation.** The control pulses while a command is
  pending and settles when the source reports back. A rejected command leaves
  a red outline and a Retry option.

| | |
|---|---|
| ![Climate: a thermostat dial in front, the mode and a fan behind](docs/images/system-climate.png) | ![A battery alert in front, in amber, with its action](docs/images/system-alert.png) |
| Drag the front ring to adjust the thermostat. | A battery alert moves to the front, with an action below. |
| ![The board by room](docs/images/board-rooms.png) | ![The gear: what each screen chooses](docs/images/gear.png) |
| The same home by room, each area an object. | Settings for this screen, saved in this browser. |

Read about the [design decisions](docs/principles.html),
[object structure](docs/object.html), [components](docs/elements.html)
and [board views](docs/board.html).

## Sources

The object is the same whatever feeds it. Each source is an app on the core,
in its own repository: a home through
[Home Assistant](https://github.com/zumerlab/pulse-home) (a custom card, a
dashboard, a section or a standalone app); a machine, the world's calamities
from public feeds, a boat over Signal K, a fleet of trams over MQTT, a fleet
of hosts over Prometheus, a swarm of drones, the sky from ADS-B, the space
station from NASA's telemetry and a city's traffic cameras, private while they
mature.

## Layout

| Directory | Contents |
|---|---|
| [packages/core](packages/core/README.md) | Shared board, radial components, controls, themes and host interface |
| [apps/demo](apps/demo/README.md) | Simulated systems and a component gallery |
| `tests/` | Playwright tests of the demo |
| `docs/` | Website, component reference and design documentation |

The apps on the core live in their own repositories and, while the core is
not on npm, link it from a checkout next to theirs
(`"@zumer/pulse": "file:../pulse/packages/core"`).

## Run

Requires Node.js 22.18+ or 24+ and npm.

```sh
npm ci
npm run dev        # demo, http://127.0.0.1:5173; the component gallery at /elements.html
```

```sh
npm run typecheck   # TypeScript, whole workspace
npm run lint        # ESLint
npm test            # Playwright: the demo app
npm run build       # typecheck and build the demo
```

## Your own source

A host supplies systems and readings, reports changes, runs actions and provides
names for the data. The `PulseHost` interface is defined in
`packages/core/src/model.ts`.

A system has channels. Each channel returns a ring, a value and a label, with
optional alerts and detail content.

Start with [Your own source](docs/sources.html) for the data model and
[In your project](docs/adapt.html) for setup. The component gallery at
`apps/demo/elements.html` shows individual components with sample data under
each of the seven built-in themes.

## Language

Everything in the repository is in English: code, comments, commits and docs.
Shared interface strings live in `packages/core/src/i18n.ts`, each app adds its own
in `strings.ts`; numbers and times follow the language the source reports.
Translations can be added through those dictionaries.

## License

[MIT](LICENSE). Made by [ZumerLab](https://zumerlab.com).
