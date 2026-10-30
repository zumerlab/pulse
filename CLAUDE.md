# Pulse

The UI: a radial object with layers by urgency. Uses Orbit (`../orbit`) and Zumly (`../zumly`). Home Assistant is only the data source of the real demo (`prototypes/ha-radial`); Pulse does not depend on it.

- Everything in this repo is in English: code, comments, identifiers, commits, docs and the demo's UI strings (those live in `prototypes/shared/i18n.ts` and the demo data, so another language is another dictionary). Chat with Martin stays in Spanish; the notes in `../coordinacion/` stay in Spanish.
- If a workaround shows up for something that belongs to Orbit or Zumly: do not leave it hidden in Pulse. Note it in `../coordinacion/PENDIENTES.md` under that project.
- Orbit (`@zumer/orbit` 2.1.0) and Zumly (1.2.2) come from npm. To try an unpublished branch, it goes in as a `.tgz` in `prototypes/zumly-radial/vendor/`: `../coordinacion/README.md`.
- Test Home Assistant: local Docker at `127.0.0.1:8123`. Credentials in `.env.local` (never committed).
- Checks: `npm run typecheck`, `npm run lint`, `npm test` (Playwright against `zumly-radial`; `ha-radial` only gets a load smoke test, it needs the local Home Assistant).

## Coordination with Orbit and Zumly

Before starting, read `../coordinacion/README.md` and `../coordinacion/PENDIENTES.md` (Pulse section).
When done, update `../coordinacion/ESTADO.md`, `PENDIENTES.md` and `BITACORA.md` with what changed.
