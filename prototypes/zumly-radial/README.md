# Prototype · Zumly + radial object

Mini board → system → detail of a channel. Zumly handles the navigation between
levels; Orbit draws the rings and moves the layers in depth (`.depth`,
`data-depth`, `.layer-front`). The data is simulated (`systems.ts`); the texts
come from `../shared/i18n.ts` and the object itself (rings, layer markup, the
dial's gestures, the Zumly setup) from `../shared/radial.ts`, shared with
`ha-radial`.

Orbit and Zumly come from npm (`@zumer/orbit` 2.1.0 and `zumly` 1.2.2). After
changing a version, restart Vite with `npm run dev -- --force`: otherwise it
serves the previous one from its dependency cache. To try an unpublished branch,
a `.tgz` in `vendor/` (see `../coordinacion/README.md`).

```sh
npm run dev
```

Open `/prototypes/zumly-radial/`.

## Who does what

| Movement | Who |
|---|---|
| Board → system → detail (and back) | Zumly (`.zoom-me`, `zoomIn`; to go back: the button with the name of the level above (`depthNav.style: 'title'`), wheel, left arrow, pinch; the gesture is visible while it lasts with `gestures.follow`) |
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

Navigation uses blur and less brightness (`transitions.effects`); the object's
layers never blur. That keeps "previous level" apart from "channel behind".

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
- **Disc**: a tap still opens the detail, which uses the same controls (a slider
  in degrees, a checkbox per light).

How it lives with Zumly:
- Zumly ignores the arrows when the focus is on a `role="slider"`.
- While dragging, and 400 ms after, `mouseup`, `touchend` and `click` do not
  reach the canvas: releasing over the disc does not open the detail, and on
  touch, swiping left does not go back.
- A gesture that starts on the dial is not Zumly's (it ignores those born on a
  `role="slider"`), and the wheel over the dial moves the value instead of going back.
- The dial updates in place: repainting the layer would recreate the
  `o-progress` and cut the drag.

## Phone

Under 600 px wide (decided on load) you look at one system at a time:

- **Start inside a system**: the one with the most serious alert, or Home. The
  board stays behind as the overview: back button or pinch.
- **Swiping sideways** moves to the neighbouring system: it is Zumly's lateral
  swipe (`lateralNav.swipe`) between the sibling views `sys-home`, `sys-car`…;
  the dots use `goTo(…, { mode: 'lateral' })`. Zumly's bar is off (`arrows` and
  `dots` set to `false`, `mode: 'auto'`): the mini-ring dots belong to the view.
  A drag that starts on the dial moves the dial. Pinching goes back to the board
  (`inputs.pinch`).
- **Mini-ring dots** at the bottom: one per system, with its front ring. The one
  of a system with an alert beats in the alert's color (faster if critical). A
  tap goes to that system.
- **Two visible layers** and `--o-depth-grow: .24` (instead of .42), calm zoom
  of 1.1×: the ring behind fits in 375 px. The rest is counted ("+2 behind").
- **No parallax** (there is no pointer). The alert's action stays in the strip,
  within thumb reach.
- The board is a row of mini rings: lateral navigation follows the same
  direction as the dots.

Zumly 1.0 brought `lateralNav.swipe` and `inputs.pinch`: the hand-made swipe and
pinch left the view. With parametric siblings (1.0) the `sys-*` views could be a
single `system` view with `data-system`; that waits for the prototype's rewrite.

## What was tested

- **Nested 3D.** The layers move in z with a 900 px perspective inside a Zumly
  view (`contain: strict`, canvas with `perspective: 1000px`). Orbit gives the
  same matrices as the hand calculation (1.594× at −110, 2.290× at −220), the
  apparent size is the same flat and in 3D (radii 144/204/265 px), and the
  parallax works. When the view goes behind with `filter`, the container keeps
  `preserve-3d`, and the view comes back intact.
- **Clicks on layers.** Tapping the ring of a layer behind brings it to the
  front and does not trigger a zoom-out: Zumly ignores clicks inside the current
  view that are not `.zoom-me`. The radius was walked in three directions, flat
  and in 3D: the disc receives up to 128 px, Lights from 190 to 218 and Security
  from 250 to 278.
