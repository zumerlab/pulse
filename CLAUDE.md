# Pulse

The UI: a radial object with layers by urgency. Uses Orbit (`../orbit`) and Zumly (`../zumly`). Pulse is more than Home Assistant; Home Assistant is the first real source and a thorough demonstration of it.

- npm workspace: `packages/core` (`@zumer/pulse`, the object; knows nothing about Home Assistant), `apps/demo` (simulated data; the tests run against it), `apps/home-assistant` (the product over a live HA: `model.ts`, WebSocket client, local login server in `server/`, three board views). Apps import the core as `@zumer/pulse`, never by relative path. What is UI of the object goes in the core; what is about a data source goes in its app.
- Everything in this repo is in English: code, comments, identifiers, commits, docs and the demo's UI strings (core strings in `packages/core/src/i18n.ts`, each app's in its `strings.ts`; another language is another dictionary). Chat with Martin stays in Spanish; the notes in `../coordinacion/` stay in Spanish.
- If a workaround shows up for something that belongs to Orbit or Zumly: do not leave it hidden in Pulse. Note it in `../coordinacion/PENDIENTES.md` under that project.
- Orbit (`@zumer/orbit` 2.1.0) and Zumly (1.2.2) come from npm, installed at the workspace root. To try an unpublished branch, it goes in as a `.tgz` in `vendor/` at the repo root: `../coordinacion/README.md`.
- Test Home Assistant: local Docker at `127.0.0.1:8123`. Credentials in `apps/home-assistant/.env.local` (never committed).
- Checks, from the root: `npm run typecheck`, `npm run lint`, `npm test` (Playwright starts both apps: demo on 5173, HA on 5174; the HA app only gets a load check). `npm run dev` / `npm run dev:ha`; after changing a dependency version add `-- --force`.

## Coordination with Orbit and Zumly

Before starting, read `../coordinacion/README.md` and `../coordinacion/PENDIENTES.md` (Pulse section).
When done, update `../coordinacion/ESTADO.md`, `PENDIENTES.md` and `BITACORA.md` with what changed.
