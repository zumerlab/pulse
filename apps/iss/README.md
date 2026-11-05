# Pulse ISS

The International Space Station as Pulse objects: its air, water, power,
attitude and links from NASA's public telemetry, where it is and who is
aboard, and the launches coming up anywhere. One object per discipline, the
way a flight controller's console splits the station. Everything is read from
the browser: no server, no key.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Air | Pressure (mmHg, with psi and the airlock), CO₂ and O₂ (the Lab's or Node 3's analyzer, the one that changed last or the viewer's pick), temperature, the five air conditioners | Telemetry | Pressure under 710 mmHg or down 3 mmHg in ten minutes calls loudly, outside 735–790 softly; CO₂ from 4 mmHg softly, from 6 loudly; O₂ under 145 or over 185 softly, under 125 loudly; the cabin outside 18–28 °C softly |
| Water | Clean water, waste water, urine tank, the three processors (urine, water, oxygen) | Telemetry | Clean water at 10% or less, a waste tank at 90% or more, softly |
| Power | The eight solar array wings as switches (drive voltage and current), the alpha joints (the port one as a bearing), the beta angle | Telemetry, and whether the station is in the sun | A wing without voltage while at least four have it, softly, that wing painted |
| Thermal | The two external ammonia loops (temperature and flow), the radiator joints | Telemetry | None |
| Attitude | CMG momentum, the four gyroscopes, the control mode | Telemetry | Momentum from 80% softly, from 95% loudly; fewer than four gyroscopes in use; free drift softly; a loss of attitude control loudly |
| Station | Its mode, the crew, what is docked (eighteen ports), its mass | Telemetry, Launch Library 2's station and expedition | Survival or assured safe crew return mode loudly; a spacewalk under way softly |
| Orbit | Position on the globe (with the track ahead, your place and the heading as a bearing), the ground track on the map (where it is in eight minutes, the next sunrise or sunset), from you (distance and bearing, above your horizon or not) | wheretheiss.at | None |
| Links | Signal (whether the ground hears the station), the four Ku-band video downlinks (with a way out to NASA's live views), the S-band string | Telemetry | Loss of signal for over half an hour, softly |
| Launches | Next launch (the countdown, its webcast), the next to the station, this week | Launch Library 2 | A launch within the hour, or in flight, softly, with the webcast as the action when there is one |

Every launch is an object of its own: tap it in a list and the board zooms
into it, its countdown, its pad on the street map, its mission.

The video is not drawn in the object: the station's live views and the
launches' webcasts are streams on NASA's page, YouTube or X, which a page can
only embed as an `iframe`, and the core draws pictures, not frames. They are a
way out instead: the Ku-band video channel and the crew (with "Watch it" on a
spacewalk) open [NASA's live page](https://www.nasa.gov/live/), and a launch
with a webcast opens it ("Watch it live" while it streams).

The thresholds are this app's own, near the nominal values the stream shows;
they are not NASA's flight rules. A reading that has not changed for six hours
or more says how old it is and does not call: the air analyzers sample now and
then, and the stream only sends what changes.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:iss
```

Open [the app](http://127.0.0.1:5183). "From you" is measured from Buenos
Aires until told otherwise. To explore without the feeds, open
[the recorded pass](http://127.0.0.1:5183/?demo).

## Options

| Parameter | What it does |
|---|---|
| `?at=-34.6,-58.4&place=Buenos Aires` | Where "from you" is measured. "Use my location" in the status line asks the browser |
| `?systems=air,power,launches&mode=orbit` | What the page shows; the gear chooses within it |
| `?start=launches` | Open on one system |
| `?demo` | The recorded pass instead of the feeds |

## The feeds

**The telemetry** is NASA's public ISS stream on Lightstreamer
(`push.lightstreamer.com`, adapter set `ISSLIVE`), the one ISS Mimic and
NASA's ISSLive read. `lightstreamer.ts` is a small client of its protocol
(TLCP 2.5 over WebSocket): a session, one MERGE subscription of the 86 PUIs in
`telemetry.ts`, and the updates, each carrying only the fields that changed.
Each PUI's `TimeStamp` is hours since the start of the year, counted from day
1; its `Value` is a number or a state code. The clock (`TIME_000001`) carries
the signal in its `Status.Class`: 24 when the ground hears the station. The
names and states of the PUIs come from ISS Mimic's table of the public
telemetry (`ISS_Public_Telemetry.xlsx`); the units are what the stream really
sends, which is not always what that table says (pressures come in mmHg, not
psi). About one update a second arrives; the app passes them on once a
second.

**The position** is wheretheiss.at, every five seconds (it allows 350
questions in five minutes), and the track ahead, ten points eight minutes
apart, every five minutes.

**The station, its crew and the launches** are Launch Library 2
(`ll.thespacedevs.com`, version 2.3.0): the station and its expedition every
half hour, the next twelve launches every fifteen minutes (in its `detailed`
mode, the only one that lists the webcasts). It allows fifteen
questions an hour without a key, and answers 429 past that: the app keeps its
answers in `localStorage` for as long as they are good, so a reload does not
ask again, and an old one stands in when it says no.

Every feed lets a page read it; a feed that stops answering is named in the
status line, and nothing answering shows a panel with a retry and the demo.

## The demo

`demo/recording.json` is ten seconds of the station recorded on November 5,
2026 by `demo/scripts/record.mjs` (`node apps/iss/demo/scripts/record.mjs
[seconds]` from the root; it asks Launch Library three questions). The
telemetry is the raw lines the server sent, decoded by the same client and
parsers as the live stream and moved to now. Four things are made to call,
and `demo/source.ts` says so: Node 3's CO₂ at 4.6 mmHg, the gyroscopes'
momentum at 83%, the Falcon 9 of the list launching in 38 minutes; wing 3B had
no voltage in the recording already. Then the station flies along its track,
the alpha joint turns and the momentum creeps up.
