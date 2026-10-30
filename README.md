# Pulse

A radial interface for states that compete for attention: one circular object
per system, with layers in depth. What matters now sits in front; the rest waits
behind. Built with [Zumly](https://github.com/zumerlab/zumly) (zoom navigation)
and [Orbit](https://github.com/zumerlab/orbit) (rings and layers).

Pulse is the UI. It does not control devices or own the data: whoever mounts it
feeds it readings. Home Assistant is the first real source and a thorough
demonstration of it, not what Pulse is.

## Layout

```text
packages/core/          @zumer/pulse: the radial object (rings, layers, dial, Zumly setup, strings, theme)
apps/demo/              the object with simulated data; what the tests run against
apps/home-assistant/    the object over a live Home Assistant (sign-in with HA's OAuth, WebSocket, three board views), or over the homes of demo.home-assistant.io
tests/                  Playwright tests
docs/                   cookbook of the radial system, the brief for the detail design, the Home Assistant integration options
```

The core knows nothing about Home Assistant; the apps depend on the core
through the npm workspace. Each app and the core have their own README.

## Run

Requires Node.js 22.18+ or 24+ and npm.

```sh
npm ci
npm run dev        # demo, http://127.0.0.1:5173
npm run dev:ha     # Home Assistant, http://127.0.0.1:5174; sign in with your Home Assistant account
```

```sh
npm run typecheck   # TypeScript, whole workspace
npm run lint        # ESLint
npm test            # Playwright: the demo app, and the Home Assistant app over its demo homes
npm run build       # typecheck and build both apps
```

## Language

Everything in the repository is in English: code, comments, commits and docs.
The object's strings live in `packages/core/src/i18n.ts`, each app adds its own
in `strings.ts`, and the demo data (`systems.ts`, `model.ts`) carries the names
and alert texts, so another language is another set of dictionaries.
