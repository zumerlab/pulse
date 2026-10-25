# Prototipo · Zumly + objeto radial

Tablero Mini → sistema → detalle de un canal. Zumly 0.97.0 maneja la
navegación entre niveles; Orbit dibuja los anillos y mueve las capas en
profundidad (`.depth`, `data-depth`, `.layer-front`).

Orbit viene de la rama `feat/fluid-universe` (commit `85db50d`, sin publicar),
empaquetada en `vendor/orbit-fluid-universe-85db50d.tgz`. Para actualizarla:
compilar la rama, `npm pack`, reemplazar el `.tgz` e instalarlo con
`npm install -D file:prototypes/zumly-radial/vendor/<archivo>.tgz`. Después
reiniciar Vite con `npm run dev -- --force`: si no, sirve la versión anterior
desde su caché de dependencias.

```sh
npm run dev
```

Abrir `/prototypes/zumly-radial/`.

## Reparto

| Movimiento | Quién |
|---|---|
| Tablero → sistema → detalle (y volver) | Zumly (`.zoom-me`, `zoomIn`, botón atrás, rueda, flecha izquierda) |
| Reordenar capas en z | Orbit (`data-depth` en cada `.gravity-spot` de capa, transición de 0,8 s) |
| Zoom 1,2× / 1,7×, paralaje, onda | El objeto (`.obj` con `transform`) |

Estructura: `.stage` (perspectiva 900 px) › `.obj` (zoom y paralaje,
`preserve-3d`, sin clics) › `.bigbang` de 240 px (el universo) ›
`.gravity-spot.depth.outer-perspective` › una `.gravity-spot` por canal con
`data-depth`. El tamaño sale del universo: `orbit-12` toca su borde y un carril
mide radio / 12 = 10 px. Cada capa tiene el anillo en `orbit-12`; la de adelante,
la cara en un satélite `at-center` de `orbit-0`; las de atrás, la etiqueta con
`range="auto"` y un `o-arc interactive` transparente con `hit-width` que recibe
el toque.

La navegación usa desenfoque y menos brillo (`transitions.effects`); las capas del
objeto nunca se desenfocan. Así no se confunde "nivel anterior" con "canal de atrás".

## Controles directos

El objeto se maneja sin entrar al detalle; el detalle queda para ver más.

- **Dial** (Clima): el anillo de adelante es un `o-progress interactive` con
  `role="slider"`. Se arrastra (con una perilla que marca el valor), responde a
  flechas, Re Pág/Av Pág, Inicio/Fin y a la rueda. Fija el objetivo de 16° a 30°
  en pasos de 0,5°. Cerca del centro el arrastre no cambia el valor, y no salta
  por el cero: del final al principio se queda en el tope.
- **Interruptores** (Luces): cada segmento es un `o-arc interactive` con
  `role="switch"`; un toque, Enter o Espacio lo prende o lo apaga. El centro dice
  cuántas y cuáles. Apagar la luz que causaba el aviso lo resuelve.
- **Disco**: un toque sigue abriendo el detalle, que usa los mismos controles
  (slider en grados, una casilla por luz).

Cómo convive con Zumly:
- Zumly ignora las flechas cuando el foco está en un `role="slider"`.
- Mientras se arrastra, y 400 ms después, `mouseup`, `touchend` y `click` no le
  llegan al canvas: soltar sobre el disco no abre el detalle, y en tacto
  deslizar a la izquierda no vuelve.
- Un toque que empieza en el dial no cuenta como gesto de Zumly (`touchstart`),
  y la rueda sobre el dial mueve el valor en lugar de volver.
- El dial se actualiza en el lugar: repintar la capa recrearía el
  `o-progress` y cortaría el arrastre.

## Celular

Debajo de 600 px de ancho (se decide al cargar) se mira un sistema a la vez:

- **Arranque adentro de un sistema**: el que tiene el aviso más grave, o Casa.
  El tablero queda atrás como vista general: botón de volver o pellizco.
- **Deslizar a los costados** pasa al sistema vecino con la navegación lateral
  de Zumly (`goTo('sys-auto', { mode: 'lateral' })`). Hay una vista por sistema
  (`sys-casa`, `sys-auto`…) porque Zumly solo navega de lado entre vistas de
  nombre distinto. Zumly no tiene deslizamiento lateral y a la izquierda haría
  zoom-out: el gesto se resuelve en la vista y no le llega. Un arrastre que
  empieza en el dial mueve el dial.
- **Puntos de mini anillos** abajo: uno por sistema, con su anillo de adelante.
  El de un sistema con aviso late en el color del aviso (más rápido si es
  grave). Un toque lleva a ese sistema.
