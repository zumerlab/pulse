# Pulse · Home Assistant

The radial object over a real Home Assistant (the default demo, running in
Docker). Same grammar as the demo app: board → layered system → detail. Nothing
is written by hand: readings, alerts and their resolution come from the live
state. The object itself (rings, layers, dial gestures, Zumly setup, strings) is
the core package `@zumer/pulse` (`packages/core`); this app adds `model.ts`,
which turns Home Assistant's state into the readings the object draws, the
source (`source.ts`), the sign-in and the three board views.

```sh
npm run dev:ha     # from the repo root; http://127.0.0.1:5174
```

Open it, type the address of your Home Assistant and sign in there. No
configuration files, no server. No Home Assistant at hand? The same panel opens
one of the six homes of demo.home-assistant.io (see "Demo homes" below).

## Files

- `app.ts`: `mountPulse(canvas, { source, status, onAction, onStatus })`: the
  core's board (`mountBoard`, `@zumer/pulse`) over the host `host.ts` makes of
  a `PulseSource`, with Home Assistant's words (areas, entities) translated to
  the board's (groups, picks). The board itself (grid, orbit, layers, the
  gear, the system view, the detail) lives in the core.
- `host.ts`: a `PulseSource` as the core's `PulseHost`: the seven systems of
  `model.ts` bound to the source, entity ids as things, service calls as
  actions, names and states as Home Assistant says them.
- `main.ts`: the standalone shell: sign-in, the WebSocket source, the demo
  homes, the core's tuning panel.
- `source.ts`: `PulseSource` and `WebSocketSource`. `demo/`: `DemoSource` and
  the demo homes (`demo/scripts/import-homes.py` regenerates them from the
  frontend repo). `card/`: `HassSource`, the card and the strategies, and the
  README for Home Assistant users. `card.html`: the card's bench (dev only, not
  in the build).
- `model.ts`: the systems and channels, a function of the state and the
  registry.
- `scripts/`: `ha-tokens.mjs` (tokens from `.env.local`), `ha-install-card.mjs`
  (registers the card and two dashboards in the local Home Assistant),
  `ha-check-card.mjs` (opens them in Playwright and takes screenshots).
  `tests/ha-live.spec.ts` runs the app against the live Home Assistant when
  `PULSE_HA_TOKENS` points at a tokens file; otherwise it is skipped.

## Sign in and connection

