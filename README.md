# Pulse

What matters now, in front.

Pulse is a radial interface for states that compete for attention. Each system
is one round object with a few channels as layers in depth: the one that matters
sits in front with its control on the ring; the rest wait behind, visible and
named. An alert brings its layer forward. Resolved, it goes back.

Pulse is the interface: a host feeds it readings and takes its actions. Home
Assistant is the first real source and the most thorough demonstration of it;
a machine, read by a small collector, is the second. Neither is what Pulse is.

Site: [zumerlab.com/pulse](https://zumerlab.com/pulse/) (the pages are in
[`docs/`](docs/)). Rings and layers are [Orbit](https://zumerlab.com/orbit/);
the zoom between levels is [Zumly](https://zumerlab.com/zumly/).

![The board of a home: the pulse in the center, the systems around it](docs/images/board-orbit.png)

## The idea

- **Depth means something.** The front layer is what is active. An alert raises
  its layer; a more serious one displaces it; a resolved one goes back on its
  own. Nothing else moves in z.
- **Three layers at most.** The rest are counted and named, not drawn. Only the
  front layer has a face and a full disc; behind, a ring and a label.
- **The alert carries the weight.** A deeper tone, a heavier ring, a wave, on a
  segment, a band or a label. Never the disc, and nothing that calls grows. What
  is fine stays thin and quiet, folded away while something calls.
- **The ring is the control.** A band you drag, segments you tap, names along
  the ring you choose from. When something asks for a code, a phone's keypad
  comes over the object. A control resolved on the face opens no detail.
- **What is shown is what was confirmed.** A command beats on its way and
  settles when the source reports; a refused one keeps a red outline and a Retry.

The rules, the anatomy and the primitives: [Why](docs/principles.html),
[The object](docs/object.html), [Elements](docs/elements.html) (each one drawn
alone, with what it takes), [The board](docs/board.html).

## Home Assistant, as the example

Pulse reads the states Home Assistant already pushes to the dashboard. There is
no entity list to write: each channel picks its entities by domain, device class
or capability, and a channel with nothing to show stays out. Every home builds a
different object.

| | |
|---|---|
| ![Climate: a thermostat dial in front, the mode and a fan behind](docs/images/system-climate.png) | ![A battery alert in front, in amber, with its action](docs/images/system-alert.png) |
| A system. The thermostat in front, dragged on the ring. | An alert. It came forward on its own, with what to do. |
| ![The board by room](docs/images/board-rooms.png) | ![The gear: what each screen chooses](docs/images/gear.png) |
| The same home by room, each area an object. | The gear: what this screen shows, kept in this browser. |

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
The repository also carries the six homes of demo.home-assistant.io as a source
that behaves, so everything can be tried without a Home Assistant.

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

A host hands the board its systems, tells it when a thing changes, runs the
actions the board hands back, and names the things: the `PulseHost` interface
in `packages/core/src/model.ts`. A system is a title and a few channels; a
channel reads the host's state into one of three rings, a value, a line, and
sometimes an alert with its actions. The homelab app is the smallest host
(`apps/homelab/host.ts` and `model.ts`), the Home Assistant app the fullest.
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
