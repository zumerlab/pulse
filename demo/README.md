# Pulse demo

Explore Pulse with simulated data for a home, a car, a pet, health and a server.
The demo lets you try layers, alerts and controls without connecting a device
or running another service.

It also includes a component gallery showing the core's rings, lists, history
charts and other elements with sample data.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev
```

Open [the demo](http://127.0.0.1:5173),
[the component gallery](http://127.0.0.1:5173/elements.html) [the tutorial's greenhouse](http://127.0.0.1:5173/greenhouse/) or
[the greenhouse on a round screen with one knob](http://127.0.0.1:5173/round/)
(arrows or the wheel turn, Enter presses, Enter held goes back).

## Try the controls

Select a system on the board to open it. The front layer shows its reading
and controls; tap a ring behind it to bring another channel forward.

- Drag the climate dial to change its target temperature. Arrow keys,
  Page Up/Down, Home/End and the mouse wheel also work.
- Tap a light segment, or press Enter or Space while it is focused, to toggle it.
- Tap the front disc to open the channel's detail view.
- Use the back button, left arrow outside a slider, or a pinch gesture to
  return to the previous level.

Dragging a dial updates it in place. Releasing the dial does not open the
detail view, even when the pointer ends over the disc.

On screens narrower than 600 px, the demo starts inside a system and shows
two layers at a time. Swipe sideways or use the small rings below the object
to switch systems. A drag that starts on a dial adjusts the dial instead.
Screen width is checked when the page loads.

## How it is built

| File | Responsibility |
|---|---|
| [systems.ts](systems.ts) | Simulated readings, alert states and available controls |
| [main.ts](main.ts) | Demo state, board, system views, detail views and interactions |
| [elements.ts](elements.ts) | Component gallery with sample data |
| [strings.ts](strings.ts) | Demo interface text |
| [greenhouse/](greenhouse/) | The tutorial's greenhouse: a simulated source (`source.ts`), its systems (`model.ts`), the host (`host.ts`) and the board mounted on it (`main.ts`); built step by step in [the tutorial](https://zumerlab.com/pulse/tutorial.html) |

The demo uses the core's radial components directly and builds its own small
board; the apps on the core, Pulse for Home Assistant among them, use the
core's `mountBoard` instead. So does the greenhouse in `greenhouse/`, the
shortest example of the way an app is built: a source, its systems, a host,
`mountBoard`. The demo is useful as an example of working with
the lower-level components.

Orbit handles the rings and layer depth. Zumly handles navigation between
the board, a system and its detail. Pulse connects the readings, controls and
alert behavior. See the [README](../README.md) for the shared components and
the [Elements page](https://zumerlab.com/pulse/elements.html) for their parameters.

## Development and checks

From the repository root:

```sh
npm test
```

The Playwright suite exercises this demo, including layer selection, direct
controls, detail navigation and phone layouts. Emulated touch checks do not
replace testing on a physical phone. Performance on slow tablets also needs
device testing.

Orbit and Zumly are npm dependencies. If Vite keeps serving an old dependency
after a version change, stop the dev server and restart it with:

```sh
npm run dev -- --force
```
