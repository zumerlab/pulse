# Pulse

A radial interface for states that compete for attention: one circular object
per system, with layers in depth. What matters now sits in front; the rest waits
behind. Built with [Zumly](https://github.com/zumerlab/zumly) (zoom navigation)
and [Orbit](https://github.com/zumerlab/orbit) (rings and layers).

Pulse is the UI. It does not control devices or own the data: whoever mounts it
feeds it readings. A host turns its own data into systems, channels and
readings with a level of urgency; the core draws them and hands back the
actions. Home Assistant is the first real source and a thorough demonstration
of it; a machine (the homelab app) is the second. Neither is what Pulse is.

## Layout

```text
packages/core/          @zumer/pulse: the radial object (rings, layers, dial, Zumly setup, strings, theme), the board over a host (board.ts) and the host contract (model.ts)
apps/demo/              the object with simulated data, on its own early board; part of what the tests run against
apps/home-assistant/    the object over a live Home Assistant (sign-in with HA's OAuth, WebSocket, three board views), over the homes of demo.home-assistant.io, and as a custom card + dashboard and section strategies (card/, with the README for Home Assistant users)
apps/homelab/           the object over a machine: a small collector (Node, no dependencies) reads a Mac or a Linux box and the app shows it; a demo machine when there is none
tests/                  Playwright tests
docs/                   cookbook of the radial system, the brief for the detail design, the Home Assistant integration options
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
npm run build:card  # the Home Assistant card + strategies as one module: apps/home-assistant/dist-card/pulse-card.js
                    # install and options: apps/home-assistant/card/README.md; bench without HA: http://127.0.0.1:5174/card.html
npm run build       # typecheck and build the apps
```

## Language

Everything in the repository is in English: code, comments, commits and docs.
The object's strings live in `packages/core/src/i18n.ts`, each app adds its own
in `strings.ts`, and the demo data (`systems.ts`, `model.ts`) carries the names
and alert texts, so another language is another set of dictionaries.
