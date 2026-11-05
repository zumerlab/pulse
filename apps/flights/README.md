# Pulse flights

The sky as Pulse objects: the aircraft squawking an emergency anywhere in
the world, the traffic around a place and what is odd in it, and the whole
sky on a globe. The page asks the dev server, which asks the networks for it.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Emergencies | Squawking: everyone on 7700 (emergency), 7600 (radio failure) or 7500 (unlawful interference), on the globe | A community ADS-B network's `/v2/squawk/{code}`, every 30 s | 7700 and 7500 call loudly, 7600 softly; the action opens the aircraft on the network's map |
| Around a place | Traffic (a radar, 250 nm to the rim), arriving, departing, holding | `/v2/point/{lat}/{lon}/{nm}`, every 15 s | None: readings |
| Anomalies | Fast descents (over 4,000 ft/min below 10,000 ft), lost signal (quiet for over a minute in the air), low and slow (under 1,500 ft and 120 kn, over 15 nm from any airport) | The region's aircraft and a short trail per aircraft | A fast descent calls loudly, the others softly; each opens on the map |
| The sky | In the air (OpenSky's count, a dot per 5° cell on the globe), registered in | OpenSky `states/all`, every 15 minutes | None |

Every aircraft is an object of its own: tap it in any list or on a ring
(Traffic, Arriving, Squawking, the anomalies) and the board zooms into it. Its
channels: flight (on the street map with its trail, altitude as the band, the
track as a bearing, its anomaly as the alert), speed, from here (a radar of
itself), squawk. The flight's map is at the scale of its last three minutes:
an airliner at cruise sees about a hundred kilometres, one taxiing the apron.
Tap the map and it opens big and live, following the aircraft: the wheel, a
pinch, or + and − zoom it, and a button opens it on the network's own map. On
the groups axis the board is the region's aircraft by what they are doing
(arriving, departing, holding, en route, on the ground): past twelve
aircraft, one object per phase with the sky's channels read within it (only
what that phase holds: a phase with no fast descent has no such channel),
each aircraft one tap further (one object each once the gear keeps twelve or
fewer).

On the region's radar and on each aircraft's map an aircraft in the air is a
mark turned to its track, with six minutes of way ahead of it on the radar;
the radar's rings say how far they are.

The globe is the core's `globe`: the disc as the Earth, turned to a center,
with the coasts and a dot per thing at its latitude and longitude. The radar
is the core's `plots`, the street map its `map` (OpenStreetMap's tiles).

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:flights
```

Open [the app](http://127.0.0.1:5182). It listens around Buenos Aires until
told otherwise. To explore without the networks, open
[the recorded sky](http://127.0.0.1:5182/?demo): an airliner squawking 7700
over the Atlantic, Buenos Aires with forty aircraft around it, a hold, a fast
descent, a lost signal, a Cessna low and slow.

## Options

| Parameter | What it does |
|---|---|
| `?at=-34.6,-58.4&place=Buenos Aires&nm=250` | The region: its center and its radius (250 nm at most, the networks' limit). "Use my location" in the status line asks the browser |
| `?network=adsb.lol` | Which network answers: `adsb.lol` (default), `adsb.fi`, `airplanes.live` (see below), or the URL of any API with the same v2 shape that lets the page read it |
| `?opensky=/net/opensky` | Where OpenSky is: by default the dev server's way to it; a URL of your own proxy otherwise |
| `?axis=groups` | Open on the aircraft by phase of flight (one object each once the gear keeps twelve or fewer) |
| `?systems=emergencies,anomalies&mode=orbit` | What the page shows; the gear chooses within it |
| `?demo` | The recorded sky instead of the networks |

## The networks

The community networks (adsb.lol, airplanes.live, adsb.fi) share the
ADSBExchange v2 API, free and without a key: an aircraft is `hex`, `flight`,
`r`, `t`, `alt_baro` (feet, or `ground`), `gs`, `track`, `baro_rate`,
`squawk`, `emergency`, `lat`, `lon`, `seen`, and `dst`/`dir` from the point
asked. The app asks `/v2/sqk/{code}` and `/v2/lat/{lat}/lon/{lon}/dist/{nm}`,
the paths adsb.lol and adsb.fi both answer (adsb.fi has no `/v2/squawk` or
`/v2/point`, and around a point it lists the aircraft under `aircraft`
rather than `ac`). A network takes one question a second (adsb.fi answers a
second one at once with 429), so they are asked in turn. OpenSky's anonymous
allowance is 400 credits a day and a whole-sky call costs 4, which is why the
sky is asked every 15 minutes; an account raises it. Each question is asked
again on its own clock; a network that stops answering is named in the status
line; nothing answering shows a panel with a retry and the demo.

None of them lets a page read it: adsb.lol and adsb.fi send no
`Access-Control-Allow-Origin`, OpenSky sends only its own origin. So the dev
server (and `vite preview`) asks them for the page: `/net/adsb.lol/…`,
`/net/adsb.fi/…`, `/net/airplanes.live/…` and `/net/opensky/…` are their
APIs (`vite.config.ts`). A static build needs a proxy of its own, given with
`?network=` and `?opensky=`.

airplanes.live answers 403 and asks to be written to first
(contact@airplanes.live, with a description of the project). Not verified: the
networks' coverage outside Europe and North America, which depends on their
feeders (Buenos Aires had about twenty aircraft on both on 3 November 2026).
