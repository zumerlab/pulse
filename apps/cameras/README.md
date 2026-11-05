# Pulse cameras

A city's roads as Pulse objects: what is happening on them now with the
nearest traffic camera, live where the camera streams; what the signs and
the corridors say; and the cameras themselves, above all the ones that watch
an incident. Two cities, from their public feeds, read from the browser:

- **The Bay Area** (`?city=bayarea`, the default): Caltrans District 4's 773
  cameras, about a quarter of them with a live stream (HLS, played in the
  face), its freeway signs, and the incidents the California Highway Patrol
  is working, from Caltrans QuickMap.
- **London** (`?city=london`): Transport for London's ~890 JamCams (a still
  every few minutes and a ten-second clip), its road disruptions and its
  corridors. Powered by TfL Open Data.

| System | Channels | Alerts |
|---|---|---|
| Incidents | Worst (the worst unplanned incident, with the nearest camera within 600 m in the face: its stream, or its still), on camera (the worst incident a camera sees, a streaming one first at the same severity), on the map, closures | The severity of what was not planned: severe or serious loudly, moderate (or a closure) softly; works and events never call |
| Roads | Signs (the Bay Area's: what they say, and whether one warns of a crash, a stall, a fire now), corridors (London's 24), works | A sign warning of something now softly; a London corridor in serious status softly, closed or severe loudly |
| Cameras | Watching (the cameras on an incident: fresh, frozen, dark or off), live (the working stream nearest the worst incident, every streaming camera a row), available (all of them, ticks on a swarm ring), on the map | A camera watching an incident that is off, dark or frozen, softly |

Every camera is an object of its own: tap it in any list (or an incident,
which opens the camera that watches it) and the board zooms into it: its
picture (its stream where it has one), what is within a kilometre, where it is
on the street map.

Nothing here looks inside the pictures: the alerts come from the feeds and
from the stills themselves (their age, their size), not from the image.

## The CHP's incidents

The CHP's CAD feed as QuickMap publishes it is statewide KML; the app keeps
the Bay Area (Gilroy to Cloverdale, short of Sacramento and Stockton) and only
traffic, each code in words: 1179 a collision with an ambulance on its way
and 1180 one with major injuries call loudly; 1181 and 1183 (minor or unknown
injuries), a fire and a road closed softly; 1182 (no injuries), hit and runs,
hazards, animals and the crews' assists are read, not called. The CHP's other
calls (an alert for a missing person) are left out, and so are the officers'
notes: an incident is its kind, its place and its time.

## Live video

A camera with a stream plays it in the face and in the detail through the
core's `<pulse-video>` (`Picture.video`): muted, only while it is seen (a
view behind, a hidden tab: paused, nothing downloaded), with hls.js where the
browser has Media Source and the browser's own HLS elsewhere, its still as
the poster and the still again if the stream does not answer. Caltrans'
streams come and go: on November 5, 2026 about half of those tried answered
404. For the cameras near an unplanned incident and the first live ones, the
app checks both: a still under 16 kB is Caltrans' "Temporarily Unavailable"
card, and a stream that answers with nothing is down; either makes the
camera dark, chosen only when no other camera is near.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:cameras
```

Open [the Bay Area](http://127.0.0.1:5184) or
[London](http://127.0.0.1:5184/?city=london). To explore without the feeds,
add `?demo`: each city as recorded.

| Parameter | What it does |
|---|---|
| `?city=bayarea` or `?city=london` | Which city |
| `?systems=incidents,cameras&mode=orbit` | What the page shows; the gear chooses within it |
| `?start=cameras` | Open on one system |
| `?demo` | The city as recorded instead of its feeds |

## The feeds

TfL's Unified API (`api.tfl.gov.uk`) and Caltrans' (`cwwp2.dot.ca.gov`)
answer a page from any origin, without a key; QuickMap does not, so the dev
server (and `vite preview`) asks it for the page at `/net/chp/…`
(`vite.config.ts`); a static build needs a proxy of its own. The incidents,
the signs and the corridors are asked every two minutes, the list of cameras
every half hour (it is about a megabyte). A still changes every few minutes
and is asked again every two. TfL's bucket allows a page's GET, not its HEAD:
the stills' `Last-Modified` and size are read with a GET.

## The demo

`demo/recording-<city>.json` is each city's answers, trimmed to the fields the
parsers read, and `public/demo/<city>/` the stills of the cameras the app
checks, both made by `demo/scripts/record.mjs` (`node
apps/cameras/demo/scripts/record.mjs [bayarea|london]` from the root).
Nothing is made up. London is November 5, 2026 at 17:50: a building fire
closing Seven Sisters Road with the fire engines on the nearest camera, a
breakdown on the A40, a camera on Westhorne Avenue switched off over another
breakdown. The Bay Area is the same day at 13:24 Pacific: a collision with an
ambulance on its way, two fires, four roads closed, most of the cameras near
them dark. Its streams are not recorded: they play live when the demo is
online, over the recorded stills.

Contains public sector information licensed under the Open Government Licence
v3.0; powered by TfL Open Data. Caltrans and CHP data through Caltrans
QuickMap.
