# Pulse radial · cookbook

An interface system for states that compete for attention: one circular object
per system (home, car, pet, health, server…), with layers in depth. What matters
now sits in front; the rest waits behind.

Prototype: the **Orbit Status Rings** canvas (claude.ai), section *Consolidated
system*. The component is `Pulse.dc.html`; it is built with Orbit 1.5.0
(`@zumer/orbit`). That canvas component used Spanish names for its props and
values; this document gives them in English.

> The core (`packages/core`) and the apps (`apps/`) run on Orbit 2.1.0 and
> Zumly 1.2.2. §13 remains as history: everything under "What Orbit lacks"
> shipped in 1.6.0 and 2.x (see the README of `apps/demo`).

---

## 1. The idea in one sentence

> Each system is a radial object with 2 to 4 channels. The active channel sits
> in front; the others wait behind, larger and fainter. An alert brings its
> channel to the front and, once resolved, sends it back. A new system is only data.

Three uses of depth, in this order of importance:

1. **z = what is active.** The front layer is the one read and used.
2. **z = what is urgent.** An alert raises its layer.
3. **z = how much room.** The system comes closer (zoom) when something needs focus.

---

## 2. Anatomy

| Part | What it is | What it shows |
|---|---|---|
| **Layer** | One channel of the system (Climate, Lights…) | A disc with its ring |
| **Disc** | The layer's circle | Only the front one has a full disc and a **face** |
| **Face** | Center of the front layer | Channel name, icon, big value, one line |
| **Ring** | Edge of the layer | Progress (0–1) or segments (2–8) |
| **Edge label** | Arc text on the layers behind | `CHANNEL · VALUE`, at −30° and +30° |
| **Satellite** | Dot with an icon over the active ring | An alert that waits (rule 3) |
| **Wave** | Ring that expands and fades | Only on the front alert (rule 2) |
| **Summary** | Special layer "N alerts" | One segment per alert (rule 4) |
| **Action arc** | Band below the disc | Snooze · Mute (radial actions) |
| **Strip** | Below the object | What is in front, why, action, who waits |

---

## 3. Data model

A system is an object. None of this touches the engine.

```js
{
  title: 'Home',
  front: ['climate', 'lights', 'security', 'cameras'],   // base order, front to back
  groups: [{                                              // optional (rule 5)
    id: 'intrusion', of: ['security', 'cameras'], level: 2,
    name: 'Intrusion', big: 'Intrusion', label: 'window + motion',
    why: 'Window open and someone in the backyard', verb: 'View cameras'
  }],
  ch: {
    security: {
      name: 'Security',
      glyph: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4', // SVG path, 24×24
      accent: '#F2F3F5',          // only the Graphite style uses it
      type: 's', segs: 6,         // 's' segments (2–8) | 'p' progress
      level: 2,                   // 1 minor · 2 critical
      ev: 'A window opens',       // event text (demos)
      ok: { on: 6, big: 'Closed', label: '6 of 6 openings' },
      al: { on: 6, seg: 3, big: 'Open', label: 'bathroom window',
            why: 'Opened with the alarm armed', verb: 'I closed it' }
    },
    climate: {
      name: 'Climate', glyph: '…', accent: '#4DA3FF', type: 'p', level: 1,
      ok: { v: 0.82, big: '21.5°', label: 'target 23°' },
      al: { v: 0.95, big: '28°', label: '30% less efficient',
            why: 'The air filter is dirty', verb: 'Order a filter' }
    }
  }
}
```

- `ok` is the normal state, `al` the alert state.
- Progress: `v` from 0 to 1. Segments: `on` = how many are on; `seg` = the
  failing segment (if omitted, all the ones on are painted).
- `why` and `verb` only exist in `al`: the cause and the action that resolves it.

**Included systems:** `home`, `car`, `pet`, `health`, `server`.

---

## 4. Component props

| Prop | Values | Default | What for |
|---|---|---|---|
| `system` | home · car · pet · health · server | home | Predefined system |
| `config` | object (see §3) | — | Own system; overrides `system` |
| `theme` | graphite · ivory · paper · contrast | graphite | Style (tokens only) |
| `view` | mini · flat · 3d | flat | Initial view |
| `rules` | 0 to 5 | 5 | Rules for several alerts (§6) |
| `actions` | strip · radial · both | strip | Where the actions live (§9) |
| `zoom` | auto · fixed | auto | Dynamic zoom to the front (§8) |
| `autoDepth` | bool | true | An alert switches on the 3D |
| `start` | `['security', …]` | — | Alerts it starts with |
| `incoming` | `{ id, on, seq }` | — | Event from outside; a new `seq` = a new event |
| `resetKey` | any value | — | When it changes, back to the initial state |
| `demo` | bool | true | Shows the "Simulate event" buttons |