- **Dos capas visibles** y `--o-depth-grow: .24` (en lugar de .42), zoom en
  calma de 1,1×: el anillo de atrás entra en 375 px. El resto se cuenta ("+2 al
  fondo").
- **Sin paralaje** (no hay puntero). La acción del aviso sigue en la franja, al
  alcance del pulgar.
- El tablero es una fila de mini anillos: la navegación lateral sigue la misma
  dirección que los puntos.

Pendiente para Zumly: deslizamiento lateral como opción propia
(`lateralNav: { swipe: true }`), para no resolverlo en cada vista.

## Qué se probó

- **3D anidado.** Las capas se mueven en z con perspectiva de 900 px dentro de una
  vista de Zumly (`contain: strict`, canvas con `perspective: 1000px`). Orbit da
  las mismas matrices que el cálculo a mano (1,594× a −110, 2,290× a −220), el
  tamaño aparente es igual en plano y en 3D (radios 144/204/265 px), y el paralaje anda. Cuando la vista queda
  atrás con `filter`, el contenedor conserva `preserve-3d`, y la vista vuelve intacta.
- **Clics en capas.** Tocar el anillo de una capa de atrás la trae al frente y
  no dispara zoom-out: Zumly ignora los clics dentro de la vista actual que no
  son `.zoom-me`. Se recorrió el radio en tres direcciones, en plano y en 3D: el
  disco recibe hasta 128 px, Luces de 190 a 218 y Seguridad de 250 a 278.
- **Disco → detalle.** El disco de adelante es el trigger; el detalle sale del
  disco aunque esté dentro de una capa con transformación 3D.
- **Aviso grave desde afuera.** `app.zoomIn(tarjeta)` abre el sistema desde
  su tarjeta, no desde el centro (`zoomTo` perdería el origen).
- **Estado al volver.** Zumly no re-renderiza la vista de atrás; el estado vive
  fuera de las vistas y se repinta en `afterZoomOut`. Un valor cambiado en el
  detalle se ve en el anillo al volver.
- **Teclado.** Enter en una tarjeta y en el disco hace zoom; Enter en un anillo
  de atrás lo trae al frente. La flecha izquierda sobre el slider del detalle
  mueve el slider, no hace zoom-out.
- **Celular (375 px).** Navega bien, sin scroll horizontal.

## Hallazgos

1. **"Tocar fuera para volver" no existe con vistas a pantalla completa.**
   Como la vista actual cubre todo el canvas, todo toque cae adentro. Quedan el
   botón atrás, la rueda, la flecha izquierda y deslizar. Para tener "tocar fuera"
   habría que achicar las vistas.
2. **Deslizar hacia la izquierda hace zoom-out en cualquier parte** (leído en
   `handleGesture`, no probado con tacto real). Choca con la idea de §14 de
   arrastrar el disco hacia afuera para posponer. Si se hace ese gesto, el disco
   tiene que frenar la propagación de `touchend`, o se apaga `inputs.touch`.
3. **En 375 px el anillo de más afuera se corta** ya en calma (1,2×). Conviene
   que el diámetro base dependa del ancho.
4. **Bloqueo de 0,8 s:** el objeto lo pone en sus capas, y Zumly bloquea su
   propia navegación mientras anima. Son independientes y no se pisaron.

## Orbit: de 1.6.0 a `feat/fluid-universe`

Con 1.6.0 hicieron falta rodeos que la rama ya no necesita:

| En 1.6.0 | En la rama |
|---|---|
| `o-arc interactive` recibía clics en todo su medio disco (camino del texto) | Solo la banda; un arco por capa y `hit-width` para margen de toque |
| Fondo de 360° en banda sin dibujar: había que usar `variant="stroke"` | Bandas de 360° estables: todo es banda |
| `--o-gap` en la órbita no llegaba a los arcos | Se hereda de la órbita |
| `o-arc:hover` del tema pintaba de gris | Tema con especificidad cero y sin colores al pasar el mouse |
| Borde en cada `.satellite` | Sin borde por defecto |
| Largo de la etiqueta en arco calculado a ojo | `range="auto"` |
| Perspectiva de `.depth` anulada a mano para el paralaje | `.depth.outer-perspective` |
| `--o-force` en cada capa | La capa anidada hereda el alcance del universo |
| Arcos sin dibujar en pestaña oculta | `Orbit.ready()`; en pestaña oculta dibuja igual |

Con la rama, el recorrido de clics da lo mismo que antes: el disco recibe
hasta 128 px del centro, Luces de 188 a 220 y Seguridad de 248 a 280, en plano
y en 3D, con las mismas matrices (1,594× a −110, 2,290× a −220).

Pendiente en la rama: el paquete no declara tipos para `@zumer/orbit/style`, y
TypeScript 6 rechaza ese import (`orbit-style.d.ts` lo declara acá).

## No cubierto

- Tacto real (el emulador manda eventos de mouse): el arrastre del dial y que
  deslizar sobre él no haga zoom-out están razonados, no probados en un teléfono.
  Lo mismo el pellizco para volver al tablero: necesita dos dedos de verdad.
- Rendimiento en tablets lentas (desenfoque de las vistas de atrás).
