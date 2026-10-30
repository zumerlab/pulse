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
- From a link: `?demo=home` (also `sections`, `arsaboo`, `teachingbirds`,
  `kernehed`, `jimpower`). The URL keeps the home while it is open; "Leave the
  demo" returns to the sign-in or to the saved session.
- Each home builds its own object: a home without an alarm has no alarm
  channel, one without updates no Maintenance. `home` and `sections` are the
  rich ones; the other four are mostly sensors.
- The Playwright suite runs against these homes, so the whole app is tested
  without a Home Assistant.

## Systems

The channels name the entities of Home Assistant's `demo` integration (the
local test installation) and fall back to the first entity of their kind, so
another installation, or one of the demo homes, builds its own object.

| System | Channels | Controls on the ring |
|---|---|---|
| Lights | all lights · brightness of the first dimmable one · plugs | segments = `light.toggle`; dial = `brightness_pct` |
| Climate | two thermostats · one with a range (Ecobee) · humidity | dial = `climate.set_temperature` |
| Security | alarm · sirens · locks · motion, water and smoke sensors | alarm modes (the demo's code), sirens, locks |
| Openings | two covers with position · garage door · irrigation valves | dial = `set_cover_position`; valves |
| Media | players · volume of the first one | play/pause; dial = `volume_set` |
| Energy | power (W) · carbon monoxide · hot water | dial = `water_heater.set_temperature` |
| Maintenance | updates · vacuums | install; start / return to base |

The models are in `model.ts`: each channel is a function of the state. If no
entity fits, the channel does not appear. A channel that follows one entity
takes its name (the face says "Thermostat", "Kitchen shutter").

## Three views of the board

A selector at the top (remembered in the browser) changes how the whole home is
looked at. All three use the same data and open the same system when tapped.

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
not appear in the build (`tune.ts`).

## Alerts: rules over the state

| Alert | Rule | Action |
|---|---|---|
| Sirens sounding (critical) | some `siren` is `on` | Turn off |
| Lock jammed (critical) | `lock` in `jammed` | Retry |
| Motion in the backyard (critical) | sensor `on` **and** alarm armed | Got it |
| Water in the basement (critical) | humidity sensor `on` | Got it |
| Alarm triggered (critical) | `triggered` / `pending` | Disarm |
| Heating with windows open (minor) | heating `heating` **and** windows open | Close windows |
| Unlocked with the alarm armed (minor) | alarm armed **and** locks open | Lock |
| Garage door open at night (minor) | garage open **and** sun below the horizon | Close |
| Carbon monoxide (minor ≥ 35 ppm, critical ≥ 100) | `sensor.carbon_monoxide` | Got it |
| Updates (minor) | `update` is `on` | Install |

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