---

## 5. Layer order

Without alerts: **manual choice** (tapping a ring or "To the front") > **base order**.

With alerts: the alerts go in front of the rest, ordered by the rules (§6).

- A new alert **cancels** the manual choice.
- When an alert is resolved, the order **comes back on its own**.
- A **critical** alert **wakes** the Mini view.
- After a layer change, the controls stay **locked for 0.8 s**: the new button
  appears where the previous one was and a nervous tap would resolve two things.

---

## 6. Several alerts: five cumulative rules

| `rules` | Rule | What it does |
|---|---|---|
| 0 | No rules | The most recent critical one keeps the front. Everything is painted and everything beats. *(only for comparison)* |
| 1 | **Stable** | The one in front stays; only a **more serious** one displaces it. The others wait in order of arrival. |
| 2 | **One wave** | Only the front alert emits waves. |
| 3 | **Satellites** | The waiting ones orbit the active ring with the **icon of their channel**; the layers behind go back to gray. |
| 4 | **Summary** | With 3 alerts or more, "N alerts" goes in front (one segment per alert). You open one, resolve it, come back. |
| 5 | **Groups** | Alerts with the same cause join into one (the system declares it in `groups`). |

Demo: board *Pulse · several alerts, rules 0 to 5* (the same scene on six cards).

---

## 7. Depth

| Layer | Size | z | Stroke | Shows |
|---|---|---|---|---|
| Front | 1× | 0 | 6 px | full disc, face, action |
| Behind | 1.42× | −110 | 3 px | ring + label at −30° |
| Further behind | 1.84× | −220 | 2.5 px | ring + label at +30° |
| Back | 2.26× | −330 | — | hidden · "+1 behind" |

- The **apparent size is the same** flat and in 3D: in 3D the layer moves away
  in z and the scale compensates (900 px perspective: `scale = size × (900 − z) / 900`).
- With radial actions visible, the layers behind open **14%** to leave room for the arc.

### Views

| View | What it is |
|---|---|
| **Mini** | 84 px icon (the object at 22%), no text; strokes thickened so it reads |
| **Flat** | The whole object, no separation in z |
| **3D** | With an alert (if `autoDepth`) or on request. ±7° parallax with the pointer |

---

## 8. Zoom and motion

| What | Value |
|---|---|
| Calm zoom | 1.2× |
| Alert zoom | 1.7× (the layers behind are cut by the edge) |
| Summary zoom | 1.5× |
| Layer change / zoom | 0.8 s · `cubic-bezier(.2,.8,.2,1)` |
| Minor alert wave | every 1.6 s |
| Critical alert wave | every 0.9 s |
| Parallax | 0.25 s · `ease-out` |

If with the zoom a layer's ring ends up larger than the frame, **its label
hides** (the information stays in satellites and strip).

---

## 9. Actions

`actions = 'strip' | 'radial' | 'both'`

