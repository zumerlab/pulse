# @zumer/pulse

The radial object of Pulse, and the board that holds it. One round object per
system, its channels as layers by urgency: what matters now sits in front, the
rest waits behind. Drawn with [Orbit](https://github.com/zumerlab/orbit)
(rings and depth) and [Zumly](https://github.com/zumerlab/zumly) (the zoom
between levels).

This package is the UI only. It knows nothing about homes or machines: a host
hands it systems whose channels read into readings, and runs the actions the
board hands back. The Home Assistant app and the homelab app are two such
hosts; the demo app draws the object over made-up data. Not on npm yet: the
apps in this repository use it through the workspace.

```ts
import { mountBoard } from '@zumer/pulse';
import '@zumer/pulse/style.css';

const board = mountBoard(canvas, { host, settings: 'my-settings', strings: { things: 'Sensors' } });
```

## What is in `src/`

| File | What it holds |
|---|---|
| `model.ts` | The contract. `PulseHost`: `systems`, `onChange`, `act`, `nameOf`, `stateOf`, and the optional parts (`history`, `changes`, `stream`, `statistics`, `groups`, `byGroup`, `language`). A `Channel` reads into a `Reading`: one of three rings (`'p'` a band, `'s'` switches, `'c'` a choice), the big value and its line, the `ids` it depends on, an `alert` with its `acts`, and what a detail may draw (`history`, `tracks`, `image`, `color`, `month`, `list`). An `Action` is the host's own plus the `ids` it touches; one that `asks` for a code waits on the keypad. |
| `board.ts` | `mountBoard(canvas, options)`: the grid, orbit, layers and list views, the system view with its layers, the detail, the changes of the last hours, and the gear (content, board, look, tuning). The viewer's choices stay in `localStorage` under the key `settings` names. `BoardOptions` is the frame the host sets: `systems`, `mode`, `axis`, `start`, `groups`, `look`, `layers`, `stack`, `strings`, `status`, `exit`. The handle's `setHost` swaps the host at runtime. |
| `radial.ts` | The primitives, each returning markup: `ring` (band, dial, range, switches, choice), `face`, `backLayer`, `layerIndex`, `keypad`, `timeRing`, `timeline`, `monthRing`, `timeWindow`, `orbitHub`, `colorWheel` and `colorArcs`, `radialList`, `queueRings`, `scrollList`, `dots`, `calmStrip`, `systemShell`; the gestures (`dialControls`, `wheelControls`, `listControls`, `scrollControls`, `zoomOutGestures`, `parallax`); the Zumly setup (`zumlyOptions`); the sizes (`SIZE`, `STROKE`, `LANE`, `PHONE`). Each one alone, with a picture: [Elements](https://zumerlab.com/pulse/elements.html). |
| `themes.ts` | Seven themes of seven tokens (`THEMES`, `applyTheme`, `applyColors`): Graphite, Paper, Deep; Slate, Mist, Fog, Night. |
| `tune.ts` | The sliders of the gear's Tuning tab: distances and sizes of the orbit and the layers, as CSS variables. |
| `history.ts` | `hourly` and `changesOf`: rows of (state, when) into hourly means and state changes, for the day rings. |
| `i18n.ts` | The object's strings (`t`), `setLocale`, `num`, `time`, `count`, `listOf`. An app spreads `t` and adds its own words. |
| `style.css` | Graphite as the base stylesheet: tokens, the object, the board, the detail, the gear, the phone. |

Why things are the way they are: [Why](https://zumerlab.com/pulse/principles.html).
How to put it over your own data: [In your project](https://zumerlab.com/pulse/adapt.html).
