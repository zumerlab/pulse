# Pulse world

The calamities of the world as five Pulse objects, read straight from public
feeds in the browser: earthquakes, cyclones, floods, wildfires and volcanoes.
No server, no sign-in, nothing to install: the page is live wherever it is
served.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Earthquakes | Strongest, nearest, last 24 hours | USGS, every M2.5+ of the past day | M6 or a yellow PAGER alert calls softly; M7 or an orange or red alert calls loudly. The nearest calls by distance and magnitude (M4.5 within 300 km softly, M5.5 within 150 km loudly) |
| Cyclones | Worst, nearest, active | GDACS's tropical cyclones now; the path of each from NASA's EONET | GDACS's own alert: orange calls softly, red loudly. The nearest within 1,000 km calls softly, within 300 km loudly |
| Floods | Worst, nearest, active | GDACS's floods now | GDACS's alert; the nearest within 200 km softly, 50 km loudly |
| Wildfires | Worst, nearest, active | GDACS's wildfires now (the hundred most recently updated) | GDACS's alert; the nearest within 100 km softly, 25 km loudly |
| Volcanoes | Worst, nearest, active | The US observatories' volcanoes above normal (USGS), and GDACS's eruptions of the past 30 days anywhere | An observatory's aviation code orange calls softly, red loudly (yellow is listed, calm); GDACS's alert the same. The nearest within 150 km softly, 30 km loudly |

GDACS (the Global Disaster Alert and Coordination System, of the UN and the
European Commission) rates each event green, orange or red by its likely
humanitarian impact: how strong it is and how many people live where it
strikes. A category 4 typhoon over open sea can be green; that is GDACS's
reading, not a mistake.

The worst of each hazard is its face: a street map around it with the others
of its kind, a cyclone with the path it took. The nearest is a map with you
and it; the active, a globe with all of them, and its detail lists them. Each
event is an object of its own, opened from the face of the worst or the
nearest, or from its row: where it is, its alert, how far from you, since
when; its detail opens it on GDACS or USGS. A map opens big, live, zoomable
and draggable in its detail.

A US volcano says more of itself: what it is doing in its observatory's
words (the synopsis of the latest notice, over the volcano's picture), its
ground alert level among the four (normal, advisory, watch, warning, a choice
ring with the one in force marked), its summit and its threat by the national
volcano early warning system, where it is, how far from you, and when the
observatory last wrote.

USGS marks a large quake at sea with a tsunami flag. It is not a warning: the
strip says "at sea: see tsunami.gov". The tsunami centers' own bulletins do
not let a page read them (no `Access-Control-Allow-Origin`), so they are not
here yet.

Nothing out there takes a command: an alert opens the event's page, or is
marked seen.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:world
```

Open [the app](http://127.0.0.1:5176). "Near you" is Buenos Aires until told
otherwise. To explore without the feeds, open
[the recorded day](http://127.0.0.1:5176/?demo): an M7.1 at sea in the
Kermadec Islands, a red typhoon east of Luzon, an orange flood in Bangladesh
and a green one 178 km from Buenos Aires, an orange wildfire in Western
Australia, and Kilauea on watch. The events are made up; the places are real.

## Options

All in the URL, so a link or a kiosk fixes them:

| Parameter | What it does |
|---|---|
| `?at=-34.6,-58.4&place=Buenos Aires` | Where "near you" is (also `?lat=&lon=`). "Use my location" in the status line asks the browser |
| `?systems=quakes,cyclones&mode=orbit&start=quakes` | What the page shows; the gear chooses within it |
| `?demo` | The recorded day instead of the feeds |

## Feeds

Each feed is a URL and a parser in `feeds.ts`, asked again on its own clock:

| Feed | URL | Every |
|---|---|---|
| Earthquakes | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson` | 2 min |
| Tropical cyclones, floods, wildfires, eruptions | `www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC` (`FL`, `WF`, `VO`) | 10 min for cyclones, 30 for the rest |
| Storm tracks | `eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=open` | 30 min |
| US volcanoes above normal | `volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes` | 10 min |
| Where the US volcanoes are, how high, their threat and picture | `volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes` | once a day |
| The latest notice of each volcano above normal | `volcanoes.usgs.gov/hans-public/api/notice/getNotice/<id>` | with the list |

A feed that fails keeps what it last said and is named in the status line;
nothing answering at all shows a panel with a retry and the demo. The demo
runs the same parsers over recorded answers in each feed's shape, so what the
parsers accept is what the feeds send.

The feeds are public and send `Access-Control-Allow-Origin: *`, which is what
lets a page read them from any origin. A feed that stops doing so would need
a small proxy; none does today.
