# Pulse · brief for designing the detail

26 October 2026

## What Pulse is

Pulse is a radial interface for states that compete for attention. Each system (lights, climate, security…) is a circular object with layers in depth: what matters now sits in front and the rest waits behind. It is built with Orbit (radial layouts in CSS) and Zumly (zoom navigation). Today the demo's data source is a real Home Assistant, but Pulse is the UI: it does not depend on it.

Navigation has three levels and is traversed by zooming:

1. **Board**: all the systems. There are three views: Grid, Orbit (`01-board-orbit.png`) and Layers.
2. **System**: the radial object of one system. The active channel sits in front and the others stay as rings behind (`02-system-climate.png`). The object already has direct controls: a dial that is dragged and segments switched on and off.
3. **Detail**: entered by tapping the disc of the front channel. **This is what needs designing.**

## The detail today

Screenshots `03` to `09`: the detail of the front channel of each system.

Today it is a form: title, big value, a button, a slider or a list of checkboxes. It works, but it breaks with everything before it. It leaves the radial object right where one expects to see more of the same object. It also uses small spaced uppercase labels ("CLIMATE · DETAIL"), which do not belong.

## What it has to be able to show

Each channel produces a reading with these parts. Not all of them are always there.

| Part | What it is | Example |
|---|---|---|
| Value | Big text and one line below | "68°" · "target" |
| Progress | A number from 0 to 1 | Window 70% open |
| Segments | 2 to 8, each with a name, on or off, its state in Home Assistant and, if it has one, an action | The 6 lights, the 4 locks, the alarm modes |
| Dial | Minimum, maximum, step, unit and current value; it is dragged | Target temperature, between the device's minimum and maximum |
| Alert | Minor or critical level, big text, why, the verb of the action, "in progress…" while it is being resolved, and which segments fail | "Jammed · Poorly installed door did not finish locking · Retry" |
| Camera | A live image when there is motion | Backyard |
| Entities | Which Home Assistant entities are behind and their state | `lock.front_door` · locked |

The 7 systems of the demo and their channels:

| System | Channels (control) |
|---|---|
| Lights | Lights (segments) · Living room brightness (dial) · Plugs (segments) |
| Climate | Heating (dial) · Air conditioning (dial) · Ecobee (dial) · Humidity (progress) |
| Security | Alarm (segments = modes) · Sirens (segments) · Locks (segments) · Sensors (segments + camera) |
| Openings | Living room window (dial) · Hall window (dial) · Garage door (one segment) · Irrigation (segments) |
| Media | Playing (segments) · Living room volume (dial) |
| Energy | Power (progress) · Carbon monoxide (progress) · Hot water (dial) |
| Maintenance | Updates (segments) · Vacuums (segments) |

## Rules already decided

- **What is shown is what was confirmed, not what was asked.** A command marks its segment or dial as "sending" (it beats) until Home Assistant confirms, or up to 8 s. If it fails, it goes back to the previous value and the error appears.
- **The urgent in front.** A critical alert is seen before anything else.
- **Two different depths that do not mix.** Navigation's (Zumly): the previous level stays behind, blurred and darkened. The object's (Orbit layers): it never blurs. The detail cannot confuse one with the other.
- **Continuity with the object.** It is reached by zooming from the channel's disc, so the first thing seen should read as "the same disc, closer".
- **Going back:** button at the bottom left, wheel, left arrow or swipe. Today "tap outside" does not exist, because the view covers the whole screen.
- **Accessible with keyboard and screen readers:** the dial is a `role="slider"` and the segments are `role="switch"`.
- **Phone (under 600 px):** one system at a time. The detail has to work at 375 px and with the thumb.

## What Orbit 2 offers (so the design can be built as is)

- **Universe** (`.bigbang`): the size comes from a single box. The radius is divided into 12 lanes; `orbit-12` touches the edge and up to `orbit-24` sits outside.
- **Satellites** on a ring, distributed on their own, with configurable start and range. Each satellite can be its own universe (an object inside another).
- **Arcs and progress** (`<o-arc>`, `<o-progress>`): segments, bands, curved text over the arc (`range="auto"` measures the length on its own). They can be interactive with a touch margin.
- **Layers in 3D** (`.depth`, `data-depth`, `.layer-front`): they keep their apparent size and animate when changing depth.
- **Direction of each satellite** (`--o-dir-x`, `--o-dir-y`): for putting text outward.

Request: the design should use this and not position anything with hand trigonometry. If something cannot be done with Orbit, better to note it as something Orbit lacks.

## Visual criteria

- One typeface: the system's (`-apple-system, Segoe UI`). No mixing.
- No small spaced uppercase labels and no decorative annotations like "Fig. 01".
- Today's palette (Graphite style): background `#0e1013`, text `#f2f3f5`, muted `#9aa0a8`, lines `#262a31` and `#3a3f47`, minor `#ffb020`, critical `#ff5a4f`.
- Short, human texts, in English.

## What we ask for

Three different directions for the detail. Some ideas to start, not mandatory:

- The same disc enlarged: the segments become satellites with name and state, and the dial takes the edge.
- The channel in the center and its entities around it, each a satellite that can be tapped.
- Time as a ring: what happened in the last hours around the current value.

Each direction, in these three cases and on desktop (1280×800) and phone (375×812):

1. **Lights · Lights**: segments, no alert.
2. **Climate · Heating**: dial with a minor alert ("Heating with windows open · Close windows").
3. **Security · Sensors**: segments, critical alert and camera.

Also show a "sending" state and an error state in at least one of the three cases.

## Images

- `01-board-orbit.png`: board, Orbit view.
- `02-system-climate.png`: object of the Climate system, with the Heating channel in front.
- `03` to `09`: current detail of Lights, Climate, Security (Sirens), Openings, Media, Energy and Maintenance.