- **Strip** (default): the main action's button below. For the car while driving.
- **Radial**: everything on the object.
  - **Disc = main action, two taps.** The first **arms** (the ring fills, "TAP
    AGAIN"); the second **runs**. It disarms after 3 s. Same with mouse, touch
    and keyboard.
  - **In the summary**, one tap opens the most serious alert (opening changes nothing).
  - **Bottom arc**: **Snooze** (the alert goes behind and lets the next one
    through; it comes back if it is the only one left or it repeats) and **Mute**
    (no waves; the color stays). Real 76 × 44 px buttons over the arc.
- **Both**: radial as a shortcut, strip as an always visible alternative.

> **Open:** radial actions are still not fully settled (see §14).

---

## 10. Styles

| Style | Background | Ink | Minor | Critical | Depth |
|---|---|---|---|---|---|
| **Graphite** | `#0E1013` | `#F2F3F5` | `#FFB020` | `#FF5A4F` | dark glass, light blur, accents per channel |
| **Ivory** | `#F1EEE7` | `#1B1C1F` | `#9A5B00` | `#C42E14` | light glass with shadow, a single ink |
| **Paper** | `#FFFFFF` | `#111111` | `#92400E` | `#B91C1C` | stroke only, no blur |
| **Contrast** | `#000000` | `#FFFFFF` | `#FFD400` | `#FF7070` | 8/4 px strokes, no blur or transparency |

The style changes tokens (colors, blur, strokes), **never** the grammar of layers.

---

## 11. Against layer confusion

1. **At most 3 visible layers.** The rest is counted, not drawn.
2. **Only the front one has a face and a full disc.** Behind: ring and label.
3. **Front stroke = 2× the one behind.** The hierarchy reads even without color.
4. **Labels staggered at −30° and +30°**, never on the same line; the arc grows with the text.
5. **Color belongs to the alert only:** ring, segment and label. The disc is never painted.
6. **In segments, only the failing one** is painted, and the wave comes out of there.
7. **Never two layers at the same radius:** each step grows ≥ 42%.
8. **The 3D container takes no clicks**; the layers do. Tapping a ring brings it.

---

## 12. Recipes

### Add a system

1. Pick 2 to 4 channels that compete for attention and order them front to back.
2. For each channel: type, level, normal state and alert state (with `why` and `verb`).
3. If there are alerts that mean the same together, declare them in `groups`.
4. Mount it with the style the place asks for:

```html
<dc-import name="Pulse" config="{{ mySystem }}" theme="ivory" view="mini"
           incoming="{{ lastEvent }}"></dc-import>
```

### Send an event from outside

```js
lastEvent = { id: 'nodes', on: true, seq: 7 }   // on: false resolves it
```

Each event needs a new `seq`; the same `seq` is ignored.

### Board of several systems

A row of `view="mini"`. A critical alert opens that card on its own; once
resolved, it goes back to Mini.

### Car

`actions="strip"`, `rules` 5, `autoDepth` true. Nothing touch-based while
driving; alerts may go back on their own after a time (prototype *Car in layers*).

### Compare states side by side

`start` with the same alerts and a shared `resetKey` to restart all the cards at once.

---

## 13. Implementation notes with Orbit 1.5.0 (historical)

- **Each layer is a full `.bigbang`** inside a container that moves in z:
  `.orbit-N` and `.satellite` already use `transform`, so `translateZ` cannot go
  on the orbit.
- **Satellites and arcs must be direct children of `.orbit-N`.** Do not use a
  template loop that adds a container in between: it breaks Orbit's counting.
- **360° background on `o-progress variant="stroke"`:** with `--o-back-stroke`
  it draws offset (bug in `calculateStrokeArc`). Workaround: another
  `o-progress value="99.9"` on its own orbit. *Fixed in the Orbit repo,
  unpublished at the time.* With partial ranges (270° speedometer) the background works.
- **`o-arc` takes no clicks** except with the `interactive` attribute. For
  actions: visual-only arc and transparent HTML buttons over it.
- **Satellite at an exact angle:** its own `.orbit-N` with
  `--o-range: 0deg; --o-from: Xdeg`.
- **Segment spacing:** `gap-*` goes up to 30 and is not enough for rings of 3–6
  segments; use `--o-gap: 24–60` inline.
- **Arc label:** `o-arc` with `--o-fill: transparent` and `--o-color`; the arc's
  length (`--o-range`) is computed from the text.
- **3D container:** `pointer-events: none` on the container and `auto` on the
  layers; otherwise the container (at z = 0) keeps the clicks of the layers behind.

### What Orbit lacks

Solved: 1.6.0 brought `.depth`, `data-depth`, `.layer-front`, `--o-z` and the
360° background; Orbit 2 adds `interactive` with `hit-width`, `range="auto"`,
inherited `--o-gap`, `.satellite.at-value`, `.outward` and `o-arc.ripple`. The
original list:

- `--o-z` per orbit, added to its transform.
- A class or attribute for the active layer (`.layer-front`, `data-depth`).
- A default depth transition.
- Publish the 360° background fix.

---

## 14. Open

> State of the repo (31/10/2026): rules 1 to 4 are in the Home Assistant app
> (satellites with the channel's icon, the summary layer, Later and Mute in the
> strip); rule 5 waits for a system that declares `groups`. The detail is one
> radial object: the channel's ring (or its day as rings, the dial in the
> center) with the face in the middle, the chips under it. Styles: the four
> below as `data-theme`, plus the Home Assistant theme in the card.

- **Radial actions.** Clearer with two taps and the arc, but still not settled.
  Options left to try: action satellites, gestures (dragging the disc outward to
  snooze), and whether the 3 s window should be longer.
- **Voice.** It fits well (there is always a "this" in front; the channels have
  names; the summary can be read in order of severity) but it was left for later.
- **Real photos in cameras.** Today they are "[live video]" placeholders.
- **Weight of the canvas.** With so many boards it sometimes takes a while to
  start; the old explorations should move to another page.

---

## 15. How we got here

1. Composite icons: a glyph and two related rings (not two random data points).
2. Depth has to mean something: active, urgent, history.
3. Layers in z seen **head-on**; the tilted perspective only explains.
4. Four domains (home, car, pet and one in glass with WebGL) → one engine.
5. Waves instead of shakes: what needs attention "calls".
6. Several alerts → five rules.
7. Actions inside the object → two taps, arc, satellites with icon, zoom.
