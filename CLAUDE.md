# Pulse

The UI: a radial object with layers by urgency. Uses Orbit (`../orbit`) and Zumly (`../zumly`). Pulse is more than Home Assistant; Home Assistant is the first real source and a thorough demonstration of it.

- npm workspace: `packages/core` (`@zumer/pulse`, the object; knows nothing about Home Assistant), `apps/demo` (simulated data; the tests run against it), `apps/home-assistant` (the product over a live HA: `model.ts`, `source.ts` with the `PulseSource` interface and its WebSocket implementation, sign-in, three board views). Apps import the core as `@zumer/pulse`, never by relative path. What is UI of the object goes in the core; what is about a data source goes in its app.
- Everything in this repo is in English: code, comments, identifiers, commits, docs and the demo's UI strings (core strings in `packages/core/src/i18n.ts`, each app's in its `strings.ts`; another language is another dictionary). Chat with Martin stays in Spanish; the notes in `../coordinacion/` stay in Spanish.
- If a workaround shows up for something that belongs to Orbit or Zumly: do not leave it hidden in Pulse. Note it in `../coordinacion/PENDIENTES.md` under that project.
- Orbit (`@zumer/orbit` 2.1.0) and Zumly (1.2.2) come from npm, installed at the workspace root. To try an unpublished branch, it goes in as a `.tgz` in `vendor/` at the repo root: `../coordinacion/README.md`.
- Test Home Assistant: local Docker at `127.0.0.1:8123`. The app signs in with Home Assistant's own OAuth flow in the browser (Martin signs in; never type his credentials). For an automated live check, `apps/home-assistant/.env.local` (gitignored, not read by the app) still has `HA_URL/HA_USERNAME/HA_PASSWORD`: a script can run HA's login flow with them and seed `localStorage['pulse-ha-auth']` with the tokens.
- Integration options with Home Assistant (card, strategies, App, standalone) and the plan: `docs/home-assistant-integration.md`.
- `apps/home-assistant/card/`: the `pulse-card` custom card and the `pulse` dashboard and section strategies (one module, `npm run build:card`); `card/README.md` is the install/options guide for HA users (keep it current when the card changes). `app.ts` is the object mounted on an element (`mountPulse`, options `systems/mode/start`); `main.ts` is the standalone shell; `card.html` is the card's bench over a demo home, no HA needed (what the tests use). To check the card in the local HA: `npm run dev:ha`, then `scripts/ha-tokens.mjs` + `scripts/ha-install-card.mjs` register the dev server's `dist-card/pulse-card.js` (new `?v=` each time) as a resource and the `pulse-demo` / `pulse-sections` dashboards; HA's own frontend can be opened in Playwright by seeding `localStorage['hassTokens']` with those tokens (again: never type credentials).
- `apps/home-assistant/demo/`: the six homes of demo.home-assistant.io as a `PulseSource` (data and entity behaviour ported from `home-assistant/frontend`, Apache 2.0, `demo/NOTICE.md`). Regenerate the data from that repo rather than editing it by hand.
- Checks, from the root: `npm run typecheck`, `npm run lint`, `npm test` (Playwright starts both apps: demo on 5173, HA on 5174; the HA app is tested over its demo homes, `?demo=home`, no HA needed). `npm run dev` / `npm run dev:ha`; after changing a dependency version add `-- --force`.

## Coordination with Orbit and Zumly

Before starting, read `../coordinacion/README.md` and `../coordinacion/PENDIENTES.md` (Pulse section).
When done, update `../coordinacion/ESTADO.md`, `PENDIENTES.md` and `BITACORA.md` with what changed.
