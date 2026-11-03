# Pulse flights

The sky as Pulse objects, read straight from the browser: the aircraft
squawking an emergency anywhere in the world, the traffic around a place and
what is odd in it, and the whole sky on a globe.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Emergencies | Squawking: everyone on 7700 (emergency), 7600 (radio failure) or 7500 (unlawful interference), on the globe | A community ADS-B network's `/v2/squawk/{code}`, every 30 s | 7700 and 7500 call loudly, 7600 softly; the action opens the aircraft on the network's map |
| Around a place | Traffic (a radar, 250 nm to the rim), arriving, departing, holding | `/v2/point/{lat}/{lon}/{nm}`, every 15 s | None: readings |
| Anomalies | Fast descents (over 4,000 ft/min below 10,000 ft), lost signal (quiet for over a minute in the air), low and slow (under 1,500 ft and 120 kn, over 15 nm from any airport) | The region's aircraft and a short trail per aircraft | A fast descent calls loudly, the others softly; each opens on the map |
| The sky | In the air (OpenSky's count, a dot per 5° cell on the globe), registered in | OpenSky `states/all`, every 15 minutes | None |

On the groups axis, one object per aircraft of the region, by category:
flight (altitude as the band, the track as a bearing, its anomaly as the
alert), speed, from here (a radar of itself), squawk.

The globe is the core's `globe`: the disc as the Earth, turned to a center,
with the coasts and a dot per thing at its latitude and longitude. The radar
is the core's `plots`.

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
| `?at=-34.6,-58.4&place=Buenos Aires&nm=250` | The region: its center and its radius (250 nm at most, the networks' limit) |
| `?network=adsb.lol` | Which network answers: `adsb.lol` (default), `airplanes.live`, `adsb.fi`, or any API with the same v2 shape |
| `?opensky=https://opensky-network.org/api` | Where OpenSky is (a proxy, if its CORS does not allow the page) |
| `?axis=groups` | Open on the aircraft, one object each |
| `?systems=emergencies,anomalies&mode=orbit` | What the page shows; the gear chooses within it |
| `?demo` | The recorded sky instead of the networks |

## The networks

The community networks (adsb.lol, airplanes.live, adsb.fi) share the
ADSBExchange v2 API, free and without a key: an aircraft is `hex`, `flight`,
`r`, `t`, `alt_baro` (feet, or `ground`), `gs`, `track`, `baro_rate`,
`squawk`, `emergency`, `lat`, `lon`, `seen`, and `dst`/`dir` from the point
asked. OpenSky's anonymous allowance is 400 credits a day and a whole-sky
call costs 4, which is why the sky is asked every 15 minutes; an account
raises it. Each question is asked again on its own clock; a network that
stops answering is named in the status line; nothing answering shows a panel
with a retry and the demo.

Not verified from where this was written: that the three networks and
OpenSky send `Access-Control-Allow-Origin` to a page (the networks are built
for scripts and pages alike; a small proxy fixes any that does not), and the
networks' coverage outside Europe and North America, which depends on their
feeders.
