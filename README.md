# Pulse

A radial interface for states that compete for attention: one circular object
per system, with layers in depth. What matters now sits in front; the rest waits
behind. Built with [Zumly](https://github.com/zumerlab/zumly) (zoom navigation)
and [Orbit](https://github.com/zumerlab/orbit) (rings and layers).

Pulse does not control devices on its own: it sits on top of Home Assistant.

## Run

Requires Node.js 22.18+ or 24+ and npm.

```sh
npm ci
cp .env.example .env.local   # HA_URL, HA_USERNAME, HA_PASSWORD (or HA_TOKEN)
npm run dev
```

Open the local address printed in the terminal and pick a prototype.

```sh
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Playwright, against the prototype with simulated data
```

## Layout

```text
prototypes/ha-radial/     the radial object over a live Home Assistant (WebSocket)
prototypes/zumly-radial/  the same object with simulated data
prototypes/shared/        what both prototypes share: the strings (i18n) and the radial object
server/homeassistant.ts   login with Home Assistant; the browser only receives a short token
tests/                    Playwright tests
docs/                     cookbook of the radial system and the brief for the detail design
```

Each prototype has a README with what was tried and what is still open.

## Language

Everything in the repository is in English: code, comments, commits and docs.
The demo's texts live in `prototypes/shared/i18n.ts` and in the demo data
(`systems.ts`, `model.ts`), so another language is another dictionary.
