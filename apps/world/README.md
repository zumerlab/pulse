# Pulse world

The world outside as four Pulse objects, read straight from public feeds in
the browser. No server, no sign-in, nothing to install: the page is live
wherever it is served.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Sun | Geomagnetic (Kp), solar wind, X-rays, radiation | NOAA Space Weather Prediction Center: the NOAA scales, the planetary K index, the solar wind at L1, GOES X-rays | NOAA's own scales: G1, R1 and S1 call softly; G3, R3 and S3 and up call loudly. Fast wind or a southward Bz call softly |
| Earth | Strongest, nearest, last 24 hours | USGS, every M2.5+ of the past day | M6 or a yellow PAGER alert calls softly; M7 or an orange or red alert calls loudly. A quake near you calls by distance |
| Sky | Temperature, wind, rain, UV index, air | Open-Meteo forecast and air quality for the place | Freezing or extreme heat; gusts over 60 km/h (90 loudly); rain coming; very high UV; poor air (very poor loudly) |
| Services | One ring per status page | Statuspage public summaries (GitHub, Cloudflare, OpenAI, npm, Vercel by default) | The page's own indicator: minor calls softly, major or critical loudly. The degraded components are the painted segments; the incident opens from the alert |

The wind ring carries a bearing: the arrow on the ring points where the wind
comes from, north at the top. Temperature, Kp and the solar wind have a day
ring in the detail, from the feed's own past. The strongest quake's face is
a street map around its epicenter (wider for a bigger one), the day's other
quakes nearby as dots sized by magnitude; the nearest's is a map with you and
it; the last 24 hours, a globe turned to the strongest with all of them. A
map opens big, live and zoomable in its detail. The detail lists the quakes,
and each is an object of its own: its epicenter on the map, its depth, how far
from you, when; the epicenter's detail opens it on USGS.

Nothing out there takes a command: an alert is marked seen, or opens the
incident.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:world
```

Open [the app](http://127.0.0.1:5176). It reads the feeds for Buenos Aires
until told otherwise. To explore without the feeds, open
[the recorded stormy day](http://127.0.0.1:5176/?demo): a G2 storm, an M7.1
in the Kermadec Islands, rain on the way and GitHub Actions down.

## Options

All in the URL, so a link or a kiosk fixes them:

| Parameter | What it does |
|---|---|
| `?at=-34.6,-58.4&place=Buenos Aires` | Where the sky is read (also `?lat=&lon=`). `?here` in the status line asks the browser |
| `?services=github,cloudflare,status.example.com` | Which status pages to follow: a short name from the list in `feeds.ts`, or any Statuspage host |
| `?systems=sun,sky&mode=orbit&start=sky` | What the page shows; the gear chooses within it |
| `?demo` | The recorded day instead of the feeds |

## Feeds

Each feed is a URL and a parser in `feeds.ts`, asked again on its own clock
(two minutes for status pages and earthquakes, five for the sun, ten to
thirty for the sky). A feed that fails keeps what it last said and is named
in the status line; nothing answering at all shows a panel with a retry and
the demo. The demo runs the same parsers over recorded answers in each feed's
shape, so what the parsers accept is what the feeds send.

The feeds are public and send `Access-Control-Allow-Origin: *`, which is what
lets a page read them from any origin. A feed that stops doing so would need
a small proxy; none does today.
