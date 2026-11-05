# Pulse fleet

A fleet as Pulse objects: the trams of Helsinki as they move, from HSL's
public high-frequency positioning feed. Every vehicle of the city's transit
publishes its position, speed, heading, timetable offset, occupancy and doors
once a second over MQTT, public, no credentials, over WebSocket for browsers.
The app listens straight from the page: no server in between.

A fleet is read two ways:

| Axis | Objects | Channels |
|---|---|---|
| Systems (the fleet by dimension) | Service, Lines, Load, Fleet | On time (a tick per vehicle, the late ones painted), running early; lines (a segment per line), out on the lines; crowding (a tick per vehicle), at a stop; reporting, GPS (a tick per vehicle, the blind ones painted), silent |
| Groups (one object per line; with one line ticked in the gear, one per vehicle) | Line 9, … (Tram 6 → Arabia, …) | A line: the fleet's channels read within it, its vehicles as the ticks. A vehicle: timetable (behind or ahead, as a band), motion (speed, the heading as a bearing), load, where, doors, and on the live feed the vehicle itself (its model and a photo) |

The ticks are the core's swarm ring: switches past twelve members draw as
one SVG with a tick per member, so eighty trams are eighty ticks and a
thousand buses a thousand hairlines. The detail lists the members, the
failing first.

Alerts: a tenth of the fleet more than three minutes late calls softly, a
quarter (or three vehicles over six minutes) loudly; half the lines with a
late vehicle; three vehicles over 80% full; two without a GPS fix. On a
vehicle, three minutes late calls softly, six loudly; two minutes early,
over 90% full, or no GPS fix call softly. Nothing here takes a command: a
late tram is seen, not fixed.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:fleet
```

Open [the app](http://127.0.0.1:5178). It listens to the trams. To explore
without the feed, open [the recorded trams](http://127.0.0.1:5178/?demo):
eighty-four on eleven lines, ten of them late, three crowded, two without a
GPS fix.

## Options

| Parameter | What it does |
|---|---|
| `?modes=tram,bus` | Which vehicles to listen to: `tram`, `bus`, `metro`, `train`, `ferry`. Trams by default; the buses are over a thousand objects |
| `?routes=1006,1007` | Only these lines (HSL route ids: `1006` is tram 6) |
| `?axis=groups` | Open on the lines, one object each (a vehicle each once the gear keeps twelve or fewer), instead of the fleet by dimension |
| `?systems=service,fleet&mode=list&start=service` | What the page shows; the gear chooses within it |
| `?demo` | The recorded trams instead of the feed |

## The feed

`wss://mqtt.hsl.fi:443/`, topics `/hfp/v2/journey/ongoing/vp/<mode>/#`
(vehicle positions of a mode) or `/hfp/v2/journey/ongoing/vp/<mode>/+/+/<route>/#`
(one line). The payload is `{"VP": {...}}` with `spd` in m/s, `hdg` in
degrees, `dl` the offset from the timetable in seconds (negative behind),
`occu` 0 to 100, `drst` the doors, `loc` where the position comes from. A
vehicle that falls silent for three minutes leaves the fleet. The app keeps a
small MQTT 3.1.1 client of its own (`mqtt.ts`): connect, subscribe, receive,
ping; no dependency.

The feed moves faster than a screen should: changes are gathered and handed
to the board once a second, and only what a reading can see counts as a
change (a position alone does not repaint). The status line shows the
messages a minute.

## The photos

A vehicle's number in the feed is the one painted on its side, and the
operator comes as a code (HSL's documentation has the table: 22 is Nobina, 40
the trams, 50 the metro). On the live feed, each vehicle's own object has a
Vehicle channel: its model or its operator and its number ("Artic 405",
"Nobina 845"), and a photo from [Wikimedia Commons](https://commons.wikimedia.org/)
with its author and license on the face, the photo big in the detail and a
way to its page (`photos.ts`).

- A tram's or a metro train's number tells its model (trams 31–70 Nr I,
  71–112 Nr II, 401–499 Artic, 601–699 Artic X54; the metro by its hundreds,
  M100, M200, M300). Its own photo is looked for in its model's Commons
  category, by the number in the title (a third of the Artics have one); when
  it has none, a photo of the model chosen by hand stands in, said so
  ("another Artic").
- A bus's number is only its operator's count: it shows a photo of itself,
  found by its operator's name and its number, from here (a category or a
  title that says so: Nobina runs buses in Sweden too), or none. Few have one.

Commons is asked from the browser, once per vehicle shown, one question at a
time (its rate limits answer a burst with 429); a failure asks again five
minutes later. The demo's trams are not real vehicles: no photos there.

Documentation: [Digitransit, high-frequency positioning](https://digitransit.fi/en/developers/apis/4-realtime-api/vehicle-positions/high-frequency-positioning/).
