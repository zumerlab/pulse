# Pulse demo · simulated data

The object over five made-up systems (`systems.ts`): a home, a car, a pet,
health, a server. Mini board → system → detail of a channel. The object itself
(rings, layers, the dial's gestures, the Zumly setup, the strings) is the core
package `@zumer/pulse`; this app adds the data and its own small board, from
before the board moved into the core. It stays as it is on purpose: it is the
smallest thing that draws the object, and what the Playwright suite runs
against. `elements.html` draws every element of the core alone with sample
data, the bench behind the site's Elements page.

```sh
npm run dev        # from the repo root; http://127.0.0.1:5173
                   # http://127.0.0.1:5173/elements.html: every element alone
```

Orbit and Zumly come from npm. After changing a version, restart Vite with
`-- --force`, or it serves the previous one from its cache. An unpublished
branch goes in as a `.tgz` in `vendor/` at the repo root
(`../coordinacion/README.md`).

## Who does what

| Movement | Who |
|---|---|
| Board → system → detail (and back) | Zumly (`.zoom-me`, `zoomIn`; to go back: the button with the name of the level above, the left arrow, a pinch; the gesture is visible while it lasts with `gestures.follow`) |
| Reordering layers in z | Orbit (`data-depth` on each layer's `.gravity-spot`, 0.8 s transition) |
| Zoom 1.2× / 1.7×, parallax, wave | The object (`.obj` with `transform`) |

Structure: `.stage` (900 px perspective) › `.obj` (zoom and parallax,
`preserve-3d`, no clicks) › a 240 px `.bigbang` (the universe) ›
`.gravity-spot.depth.outer-perspective` › one `.gravity-spot` per channel with
`data-depth`. The size comes from the universe: `orbit-12` touches its edge and
one lane is radius / 12 = 10 px. Each layer has its ring on `orbit-12`; the front
one, the face in an `at-center` satellite of `orbit-0`; the ones behind, the
label with `range="auto"` and a transparent `o-arc interactive` with `hit-width`
that receives the tap.

Navigation dims and blurs the level behind (`transitions.effects`); the
object's layers never blur. That keeps "previous level" apart from "channel
behind".

## Direct controls

The object is operated without entering the detail; the detail is for seeing more.

- **Dial** (Climate): the front ring is an `o-progress interactive` with
  `role="slider"`. It is dragged (with a knob that marks the value), answers to
  the arrows, Page Up/Down, Home/End and the wheel. It sets the target from 16°
  to 30° in 0.5° steps. Near the center the drag does not change the value, and
  it does not jump across zero: from the end to the start it stays at the limit.
- **Switches** (Lights): each segment is an `o-arc interactive` with
  `role="switch"`; a tap, Enter or Space switches it on or off. The center says
  how many and which. Switching off the light that caused the alert resolves it.
- **Disc**: a tap opens the detail, which uses the same controls (a slider in
  degrees, a checkbox per light).

How it lives with Zumly: Zumly ignores the arrows when the focus is on a
`role="slider"`, and a gesture born on the dial is not its own. While dragging,
and 400 ms after, `mouseup`, `touchend` and `click` do not reach the canvas, so
releasing over the disc does not open the detail. The dial updates in place:
repainting the layer would recreate the `o-progress` and cut the drag.

## Phone

Under 600 px wide (decided on load) you look at one system at a time:

- **Start inside a system**: the one with the most serious alert, or Home. The
  board stays behind as the overview: back button or pinch.
- **Swiping sideways** moves to the neighbouring system: Zumly's lateral swipe
  (`lateralNav.swipe`) between the sibling views `sys-home`, `sys-car`…; the
  dots use `goTo(…, { mode: 'lateral' })`. Zumly's bar is off: the mini-ring
  dots belong to the view. A drag that starts on the dial moves the dial.
  Pinching goes back to the board (`inputs.pinch`).
- **Mini-ring dots** at the bottom: one per system, with its front ring. The one
  of a system with an alert beats in the alert's color (faster if critical). A
  tap goes to that system.
- **Two visible layers** and `--o-depth-grow: .24` (instead of .42), calm zoom
  of 1.1×: the ring behind fits in 375 px. The rest is counted ("+2 behind").
- **No parallax** (there is no pointer). The alert's action stays in the strip,
  within thumb reach.

## What was tested

- **Nested 3D.** The layers move in z with a 900 px perspective inside a Zumly
  view. Orbit gives the same matrices as the hand calculation, the apparent
  size is the same flat and in 3D, and the parallax works. When the view goes
  behind with `filter`, the container keeps `preserve-3d` and comes back intact.
- **Clicks on layers.** Tapping the ring of a layer behind brings it to the
  front and does not zoom out: Zumly ignores clicks inside the current view
  that are not `.zoom-me`. Walked along the radius in three directions, flat
  and in 3D.
- **Disc → detail.** The front disc is the trigger; the detail comes out of the
  disc even inside a layer with a 3D transform.
- **Critical alert from outside.** `app.zoomIn(tile)` opens the system from its
  tile, not from the center.
- **State on the way back.** Zumly does not re-render the view behind; the state
  lives outside the views and is repainted on `afterZoomOut`. A value changed in
  the detail shows on the ring on the way back.
- **Keyboard.** Enter on a tile and on the disc zooms; Enter on a ring behind
  brings it to the front. The left arrow over the detail's slider moves the
  slider, it does not zoom out.
- **Phone (375 px).** Navigates well, no horizontal scroll.

## Findings

1. **"Tap outside to go back" does not exist with full-screen views.** The
   current view covers the whole canvas, so every tap lands inside. What
   remains: the back button, the left arrow and swiping. To have "tap outside"
   the views would have to shrink.
2. **Swiping left zoomed out anywhere.** With emulated touch the browser
   cancelled the gesture as a scroll and Zumly zoomed out instead of moving to
   the neighbouring system. Solved: on the phone the view takes
   `touch-action: pan-y`, and Zumly ignores swipes that start on a
   `role="slider"` or inside `[data-no-swipe]`.
3. **At 375 px the outermost ring is cut** already in calm (1.2×). The base
   diameter should depend on the width.
4. **The 0.8 s lock** the object sets on its layers and the lock Zumly keeps
   while it animates are independent, and did not step on each other.

## Orbit

The October prototypes ran on Orbit 1.6 with a handful of workarounds: a
separate orbit for the dial's knob, the wave on the disc, arc labels measured
by eye, `variant="stroke"` for a 360° band. Orbit 2 took them in
(`.satellite.at-value`, `o-arc.ripple`, `range="auto"`, `.outward-y`,
`.depth.outer-perspective`, `hit-width`), so nothing here works around Orbit
anymore. Anything that would belongs in `../coordinacion/PENDIENTES.md`, not
hidden here.

## Not covered

- Real touch on a phone. With emulated touch (375 px) swiping over the dial
  moves the value and does not zoom out, swiping outside the dial moves to the
  neighbouring system, and the pinch goes back to the board. Real fingers are
  the check that is missing.
- Performance on slow tablets (the blur of the views behind).