`source.ts` defines `PulseSource`, the little the UI needs from Home Assistant
(`states`, `unit`, `status`, `version`, `call`, `onChange`, `onStatus`, `url`),
and implements it over the WebSocket with the official
[`home-assistant-js-websocket`](https://github.com/home-assistant/home-assistant-js-websocket).
A second implementation over the `hass` object of a custom card would let the
same app run inside a dashboard (see `docs/home-assistant-integration.md`).

- **Sign in on Home Assistant, not on Pulse.** The login is Home Assistant's own
  OAuth flow (`getAuth`): the browser goes to `<your HA>/auth/authorize`, you
  sign in there (with your users, MFA, everything) and come back with a code.
  Pulse never sees a password. The `client_id` is Pulse's own URL, as Home
  Assistant expects; no registration.
- **Tokens stay in the browser** (`localStorage`, `pulse-ha-auth`): a 30-minute
  access token the library refreshes on its own and a refresh token. "Sign out"
  revokes them in Home Assistant and forgets them.
- **Long-lived access token** as the alternative, for wall panels and kiosks:
  pasted once in the sign-in panel (created in Home Assistant under
  profile › Security).
- **Direct connection.** The browser opens the WebSocket to Home Assistant's
  URL: its WebSocket accepts any origin, so no proxy is needed. REST is not
  used (its CORS is closed by default); camera images come from
  `entity_picture`, which already carries a token, resolved against the Home
  Assistant URL (`source.url()`).
- **One subscription.** `subscribe_entities` gives the initial states and
  compressed diffs after (what the Companion apps use); the source turns them
  into a list of changed entities. Reconnection is the library's, with
  `reconnect-error` shown in the connection line; an invalid token signs out.
- **Mixed content.** A Pulse served over HTTPS cannot open a WebSocket to an
  HTTP Home Assistant; use the same URL you use remotely.

## Demo homes

`demo/` is a `PulseSource` with no Home Assistant behind it: the homes of
[demo.home-assistant.io](https://demo.home-assistant.io). That site is the
Home Assistant frontend with a mocked `hass` and no server; its entities are
hand-written lists (`demo/src/configs/*/entities.ts` in the frontend repo) and
a small class per domain answers service calls in the browser. Pulse carries
both: the lists in `demo/homes/` (six homes, 40 to 130 entities each, plus the
energy sensors every demo gets) and the classes in `demo/entities.ts`, so a
light toggles, a cover travels, a lock goes through `locking`, an alarm through
`arming`, with the same `states` in and `call` out as the WebSocket. Origin and
license: `demo/NOTICE.md` (Apache 2.0).

- From the sign-in panel: pick a home, "Explore the demo".
- From the index, `gallery.html` (linked from the sign-in panel): a card per
  home with the mini rings its entities fill, computed with the same model as
  the board, plus cards for your own Home Assistant and, in development, the
  demo app. The place to start a visitor.
- From a link: `?demo=home` (also `sections`, `arsaboo`, `teachingbirds`,
  `kernehed`, `jimpower`). The URL keeps the home while it is open; "Leave the
  demo" returns to the sign-in or to the saved session.
- Each home builds its own object: a home without an alarm has no alarm
  channel, one without updates no Maintenance. `home` and `sections` are the
  rich ones; the other four are mostly sensors.
- The Playwright suite runs against these homes, so the whole app is tested
  without a Home Assistant.
- The data is generated, not edited: `demo/scripts/import-homes.py <frontend
  checkout>` rewrites `demo/homes/*.ts` from the frontend repository (it prints
  the commit; `--check` only compares, exit 1 on a difference). To update the
  homes, pull the frontend and run it again.

## Card and dashboard strategy

`card/pulse-card.ts` is the same object inside a Home Assistant dashboard, as
the integration document planned (`docs/home-assistant-integration.md`, step
2): one JavaScript module with the `pulse-card` custom card, the `pulse`
dashboard strategy and the `pulse` section strategy, Orbit and Zumly bundled.
**How to install and configure it in a Home Assistant is in
[`card/README.md`](card/README.md)**, written for Home Assistant users; this
section is the development side.

```sh
npm run build:card        # from the repo root; apps/home-assistant/dist-card/pulse-card.js
```

- **Card.** `custom:pulse-card`, a plain custom element. `set hass` feeds a
  `HassSource` (`card/hass-source.ts`): the same `PulseSource` interface, over
  the `hass` object Home Assistant pushes on every change (`hass.states` by
  reference, `hass.callService`, `hass.hassUrl`). The object mounts in the
  card's shadow root (`app.ts`, `mountPulse`); the four stylesheets are adopted
  by that root, and Orbit's five `@property` are registered once at document
  level from JS, since `@property` inside a shadow root is ignored. In
  sections it takes the full width and six rows at least (`getGridOptions`);
  under 640 px wide (or 540 px tall) the canvas gets `.compact` and the board
  tightens.
- **Options** (`systems`, `mode`, `start`, `settings`) are `mountPulse`
  options; the card validates them (`assertConfig`) and remounts when the
  editor changes them. The viewer's choices (the gear) are kept per card
  config, under `pulse-card:<json of the options>`.
  `static getConfigForm()` gives the dashboard editor its form (a multiple
  select, two dropdowns, labels and helpers): no editor element to write.
- **Strategies.** `strategy: { type: custom:pulse }` as a dashboard generates
  one panel view with the card; as a section, one grid with the card. Home
  Assistant hands `generate()` the strategy object itself (`type` plus the
  options next to it), which goes through to the card. The New dashboard
  dialog lists "Pulse" under Community dashboards.
- **Bench without Home Assistant.** `card.html` (`card-bench.ts`) mounts the
  real card over a `DemoSource`, with a `hass` object rebuilt on every change
  (`states` by reference, `callService` to the demo entities). Query string:
  `home`, `config` (JSON), `size=panel|section`, `width`, `height`. The tests
  in `tests/ha.spec.ts` run the card there.
- **Develop against the local Home Assistant.** With `npm run dev:ha` running,
  the resource can point at the dev server's copy of the build,
  `http://127.0.0.1:5174/dist-card/pulse-card.js`, so no files go into the
  Home Assistant container. `scripts/ha-install-card.mjs <tokens.json> <url>`
  registers that resource and creates (or updates) two dashboards over the
  admin WebSocket: `pulse-demo` (the dashboard strategy) and `pulse-sections`
  (a sections view with a Pulse section and a hand-placed card);
  `scripts/ha-tokens.mjs .env.local tokens.json` gets the tokens from
  `.env.local` (gitignored). Open Home Assistant, sign in, and both are in the
  sidebar.

Verified on the local Home Assistant 2026.10.4 (30/10/2026): the card renders
the seven systems inside the dashboard, rings included (the registered
properties reach the shadow root), zooms into a system, and a light toggled
from the ring goes through `hass.callService` and comes back confirmed; the
visual editor shows the three fields with a live preview; the section strategy
opens inside Climate with one tile behind; two cards in a sections view run
side by side in compact mode. No console errors.

## Systems

The channels name the entities of Home Assistant's `demo` integration (the
local test installation) and fall back to the first entity of their kind, so
another installation, or one of the demo homes, builds its own object.

| System | Channels | Controls on the ring |
|---|---|---|
| Lights | all lights · brightness of the first dimmable one (the dial takes the light's color; a color wheel in the detail) · plugs | segments = `light.toggle`; dial = `brightness_pct`; wheel = `hs_color` |
| Climate | thermostat · its mode (a choice) · air conditioning · fan speed · one with a range (Ecobee: a band with two ends) · humidity (a day ring in the detail) | dial = `climate.set_temperature`; choice = `set_hvac_mode`; dial = `fan.set_percentage`; range = `target_temp_low/high` |
| Security | alarm (a choice) · cameras (the picture in the face) · sirens · locks · sensors (doors and windows, safety, motion) | alarm modes (the demo's code), sirens, locks |
| Openings | two covers with position · garage door · irrigation valves | dial = `set_cover_position`; valves |
| Media | players (the artwork in the face) · a player's source (a choice) · volume of the first one | play/pause; choice = `select_source`; dial = `volume_set` |
| Energy | power (W) · carbon monoxide · hot water (the first two with a day ring) | dial = `water_heater.set_temperature` |
| Maintenance | updates · vacuums · batteries · problems · repairs | install; start / return to base |

The models are in `model.ts`: each channel is a function of the state. If no
entity fits, the channel does not appear. A channel that follows one entity
takes its name (the face says "Thermostat", "Kitchen shutter").

### The primitives a reading can use

The object has a few primitives (in `@zumer/pulse`), and every channel is one
of them plus, sometimes, a picture or a day. `Reading.kind`:

- `'p'`: a band that fills; with a `dial`, dragged on the ring. With a
  `range` (`lo`, `hi`, `set`) the band goes from one end to the other and has
  a knob at each: the nearer one follows the pointer, each is a slider for
  the keyboard, and neither crosses the other (the Ecobee's comfort range).
- `'s'`: segments that switch on and off (`segs` with `act`).
- `'c'`: a choice, segments of which exactly one is on, with their names
  along the inside of the ring (`role="radiogroup"`): the thermostat's
  `hvac_modes`, the alarm's modes, a player's `source_list`. In the detail
  they are radios.

Besides the kind, a reading can carry `image` (`src`, `alt`, `entity`): the
picture fills the face's disc, with the text over it; in the detail it is
round like the face or square on request, and a camera has a *Live* button
when the source can stream it (`PulseSource.stream`: Home Assistant's MJPEG
`camera_proxy_stream`; the snapshot is asked again every 8 s). Cameras,
album art and, by the same path, a vacuum's map or a floor plan served as an
`image` or `camera` entity. `tint` colors the band (the light's `rgb_color`).
`color` (`hs`, `set`) adds a hue and saturation wheel to the detail: hue
around, saturation outward, arrows on the keyboard (`light.turn_on` with
`hs_color`). `history` names a numeric entity whose last 24 hours the detail
draws as a ring (`PulseSource.history`: `history/history_during_period`
bucketed per hour, one dot per hour with the current one at the top, its
distance from the ring the value; the demo makes a day up around the current
value). What has no honest radial reading (free text, long lists, maps with
zones) stays out: Home Assistant's own more-info dialog is a tap away.

The source also carries Home Assistant's registries (`PulseSource.registry`:
areas, devices, entities, floors, and the repairs; `onRegistry` when they
change). The model uses them the way Home Assistant's own summary views do:

- Entities hidden in the registry, and config or diagnostic ones, stay out of
  the scans ("all lights" does not pick up a diagnostic switch). Maintenance
  asks for diagnostic ones too, because batteries are; tamper sensors as well.
  An entity named by id is taken as it is.
- An alert says where: the area of the entity, or of its device ("Motion ·
  Garden", "15% · motion sensor battery · bedroom").
- The Security sensors channel follows the classes of Home Assistant's
  Security view: openings (`door`, `window`, `garage_door`, `opening`,
  `lock`), safety (`smoke`, `gas`, `carbon_monoxide`, `moisture`,
  `glass_break`, `safety`, `tamper`) and `motion`/`occupancy`; the ones
  detecting something come first, eight segments at most.
- Maintenance reads what Home Assistant's Maintenance view reads: battery
  sensors (low under 20%), `problem` binary sensors, and the repairs of
  Settings › Repairs (`repairs/list_issues`, one segment per integration).

Over the WebSocket the registries come from `config/*_registry/list` (no admin
needed) and are fetched again after a `*_registry_updated` event; in the card
they are the `hass.areas/devices/entities/floors` records Home Assistant
already keeps; the demo homes build theirs from their own data.

## What each screen shows: the gear

The board has a gear at the top right. It opens a panel (a dialog: focus goes
in, Tab cycles, Escape closes and returns the focus to the gear) with:

- the systems to tick (at least one);
- the areas, from the registry, grouped by floor (shown when there are two or
  more): only the entities in the ticked areas count, by their own area or
  their device's; an entity with no area stays out, as in Home Assistant's
  area views;
- the channels of each system shown (at least one per system), and for a
  channel that follows one entity a select with every entity it could follow
  (the brightness dial over any dimmable light, the humidity over any humidity
  sensor, a window over any positional cover), with its place next to the name;
- the board's view and where it opens next time.

Changes apply as they are made and are kept in the browser
(`localStorage['pulse-ha-settings']`: `systems`, `groups` (the areas),
`channels` as the hidden keys per system, `picks` as `'system/channel':
entity_id`, `mode`, `start`); "Back to defaults" forgets them. The same panel
is in the card and in the dashboard strategy, because it is part of the object
(the core's `board.ts`, `settingsPanel`). The lists are rebuilt only when their markup changes (the
house repaints every few seconds), and the control with the focus keeps it.

The host sets the **frame** the viewer chooses within: `mountPulse`'s
`systems` and `areas` (the gear offers only those), `mode` and `start` (its
defaults). In the standalone app the frame comes from the URL,
`?systems=lights,climate&mode=orbit&start=climate&areas=kitchen,living_room`,
so a kiosk or a shared link opens on a fixed subset; in the card, from its
config. `settings: false` hides the gear. The mode switch at the top writes
the same setting as the gear.

In the model, the choice of entity goes through `Context.picks`: the first
scan a channel makes (`first`/`nth`) is the one that decides what it follows,
reports every fitting entity as `Reading.choices` and takes the viewer's pick
when it is one of them; later lookups in the same channel (the dehumidifier
next to the humidity, the alarm behind the locks) are not choices. The area
filter is `Context.areas`, applied to every scan and to the entities named by
id.

## Three views of the board

A selector at the top (remembered in the browser, as the gear's "Board view")
changes how the whole home is looked at. All three use the same data and open the same system when tapped.

| View | What it is | What it is for |
|---|---|---|
| **Grid** | A mini ring per system and the latest changes below | See everything evenly, read fast |
| **Orbit** | The home's pulse in the center and the 7 systems around it | Main screen: the center beats with every change |
| **Layers** | A single object, one system per layer (the system's grammar, one level up) | See "what calls" as depth: the urgent in front |

- **Orbit.** The center ring has one segment per system, facing its tile,
  painted if that system calls. Inside, one thing at a time: each alert (the most
  serious first, with "Open") and at the end the pulse (how many alerts and the
  three entities that changed last, with their live value). It advances on its
  own every 6 s; it holds with the pointer or the focus over it; the dots below
  (color = level) pick one. The systems do not change place: what moves is the color.
  - The whole view is one Orbit system: the universe (`.bigbang`) is the largest
    square that fits; the systems are satellites of `orbit-10` (a 3.5-lane ring,
    shifted 20 px inward for the text) and the pulse is the `at-center` satellite
    of `orbit-0` (11 lanes). Nothing is positioned by hand.
  - The systems are shifted half a step (`--o-from`: none right at the top), each
    facing its segment of the center ring. In the top half the text goes above
    the ring: nothing hangs toward the center. Orbit's `.outward-y` solves it
    (before, a `clamp()` over `--o-dir-y` in the CSS).
  - In 3D, like each system's object: Orbit's `.depth` with the pulse in front
    (`layer-front`) and the systems one step behind (`data-depth="1"`), without
    shrinking or dimming. The pointer tilts the whole ±7° (not on the phone).
  - The center's text scales with it (`cqw` units): it does not overflow in short windows.
- **Layers.** Seven layers that grow 16% each (instead of 42%), all in view: it
  breaks the "3 layers at most" rule on purpose, to try the integrated object.
  In front goes the system that calls the most; tapping a band brings that
  system to the front until a new alert arrives; tapping the center enters.
  In 3D, like the orbit: each layer 70 px further back and the pointer tilts the object ±7°.

## Live tuning (development only)

With `npm run dev` a "Tuning" panel appears at the bottom right to try sizes and
distances of the orbit and the layers without touching the code: orbit and ring
of the systems, center pulse, distance in 3D, growth, distance, zoom and opacity
of the layers, and tilt. The values are kept in the browser; the colored number
is the one that moved from the code's value. "Copy" puts the list on the
clipboard to carry into the code; "Back to code values" discards them. It does
not appear in the build (the core's `tune.ts`).

## Alerts: rules over the state

| Alert | Rule | Action |
|---|---|---|
| Sirens sounding (critical) | some `siren` is `on` | Turn off |
| Lock jammed (critical) | `lock` in `jammed` | Retry |
| Motion, or something open, with the alarm armed (critical) | a motion or opening sensor `on` **and** alarm armed | Got it |
| Smoke, gas, carbon monoxide, water, glass break (critical); tampering (minor) | a safety sensor `on` | Got it |
| Alarm triggered (critical) | `triggered` / `pending` | Disarm |
| Heating with windows open (minor) | heating `heating` **and** windows open | Close windows |
| Unlocked with the alarm armed (minor) | alarm armed **and** locks open | Lock |
| Garage door open at night (minor) | garage open **and** sun below the horizon | Close |
| Carbon monoxide (minor ≥ 35 ppm, critical ≥ 100) | `sensor.carbon_monoxide` | Got it |
| Updates (minor) | `update` is `on` | Install |
| Low battery (minor) | a battery sensor under 20% | Got it |
| Problem (minor) | a `problem` (or `battery`) binary sensor `on` | Got it |
| Repairs (minor; critical when Home Assistant says so) | issues in `repairs/list_issues`, not ignored | Got it |

The cross rules are the interesting part: arming the alarm from the ring makes
"motion" and "unlocked" appear without any device changing.

## What was refined over zumly-radial

- **What is shown is what was confirmed, not what was asked.** A command marks
  its segment or dial as *sending* (it beats) until Home Assistant sends the new
  state, or 8 s. The dial moves in place while it is dragged and the command goes
  out on release (with keyboard or wheel, after 0.5 s still). If Home Assistant
  fails, the error shows in the strip and the value comes back.
- **Alerts in progress.** While the windows close, the alert stays with
  "in progress…" and no button; it leaves when Home Assistant confirms `closed`.
- **Several failing segments** are all painted (two sirens, two doors). If the
  alert calls (in front and not muted), the wave comes out of those segments
  (Orbit's `o-arc.ripple`); the disc ripples only when the channel is a dial.
- **Rule 1 (stable)** with real arrival time; **rule 3 (satellites)**: the
  waiting alerts orbit the front ring with their icon and are brought with a tap.
  **Mute** removes the wave and sends the alert behind; if the alert's text
  changes, it comes back.
- **A new critical alert opens its system on its own** only when on the board.
- **Size by available space:** the object shrinks (`--fit`) if the front disc
  does not fit with the alert zoom. Solves finding 3 of zumly-radial.
- **Board with pulse:** connection status, a line with what calls and the latest
  changes of the entities shown.
- **Detail:** the same controls, the Home Assistant entities behind each channel
  and the camera image when there is motion.

## Demo notes

- The unit is the installation's (the demo comes in °F).
- The demo's alarm code is `1234` (it is in `model.ts`).
- "Poorly Installed Door" jams on purpose when locked: it stays as a critical alert.
- The demo's sirens start on: it is the first alert that appears.
- The humidity and power channels look first for two simulated sensors of the
  local test installation (`sensor.humedad_simulada`, `sensor.consumo_simulado`)
  and then for the demo's.
