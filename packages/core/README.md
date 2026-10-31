# @zumer/pulse

The radial object of Pulse: one circular object per system, with layers by
urgency. What matters now sits in front; the rest waits behind. Built on
[Orbit](https://github.com/zumerlab/orbit) (rings and depth) and
[Zumly](https://github.com/zumerlab/zumly) (zoom navigation), which are peer
dependencies.

This package is the UI only. It knows nothing about where the data comes from:
the demo app simulates it and the Home Assistant app reads it live. Not
published yet; the apps in this repo use it through the npm workspace.

```ts
import { ring, face, backLayer, dialControls, zumlyOptions, t } from '@zumer/pulse';
import '@zumer/pulse/style.css';
```

## What it exports (`src/index.ts`)

| | |
|---|---|
| `ring(key, reading, lanes, options)` | A channel's ring on `orbit-12`. `kind: 'p'` a band that fills (with `controls` and a `dial`, a draggable slider with its knob on `.satellite.at-value`; with a `range`, a band from `lo` to `hi` with a knob at each end, each a slider, the nearer one following a drag on the track); `'s'` segments that switch (`role="switch"`); `'c'` a choice, one segment on, its names along the inside of the ring (`role="radiogroup"`, radios). `tint` colors what is on; failing segments ripple (`o-arc.ripple`) when the alert calls. With `open`, a band runs 270° from 225° through the top (`OPEN`), its ends named on `orbit-13` and, given `now`, a mark where the measurement is; the gestures follow the ring's own span |
| `face(...)` with `image` | The disc over a picture (`.disc.has-image`, `img.face-image`): the text sits on a scrim |
| `timeline({ hours, tracks, events, big, label, marks, aria })` | The last hours of several entities as concentric rings, one per entity (`Track`: `key`, `name`, `spans` as `[from, to]` hours ago, `on`, `tone`, `act`, `pending`, `failed`), outermost first, up to `MAX_TRACKS` (8) from orbit 12 inward; what was on is drawn in ink (or the alert's color), the rest is the faint track under it; time runs clockwise and ends at the top with the same seam as the time ring; a ring that is on now glows there; `events` sit outside at their hour (the ones within a half hour share a word); the center says what is now; a tap on a ring carries `data-track`. Its own universe (`.timeline`, sized in container units) |
| `timeRing({ values, label, unit, min, max, marks })` | The last 24 hours as a radial bar chart, its own universe (`.time-ring`): one `o-arc` sector per half hour on a shared baseline (the rim of orbit 6), each as tall as its value, fading with age; "now" glows at the top, an empty slot after it is the seam of the day; the center says now, the day's range under it; `marks` adds a tick per hour on `orbit-13` and "6 h ago", "12 h ago", "18 h ago" on `orbit-14` |
| `colorWheel(hs, key, label)` + `wheelControls(el, controls)` | A hue (around) and saturation (outward) wheel with a handle, `role="slider"`; drag, tap or arrows (left/right hue, up/down saturation) |
| `face(…)`, `backLayer(…)` | The front layer's disc (the Zumly trigger of the next level) and a layer behind (arc label with `range="auto"` and a transparent interactive arc that brings it forward) |
| `systemShell(title, buttons)`, `dots(…)`, `calmStrip(…)` | The system view's skeleton, the mini-ring dots of the phone, the strip under the object |
| `dialControls(el, …)` | Drag, wheel and keyboard on the dial, and how they live with Zumly (swallowed `mouseup`/`touchend`/`click` while dragging). Returns the cleanup |
| `parallax(stage, obj, active)` | ±7° with the pointer, only in 3D and not on the phone |
| `zumlyOptions(views, initialView)`, `startInside(app, systemId)` | The Zumly setup (blur behind, `depthNav` title, pinch, `gestures.follow`, lateral swipe on the phone) and the phone start inside a system |
| `PHONE`, `GROW`, `SIZE`, `STROKE`, `LOCK_MS`, `LANE`, `MINI_LANES`, `DOT_LANES` | Sizes: three layers (two on the phone), growth per layer, apparent strokes, the 0.8 s lock, one lane = radius / 12 |
| `RingReading`, `RingSeg`, `RingDial` | The shape of what a ring draws. Any source that produces it can mount the object |
| `t`, `num`, `time`, `count`, `listOf`, `LOCALE` | The object's strings and formatting (`i18n.ts`); the apps extend `t` with their own |
| `style.css` | The Graphite theme: tokens, the object (layers, disc, rings, dial, knob), board tiles, detail, phone |

The grammar (layers by urgency, rules for several alerts, depth, zoom, styles)
is in `docs/pulse-radial-cookbook.md` at the repo root.