- **Disc → detail.** The front disc is the trigger; the detail comes out of the
  disc even inside a layer with a 3D transform.
- **Critical alert from outside.** `app.zoomIn(tile)` opens the system from its
  tile, not from the center (`zoomTo` would lose the origin).
- **State on the way back.** Zumly does not re-render the view behind; the state
  lives outside the views and is repainted on `afterZoomOut`. A value changed in
  the detail shows on the ring on the way back.
- **Keyboard.** Enter on a tile and on the disc zooms; Enter on a ring behind
  brings it to the front. The left arrow over the detail's slider moves the
  slider, it does not zoom out.
- **Phone (375 px).** Navigates well, no horizontal scroll.

## Findings

1. **"Tap outside to go back" does not exist with full-screen views.** Since the
   current view covers the whole canvas, every tap lands inside. What remains:
   the back button, the wheel, the left arrow and swiping. To have "tap outside"
   the views would have to shrink.
2. **Swiping left zoomed out anywhere.** With emulated touch (CDP) it was
   confirmed on the phone: the browser cancelled the gesture as a scroll
   (`pointercancel`), the view did not see the swipe and Zumly zoomed out instead
   of moving to the neighbouring system. Solved: on the phone the view takes
   `touch-action: pan-y`, and Zumly ignores swipes that start on a
   `role="slider"` or inside `[data-no-swipe]`. If the gesture of §14 is built
   (dragging the disc outward to snooze), `data-no-swipe` on the disc is enough.
3. **At 375 px the outermost ring is cut** already in calm (1.2×). The base
   diameter should depend on the width.
4. **0.8 s lock:** the object sets it on its layers, and Zumly blocks its own
   navigation while it animates. They are independent and did not step on each other.

## Orbit: from 1.6.0 to `feat/fluid-universe`

With 1.6.0 workarounds were needed that the branch no longer needs:

| In 1.6.0 | In the branch |
|---|---|
| `o-arc interactive` received clicks on its whole half disc (the text path) | Only the band; one arc per layer and `hit-width` as touch margin |
| 360° background in an undrawn band: `variant="stroke"` was needed | Stable 360° bands: everything is a band |
| `--o-gap` on the orbit did not reach the arcs | Inherited from the orbit |
| The theme's `o-arc:hover` painted gray | Theme with zero specificity and no hover colors |
| Border on every `.satellite` | No border by default |
| Length of the arc label estimated by eye | `range="auto"` |
| Perspective of `.depth` cancelled by hand for the parallax | `.depth.outer-perspective` |
| `--o-force` on every layer | The nested layer inherits the universe's reach |
| Arcs not drawn in a hidden tab | `Orbit.ready()`; in a hidden tab it draws anyway |

With the branch, the click walk gives the same as before: the disc receives up
to 128 px from the center, Lights from 188 to 220 and Security from 248 to 280,
flat and in 3D, with the same matrices (1.594× at −110, 2.290× at −220).

The types of `@zumer/orbit/style` come with Orbit 2 (`695d6f5`): the
`orbit-style.d.ts` that declared them here was removed.

## Orbit 2.1.0

Five improvements that came out of Pulse's detail. The ones the prototypes use:

| Workaround | Now |
|---|---|
| Dial knob: a separate orbit (`--o-range: 0deg; --o-from: value`) updated by hand | `.satellite.at-value` on the same ring as the `o-progress`: Orbit seats it where the value ends |
| Alert wave: the disc's `::after` | `o-arc.ripple` on the failing segment of the front ring; the disc ripples only if the channel is a dial |
| Orbit label (`ha-radial`): `--o-dir-y` and `clamp()` by hand | `.outward-y` |

`start` and `--o-max` (text and spans over a ring with arcs, a scale in hours)
are used in the detail canvas, not here yet.

## Not covered

- Real touch on a phone. With emulated touch (CDP, 375 px) it was tested:
  swiping over the dial moves the value and does not zoom out; swiping outside
  the dial moves to the neighbouring system. Same for the pinch back to the board
  (now Zumly does it, `inputs.pinch`) and Zumly's lateral swipe: they need real fingers.
- Performance on slow tablets (blur of the views behind). Since Zumly `main`,
  `transitions.animateEffects: false` applies the blur at once.
