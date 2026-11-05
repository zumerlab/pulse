# Pulse Signal K

A boat as Pulse objects, read from a [Signal K](https://signalk.org) server:
the one on board (OpenPlotter, a Raspberry Pi, Victron's Venus OS with the
Signal K plugin) or the public demo vessel at `demo.signalk.org`. The app
reads the vessel's full tree once over REST, then follows the WebSocket
stream of deltas; what the boat can be told goes back as a PUT.

Channels appear when the vessel reports their paths. A boat without an
engine, or without tanks, does not show them. The alert on a path is the
server's own notification when it raises one (its zones, an anchor watch
plugin); otherwise a threshold any skipper would set.

| System | Channels | Alerts |
|---|---|---|
| Navigation | Speed (with the course as a bearing), heading, depth | Shallow water: 3 m calls softly, 1.5 m loudly |
| Traffic | Closest approach (a radar of the vessels around, each turned to its course with six minutes of way ahead), on the chart (the street map, to drag), nearest (an arrow on the ring pointing at it) | A vessel that will pass within 0.5 nm in the next 20 minutes calls softly; within 0.25 nm in 10 minutes, or already that close, loudly |
| Wind | Apparent (angle as a bearing, the bow at the top), true, barometer, temperature | Apparent wind of 30 knots calls softly, 40 loudly |
| Electrical | House battery, engine battery, solar | House bank at 30% calls softly, 15% loudly; engine battery under 12 V |
| Tanks | Fuel, fresh water, holding tank | Fuel or water at 20% (10% loudly); holding tank at 80% (95% loudly) |
| Engine | Revolutions, coolant, oil pressure | Coolant at 92°C (100 loudly); low oil pressure with the engine running |
| Steering | Autopilot, target, rudder, anchor | The anchor dragging past its radius |

The traffic is read as a skipper reads a chartplotter: not where each vessel
is now but how close it will pass and when, the closest point of approach
(CPA) and the time to it (TCPA), from both courses and speeds. A freighter
three miles off on a crossing course calls; a fishing boat a few cables away
and opening does not. Each vessel is an object of its own, opened from its
row: how it passes, where, how it moves, and what its AIS says (MMSI, type,
length, destination), with a way out to MarineTraffic. The vessels on the
stream are gathered once a second, so a busy channel does not repaint the
board for each ship.

The autopilot is the one thing the boat is told: its state is a choice ring
(standby, auto, wind, route) and its target a dial, both PUT to their Signal K
paths (`steering.autopilot.state`, `steering.autopilot.target.headingMagnetic`),
for a server with a plugin that handles them (signalk-autopilot for Raymarine,
the pypilot plugin). Numbers come in SI and read in a skipper's units:
knots, degrees, °C, hPa, litres, bar, rpm.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:signalk
```

Open [the app](http://127.0.0.1:5177). The connect panel asks for the
server's address: `http://openplotter.local:3000` on board, or
`https://demo.signalk.org` for the demo vessel. A token is only needed when
the server asks for one (a read-only user works for watching).

To explore without a server, open
[the recorded yacht](http://127.0.0.1:5177/?demo): Tehuelche, motor-sailing
off Mar del Plata, with shallow water, a low house bank and a full holding
tank calling.

## Options

| Parameter | What it does |
|---|---|
| `?server=https://demo.signalk.org&token=…` | Where to look, and the token when the server wants one |
| `?systems=navigation,wind&mode=orbit&start=navigation` | What the page shows (a helm screen); the gear chooses within it |
| `?demo` | The recorded yacht instead of a server |

## History

The day rings read the server's history API (`/signalk/v1/history/values`),
which a server has when a history plugin (signalk-to-influxdb2 and the like)
is installed. Without one, the detail shows no day ring.

## Mixed content

A page served over HTTPS cannot open `ws://` to a server on the boat's LAN.
Serve the page over HTTP on the boat, or reach the server over HTTPS.
