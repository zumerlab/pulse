# Pulse · brief para diseñar el detalle

26/10/2026

## Qué es Pulse

Pulse es una interfaz radial para estados que compiten por atención. Cada sistema (luces, clima, seguridad…) es un objeto circular con capas en profundidad: lo que importa ahora va adelante y lo demás espera atrás. Está hecho con Orbit (layouts radiales en CSS) y Zumly (navegación por zoom). Hoy la fuente de datos del demo es un Home Assistant real, pero Pulse es la UI: no depende de HA.

La navegación tiene tres niveles y se recorre con zoom:

1. **Tablero**: todos los sistemas. Hay tres vistas: Grilla, Órbita (`01-tablero-orbita.png`) y Capas.
2. **Sistema**: el objeto radial de un sistema. El canal activo va adelante y los otros quedan como anillos de atrás (`02-sistema-clima.png`). El objeto ya tiene controles directos: un dial que se arrastra y segmentos que se prenden y apagan.
3. **Detalle**: se entra tocando el disco del canal de adelante. **Esto es lo que hay que diseñar.**

## El detalle hoy

Capturas `03` a `09`: el detalle del canal de adelante de cada sistema.

Hoy es un formulario: título, valor grande, un botón, un slider o una lista de casillas. Funciona, pero rompe con todo lo anterior. Se sale del objeto radial justo donde uno espera ver más del mismo objeto. Además usa etiquetas chiquitas en mayúsculas ("CLIMA · DETALLE"), que no van.

## Qué tiene que poder mostrar

Cada canal produce una lectura con estas partes. No todas están siempre.

| Parte | Qué es | Ejemplo |
|---|---|---|
| Valor | Texto grande y una línea debajo | "68°" · "objetivo" |
| Progreso | Un número de 0 a 1 | Ventana abierta al 70% |
| Segmentos | De 2 a 8, cada uno con nombre, prendido o apagado, su estado en HA y, si tiene, una acción | Las 6 luces, las 4 cerraduras, los modos de la alarma |
| Dial | Mínimo, máximo, paso, unidad y valor actual; se arrastra | Temperatura objetivo, entre el mínimo y el máximo del equipo |
| Aviso | Gravedad leve o grave, texto grande, por qué, el verbo de la acción, "en curso…" mientras se resuelve, y qué segmentos fallan | "Trabada · Puerta mal instalada no terminó de cerrar · Reintentar" |
| Cámara | Una imagen en vivo cuando hay movimiento | Patio |
| Entidades | Qué entidades de HA hay detrás y su estado | `lock.front_door` · con llave |

Los 7 sistemas del demo y sus canales:

| Sistema | Canales (control) |
|---|---|
| Luces | Luces (segmentos) · Brillo living (dial) · Enchufes (segmentos) |
| Clima | Calefacción (dial) · Aire (dial) · Ecobee (dial) · Humedad (progreso) |
| Seguridad | Alarma (segmentos = modos) · Sirenas (segmentos) · Cerraduras (segmentos) · Sensores (segmentos + cámara) |
| Aberturas | Ventana living (dial) · Ventana pasillo (dial) · Portón (un segmento) · Riego (segmentos) |
| Multimedia | Sonando (segmentos) · Volumen living (dial) |
| Energía | Consumo (progreso) · Monóxido (progreso) · Agua caliente (dial) |
| Mantenimiento | Actualizaciones (segmentos) · Aspiradoras (segmentos) |

## Reglas que ya están decididas

- **Se ve lo confirmado, no lo pedido.** Una orden marca su segmento o su dial como "enviando" (late) hasta que HA confirma, o hasta 8 s. Si falla, vuelve al valor anterior y aparece el error.
- **Lo urgente adelante.** Un aviso grave se ve antes que cualquier otra cosa.
- **Dos profundidades distintas que no se mezclan.** La de la navegación (Zumly): el nivel anterior queda atrás desenfocado y oscurecido. La del objeto (capas de Orbit): nunca se desenfoca. El detalle no puede confundir una con la otra.
- **Continuidad con el objeto.** Se llega haciendo zoom desde el disco del canal, así que lo primero que se ve tendría que leerse como "el mismo disco, más cerca".
- **Volver:** botón abajo a la izquierda, rueda, flecha izquierda o deslizar. Hoy "tocar afuera" no existe, porque la vista cubre toda la pantalla.
- **Accesible con teclado y lectores:** el dial es un `role="slider"` y los segmentos son `role="switch"`.
- **Celular (menos de 600 px):** se mira un sistema a la vez. El detalle tiene que funcionar en 375 px y con el pulgar.

## Qué ofrece Orbit 2 (para que el diseño se pueda construir tal cual)

- **Universo** (`.bigbang`): el tamaño sale de una sola caja. El radio se divide en 12 carriles; `orbit-12` toca el borde y hasta `orbit-24` queda afuera.
- **Satélites** en un anillo, repartidos solos, con arranque y rango configurables. Cada satélite puede ser un universo propio (un objeto dentro de otro).
- **Arcos y progreso** (`<o-arc>`, `<o-progress>`): segmentos, bandas, texto curvo sobre el arco (`range="auto"` mide el largo solo). Pueden ser interactivos con margen de toque.
- **Capas en 3D** (`.depth`, `data-depth`, `.layer-front`): mantienen su tamaño aparente y se animan al cambiar de profundidad.
- **Dirección de cada satélite** (`--o-dir-x`, `--o-dir-y`): sirve para poner texto hacia afuera.

Pedido: que el diseño use esto y no posicione nada con trigonometría a mano. Si algo no se puede hacer con Orbit, mejor que quede anotado como algo que le falta a Orbit.

## Criterio visual

- Una sola tipografía: la del sistema (`-apple-system, Segoe UI`). Nada de mezclar.
- Nada de etiquetas chiquitas en mayúsculas espaciadas ni de anotaciones decorativas tipo "Fig. 01".
- Paleta de hoy (estilo Grafito): fondo `#0e1013`, texto `#f2f3f5`, apagado `#9aa0a8`, líneas `#262a31` y `#3a3f47`, leve `#ffb020`, grave `#ff5a4f`.
- Textos cortos y humanos, en castellano rioplatense.

## Lo que pedimos

Tres direcciones distintas para el detalle. Algunas ideas para arrancar, no son obligatorias:

- El mismo disco ampliado: los segmentos pasan a ser satélites con nombre y estado, y el dial ocupa el borde.
- El canal en el centro y sus entidades alrededor, cada una un satélite que se puede tocar.
- El tiempo como anillo: lo que pasó en las últimas horas alrededor del valor de ahora.

Cada dirección, en estos tres casos y en escritorio (1280×800) y celular (375×812):

1. **Luces · Luces**: segmentos, sin aviso.
2. **Clima · Calefacción**: dial con aviso leve ("Calienta con ventanas abiertas · Cerrar ventanas").
3. **Seguridad · Sensores**: segmentos, aviso grave y cámara.

Mostrar también un estado "enviando" y un estado de error en al menos uno de los tres casos.

## Imágenes

- `01-tablero-orbita.png`: tablero, vista Órbita.
- `02-sistema-clima.png`: objeto del sistema Clima, con el canal Calefacción adelante.
- `03` a `09`: detalle actual de Luces, Clima, Seguridad (Sirenas), Aberturas, Multimedia, Energía y Mantenimiento.
