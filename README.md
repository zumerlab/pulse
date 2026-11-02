# Pulse

A radial interface for monitoring and controlling systems.

Pulse shows each system as a circular object with layers for its readings and
controls. In a home, for example, the climate system can have a thermostat in
front, with its mode and fan controls behind it. You drag the ring to change the
temperature or tap another layer to bring it forward.

When an alert appears, Pulse brings that layer to the front. Once the alert is
resolved, the layer moves behind the active one. You can see what needs
attention while keeping the other readings and controls within reach.

Home Assistant is the most complete integration so far. There is also a homelab
app that reads a Mac or Linux machine through a small collector, and a demo app
with simulated data. Each app connects its data and actions to the same interface.

Site: [zumerlab.com/pulse](https://zumerlab.com/pulse/) (the pages are in
[`docs/`](docs/)). Rings and layers are [Orbit](https://zumerlab.com/orbit/);
the zoom between levels is [Zumly](https://zumerlab.com/zumly/).

![The board of a home: the pulse in the center, the systems around it](docs/images/board-orbit.png)

## How it works

- **Layers show priority.** The active channel sits in front. An alert brings
  its layer forward; a more serious alert takes priority. When resolved, the
  layer returns to its previous position.
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

The rules, the anatomy and the primitives: [Why](docs/principles.html),
[The object](docs/object.html), [Elements](docs/elements.html) (each one drawn
alone, with what it takes), [The board](docs/board.html).

## Home Assistant

Pulse reads the states Home Assistant already pushes to the dashboard. There is
no entity list to write: each channel picks its entities by domain, device class
or capability. Channels with nothing to show stay out, so the available entities
determine which controls appear.

| | |
|---|---|
| ![Climate: a thermostat dial in front, the mode and a fan behind](docs/images/system-climate.png) | ![A battery alert in front, in amber, with its action](docs/images/system-alert.png) |
| Drag the front ring to adjust the thermostat. | A battery alert moves to the front, with an action below. |
| ![The board by room](docs/images/board-rooms.png) | ![The gear: what each screen chooses](docs/images/gear.png) |
| The same home by room, each area an object. | Settings for this screen, saved in this browser. |

Three ways in, all from one JavaScript module and nothing on the server:

- **The card**, `custom:zumer-pulse`, from the Add card dialog, with a visual
  editor.
- **The strategies**: a dashboard that is one full-screen Pulse, and a section
  strategy for a sections view.
- **The app**: a standalone page that signs in with Home Assistant's own login
  and talks over its WebSocket, for a kiosk or a wall tablet.

Eight systems (lights, climate, security, openings, media, energy, scenes,
maintenance) and the alerts that cross them: motion with the alarm armed,
heating with a window open, the garage open at night, a lock that did not
finish locking, a battery running low, carbon monoxide. Numbers, times and
states come in the language of your Home Assistant profile.

Install, options and troubleshooting:
[`apps/home-assistant/card/README.md`](apps/home-assistant/card/README.md).
The repository includes six interactive homes from demo.home-assistant.io,
so you can try the interface without a Home Assistant instance.

## Layout

```text
packages/core/          @zumer/pulse: the radial object (rings, layers, dial, Zumly setup, strings, theme), the board over a host (board/) and the host contract (model.ts)
apps/demo/              the object with simulated data (a home, a car, a pet, a server); what the tests run against; elements.html, every element alone
apps/home-assistant/    the object over a live Home Assistant (sign-in with HA's OAuth, WebSocket), over the homes of demo.home-assistant.io, and as a custom card + dashboard and section strategies (card/, with the README for Home Assistant users)
apps/homelab/           the object over a machine: a small collector (Node, no dependencies) reads a Mac or a Linux box and the app shows it; a demo machine when there is none
tests/                  Playwright tests
docs/                   the site (index.html and the pages), the cookbook of the radial system, the brief for the detail, the Home Assistant integration options
```

The core knows nothing about Home Assistant or about machines: each app is an
adapter that turns its source into the core's systems and readings and runs
the actions the board hands back. The apps depend on the core through the npm
workspace. Each app and the core have their own README.

## Run

Requires Node.js 22.18+ or 24+ and npm.

```sh
npm ci
npm run dev        # demo, http://127.0.0.1:5173
npm run dev:ha     # Home Assistant, http://127.0.0.1:5174; sign in with your Home Assistant account
                   # index of the demo homes: http://127.0.0.1:5174/gallery.html
npm run collect    # the homelab collector, on the machine to watch: http://127.0.0.1:5180
npm run dev:homelab  # homelab, http://127.0.0.1:5175; ?demo for the demo machine
```

```sh
npm run typecheck   # TypeScript, whole workspace
npm run lint        # ESLint
npm test            # Playwright: the demo app, the Home Assistant app over its demo homes, the homelab app over its demo machine
npm run build:card  # the Home Assistant card + strategies as one module: apps/home-assistant/dist-card/zumer-pulse.js
                    # install and options: apps/home-assistant/card/README.md; bench without HA: http://127.0.0.1:5174/card.html
npm run build       # typecheck and build the apps
```

## Your own source

A host supplies systems and readings, reports changes, runs actions and provides
names for the data: the `PulseHost` interface
in `packages/core/src/model.ts`. A system is a title and a few channels; a
channel reads the host's state into one of three rings, a value, a line, and
sometimes an alert with its actions. The homelab app is the smallest host
(`apps/homelab/host.ts` and `model.ts`); the Home Assistant app is the most complete.
[Your own source](docs/sources.html) has the shape of it and
[In your project](docs/adapt.html) the steps, from the imports to the theme.
`apps/demo/elements.html` draws every element alone with sample data, under
each of the seven themes (`THEMES` in the core: Graphite, Paper, Deep, and the
blue-grey Slate, Mist, Fog and Night).

## Language

Everything in the repository is in English: code, comments, commits and docs.
The object's strings live in `packages/core/src/i18n.ts`, each app adds its own
in `strings.ts`; numbers and times follow the language the source reports.
Another language is another set of dictionaries.

## License

[MIT](LICENSE). Made by [ZumerLab](https://zumerlab.com).
