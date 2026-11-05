# Pulse cameras

London's roads as Pulse objects, from Transport for London's open data: what
is happening on them now with the picture of the nearest traffic camera, the
main corridors and the works, and the cameras themselves, above all the ones
that watch an incident. Everything is read from the browser: no server, no
key. Powered by TfL Open Data.

| System | Channels | Source | Alerts |
|---|---|---|---|
| Incidents | Worst (the worst unplanned disruption, with the still of the nearest camera within 600 m in the face and its last clip in the detail), on the map (the unplanned ones and their cameras), closures | `Road/all/Disruption`, every 2 min; the JamCams | TfL's severity, for what was not planned only: severe or serious loudly, moderate (or a closure) softly; works and events never call |
| Corridors | The 24 corridors as switches, the works (planned, with how many bring delays) | `Road`, every 2 min | A corridor in serious status softly, closed or severe loudly |
| Cameras | Watching (the cameras on an incident, each fresh, frozen, dark or off), available (the ~900 as ticks on a swarm ring), on the map | `Place/Type/JamCam`, every 30 min; each watched still's `Last-Modified`, every 2 min | A camera watching an incident that is off, does not answer, or has shown the same picture for over 20 minutes, softly |

Within a severity the incidents are ordered by what happened before what
broke: a collision or a hazard (a fire) before a breakdown, a breakdown before
a faulty signal. Every camera is an object of its own: tap it in any list (or
an incident, which opens the camera that watches it) and the board zooms into
it: its picture, what is within a kilometre (calling when it is an incident),
and where it is on the street map.

Nothing here looks inside the pictures: the alerts come from TfL's data and
from the stills' own age, not from the image. The stills are TfL's public
JamCams, 352 by 288 pixels.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:cameras
```

Open [the app](http://127.0.0.1:5184). To explore without TfL, open
[the recorded evening](http://127.0.0.1:5184/?demo).

| Parameter | What it does |
|---|---|
| `?systems=incidents,cameras&mode=orbit` | What the page shows; the gear chooses within it |
| `?start=incidents` | Open on one system |
| `?demo` | The recorded evening instead of TfL |

## The feeds

TfL's Unified API (`api.tfl.gov.uk`) answers a page from any origin, without a
key for this use: `Place/Type/JamCam` (some 890 cameras, each with its still
and a ten-second clip on TfL's S3 bucket, a direction and whether it is
switched on; about a megabyte, so it is asked every half hour),
`Road/all/Disruption` (works, breakdowns, collisions, hazards, each with a
point, a severity and whether it closes the road) and `Road` (the corridors'
status). A still changes every few minutes; the app asks it again every two.
For the cameras that watch an unplanned incident it also reads each still's
`Last-Modified` with a GET (TfL's bucket allows GET from a page, not HEAD):
that is how a frozen or dark camera is known.

## The demo

`demo/recording.json` is TfL's answer on November 5, 2026 at 17:50 London
time, trimmed to the fields the parsers read, and `public/demo/` the stills of
the eight cameras that watched an unplanned incident then, recorded by
`demo/scripts/record.mjs` (`node apps/cameras/demo/scripts/record.mjs` from
the root). Nothing is made up: a building fire closing Seven Sisters Road
with the fire engines on the nearest camera, a breakdown on the A40, and a
camera on Westhorne Avenue switched off over another breakdown. The stills of
the other cameras, opened from a list, are asked of TfL.

Contains public sector information licensed under the Open Government Licence
v3.0; powered by TfL Open Data.
