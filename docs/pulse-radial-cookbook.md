# Pulse radial · recetario

Sistema de interfaz radial para estados que compiten por atención: un objeto
circular por sistema (casa, auto, mascota, salud, servidor…), con capas en
profundidad. Lo que importa ahora va adelante; lo demás espera atrás.

Prototipo: lienzo **Orbit Status Rings** (claude.ai), sección *Sistema
consolidado*. El componente es `Pulse.dc.html`; está hecho con Orbit 1.5.0
(`@zumer/orbit`).

> Los prototipos de `prototypes/` corren con Orbit 2 (rama `dev`) y Zumly 1.2.2.
> §13 quedó como historia: todo lo de "Qué le falta a Orbit" salió en 1.6.0 y
> 2.x (ver el README de `prototypes/zumly-radial`).

---

## 1. La idea en una frase

> Cada sistema es un objeto radial con 2 a 4 canales. El canal activo va
> adelante; los demás esperan atrás, más grandes y tenues. Un aviso trae su
> canal al frente y, al resolverse, lo devuelve. Un sistema nuevo es solo datos.

Tres usos de la profundidad, en este orden de importancia:

1. **z = qué está activo.** La capa de adelante es la que se lee y se usa.
2. **z = qué es urgente.** Un aviso sube su capa.
3. **z = cuánto espacio.** El sistema se acerca (zoom) cuando algo necesita foco.

---

## 2. Anatomía

| Parte | Qué es | Qué muestra |
|---|---|---|
| **Capa** | Un canal del sistema (Clima, Luces…) | Un disco con su anillo |
| **Disco** | El círculo de la capa | Solo la de adelante tiene disco lleno y **cara** |
| **Cara** | Centro de la capa de adelante | Nombre del canal, ícono, valor grande, una línea |
| **Anillo** | Borde de la capa | Progreso (0–1) o segmentos (2–8) |
| **Etiqueta de borde** | Texto en arco en las capas de atrás | `CANAL · VALOR`, a −30° y +30° |
| **Satélite** | Punto con ícono sobre el anillo activo | Un aviso que espera (regla 3) |
| **Onda** | Anillo que se expande y se desvanece | Solo en el aviso de adelante (regla 2) |
| **Resumen** | Capa especial “N avisos” | Un segmento por aviso (regla 4) |
| **Arco de acciones** | Banda abajo del disco | Posponer · Silenciar (acciones radiales) |
| **Franja** | Debajo del objeto | Qué hay adelante, por qué, acción, quién espera |

---

## 3. Modelo de datos

Un sistema es un objeto. Nada de esto toca el motor.

```js
{
  title: 'Casa',
  front: ['clima', 'lights', 'sec', 'cam'],     // orden base, de adelante hacia atrás
  groups: [{                                    // opcional (regla 5)
    id: 'intrusion', of: ['sec', 'cam'], level: 2,
    name: 'Intrusión', big: 'Intrusión', label: 'ventana + movimiento',
    why: 'Ventana abierta y alguien en el patio', verb: 'Ver cámaras'
  }],
  ch: {
    sec: {
      name: 'Seguridad',
      glyph: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4', // path SVG 24×24
      accent: '#F2F3F5',          // solo lo usa el estilo Grafito
      type: 's', segs: 6,         // 's' segmentos (2–8) | 'p' progreso
      level: 2,                   // 1 leve · 2 grave
      ev: 'Se abre una ventana',  // texto del evento (demos)
      ok: { on: 6, big: 'Cerrada', label: '6 de 6 aberturas' },
      al: { on: 6, seg: 3, big: 'Abierta', label: 'ventana del baño',
            why: 'Se abrió con la alarma armada', verb: 'Ya la cerré' }
    },
    clima: {
      name: 'Clima', glyph: '…', accent: '#4DA3FF', type: 'p', level: 1,
      ok: { v: 0.82, big: '21,5°', label: 'objetivo 23°' },
      al: { v: 0.95, big: '28°', label: 'rinde 30% menos',
            why: 'El filtro del aire está sucio', verb: 'Pedir filtro' }
    }
  }
}
```

- `ok` es el estado normal, `al` el de aviso.
- Progreso: `v` de 0 a 1. Segmentos: `on` = cuántos encendidos; `seg` = el
  segmento que falla (si se omite, se pintan todos los encendidos).
- `why` y `verb` solo existen en `al`: la causa y la acción que lo resuelve.

**Sistemas incluidos:** `casa`, `auto`, `mascota`, `salud`, `servidor`.

---

## 4. Props del componente

| Prop | Valores | Default | Para qué |
|---|---|---|---|
| `system` | casa · auto · mascota · salud · servidor | casa | Sistema predefinido |
| `config` | objeto (ver §3) | — | Sistema propio; pisa a `system` |
| `theme` | grafito · marfil · papel · contraste | grafito | Estilo (solo tokens) |
| `view` | mini · plano · 3d | plano | Vista inicial |
| `rules` | 0 a 5 | 5 | Reglas para varios avisos (§6) |
| `actions` | franja · radial · ambas | franja | Dónde viven las acciones (§9) |
| `zoom` | auto · fijo | auto | Zoom dinámico al frente (§8) |
| `autoDepth` | bool | true | Un aviso enciende el 3D |
| `start` | `['sec', …]` | — | Avisos con los que arranca |
| `incoming` | `{ id, on, seq }` | — | Evento de afuera; `seq` nuevo = evento nuevo |
| `resetKey` | cualquier valor | — | Al cambiar, vuelve al estado inicial |
| `demo` | bool | true | Muestra los botones “Simular evento” |

---

## 5. Orden de capas

Sin avisos: **elección a mano** (tocar un anillo o “Al frente”) > **orden base**.

Con avisos: los avisos van adelante del resto, ordenados según las reglas (§6).

- Un aviso nuevo **cancela** la elección a mano.
- Al resolver un aviso, el orden **vuelve solo**.
- Un aviso **grave despierta** la vista Mini.
- Después de un cambio de capa, los controles quedan **bloqueados 0,8 s**: el
  botón nuevo aparece donde estaba el anterior y un toque nervioso resolvería dos
  cosas.

---

## 6. Varios avisos: cinco reglas acumulables

| `rules` | Regla | Qué hace |
|---|---|---|
| 0 | Sin reglas | El grave más reciente se queda con el frente. Todo se pinta y todo late. *(solo para comparar)* |
| 1 | **Estable** | El de adelante se queda; solo lo desplaza uno **más grave**. Los demás esperan por orden de llegada. |
| 2 | **Una onda** | Solo el aviso de adelante emite ondas. |
| 3 | **Satélites** | Los que esperan orbitan el anillo activo con el **ícono de su canal**; las capas de atrás vuelven a gris. |
| 4 | **Resumen** | Con 3 avisos o más, adelante va “N avisos” (un segmento por aviso). Abrís uno, lo resolvés, volvés. |
| 5 | **Grupos** | Avisos con la misma causa se unen en uno (lo declara el sistema en `groups`). |

Demo: tablero *Pulse · varios avisos, reglas 0 a 5* (misma escena en seis tarjetas).

---

## 7. Profundidad

| Capa | Tamaño | z | Trazo | Muestra |
|---|---|---|---|---|
| Adelante | 1× | 0 | 6 px | disco lleno, cara, acción |
| Atrás | 1,42× | −110 | 3 px | anillo + etiqueta a −30° |
| Más atrás | 1,84× | −220 | 2,5 px | anillo + etiqueta a +30° |
| Fondo | 2,26× | −330 | — | oculta · “+1 al fondo” |

- El **tamaño aparente es el mismo** en Plano y en 3D: en 3D la capa se aleja en
  z y la escala lo compensa (perspectiva 900 px: `escala = tamaño × (900 − z) / 900`).
- Con acciones radiales visibles, las capas de atrás se abren un **14%** para
  dejar lugar al arco.

### Vistas

| Vista | Qué es |
|---|---|
| **Mini** | Ícono de 84 px (el objeto al 22%), sin texto; trazos engrosados para que se lea |
| **Plano** | El objeto completo, sin separación en z |
| **3D** | Con un aviso (si `autoDepth`) o a pedido. Paralaje ±7° con el puntero |

---

## 8. Zoom y movimiento

| Qué | Valor |
|---|---|
| Zoom en calma | 1,2× |
| Zoom con aviso | 1,7× (las capas de atrás quedan cortadas por el borde) |
| Zoom en resumen | 1,5× |
| Cambio de capa / zoom | 0,8 s · `cubic-bezier(.2,.8,.2,1)` |
| Onda de aviso leve | cada 1,6 s |
| Onda de aviso grave | cada 0,9 s |
| Paralaje | 0,25 s · `ease-out` |

Si con el zoom el anillo de una capa queda más grande que el recuadro, **su
etiqueta se oculta** (la información sigue en satélites y franja).

---

## 9. Acciones

`actions = 'franja' | 'radial' | 'ambas'`

- **Franja** (default): botón de la acción principal abajo. Para el auto mientras
  se maneja.
- **Radial**: todo en el objeto.
  - **Disco = acción principal, dos toques.** El primero **arma** (el anillo se
    llena, “TOCÁ OTRA VEZ”); el segundo **ejecuta**. Se desarma a los 3 s.
    Igual con mouse, tacto y teclado.
  - **En el resumen**, un toque abre el aviso más grave (abrir no cambia nada).
  - **Arco de abajo**: **Posponer** (el aviso se va atrás y deja pasar al
    siguiente; vuelve si queda único o se repite) y **Silenciar** (sin ondas; el
    color sigue). Botones reales de 76 × 44 px encima del arco.
- **Ambas**: radial como atajo, franja como alternativa siempre visible.

> **Abierto:** las acciones radiales todavía no cierran del todo (ver §14).

---

## 10. Estilos

| Estilo | Fondo | Tinta | Leve | Grave | Profundidad |
|---|---|---|---|---|---|
| **Grafito** | `#0E1013` | `#F2F3F5` | `#FFB020` | `#FF5A4F` | vidrio oscuro, desenfoque leve, acentos por canal |
| **Marfil** | `#F1EEE7` | `#1B1C1F` | `#9A5B00` | `#C42E14` | vidrio claro con sombra, una sola tinta |
| **Papel** | `#FFFFFF` | `#111111` | `#92400E` | `#B91C1C` | solo trazo, sin desenfoque |
| **Contraste** | `#000000` | `#FFFFFF` | `#FFD400` | `#FF7070` | trazos 8/4 px, sin desenfoque ni transparencia |

El estilo cambia tokens (colores, desenfoque, trazos), **nunca** la gramática de
capas.

---

## 11. Contra la confusión de capas

1. **Máximo 3 capas visibles.** El resto se cuenta, no se dibuja.
2. **Solo la de adelante tiene cara y disco lleno.** Atrás: anillo y etiqueta.
3. **Trazo adelante = 2× el de atrás.** La jerarquía se lee aun sin color.
4. **Etiquetas escalonadas a −30° y +30°**, nunca en la misma línea; el arco
   crece con el texto.
5. **El color es solo del aviso:** anillo, segmento y etiqueta. El disco no se
   pinta nunca.
6. **En segmentos, solo el que falla** se pinta, y la onda sale de ahí.
7. **Nunca dos capas al mismo radio:** cada paso agranda ≥ 42%.
8. **El contenedor 3D no recibe clics**; las capas sí. Tocar un anillo lo trae.

---

## 12. Recetas

### Agregar un sistema

1. Elegí 2 a 4 canales que compitan por atención y ordenalos de adelante hacia atrás.
2. Para cada canal: tipo, nivel, estado normal y de aviso (con `why` y `verb`).
3. Si hay avisos que significan lo mismo juntos, declaralos en `groups`.
4. Montalo con el estilo que pida el lugar:

```html
<dc-import name="Pulse" config="{{ miSistema }}" theme="marfil" view="mini"
           incoming="{{ ultimoEvento }}"></dc-import>
```

### Mandar un evento desde afuera

```js
ultimoEvento = { id: 'nodes', on: true, seq: 7 }   // on: false lo resuelve
```

Cada evento necesita un `seq` nuevo; el mismo `seq` se ignora.

### Tablero de varios sistemas

Una fila de `view="mini"`. Un aviso grave abre esa tarjeta sola; al resolverse,
vuelve a Mini.

### Auto

`actions="franja"`, `rules` 5, `autoDepth` true. Nada táctil mientras se
maneja; las alertas pueden volver atrás solas por tiempo (prototipo *Auto en capas*).

### Comparar estados lado a lado

`start` con los mismos avisos y un `resetKey` compartido para reiniciar todas
las tarjetas a la vez.

---

## 13. Notas de implementación con Orbit 1.5.0 (histórico)

- **Cada capa es un `.bigbang` completo** dentro de un contenedor que se mueve en
  z: `.orbit-N` y `.satellite` ya usan `transform`, así que `translateZ` no se
  puede poner en la órbita.
- **Satélites y arcos deben ser hijos directos de `.orbit-N`.** No usar un bucle
  de plantilla que agregue un contenedor en el medio: rompe el conteo de Orbit.
- **Fondo de 360° en `o-progress variant="stroke"`:** con `--o-back-stroke` se
  dibuja corrido (bug de `calculateStrokeArc`). Rodeo: otro `o-progress
  value="99.9"` en su propia órbita. *Arreglado en el repo de Orbit, sin
  publicar.* Con rangos parciales (velocímetro de 270°) el fondo anda bien.
- **`o-arc` no recibe clics** salvo con el atributo `interactive`. Para acciones:
  arco solo visual y botones HTML transparentes encima.
- **Satélite en un ángulo exacto:** su propia `.orbit-N` con
  `--o-range: 0deg; --o-from: Xdeg`.
- **Separación de segmentos:** `gap-*` llega hasta 30 y no alcanza para anillos
  de 3–6 segmentos; usar `--o-gap: 24–60` en línea.
- **Etiqueta en arco:** `o-arc` con `--o-fill: transparent` y `--o-color`; el
  largo del arco (`--o-range`) se calcula según el texto.
- **Contenedor 3D:** `pointer-events: none` en el contenedor y `auto` en las
  capas; si no, el contenedor (en z = 0) se queda con los clics de las capas de
  atrás.

### Qué le falta a Orbit

Resuelto: 1.6.0 trajo `.depth`, `data-depth`, `.layer-front`, `--o-z` y el
fondo de 360°; Orbit 2 trae además `interactive` con `hit-width`,
`range="auto"`, `--o-gap` heredado, `.satellite.at-value`, `.outward` y
`o-arc.ripple`. La lista original:

- `--o-z` por órbita, sumado a su transform.
- Una clase o atributo de capa activa (`.layer-front`, `data-depth`).
- Transición de profundidad por defecto.
- Publicar el arreglo del fondo de 360°.

---

## 14. Abierto

- **Acciones radiales.** Más claras con dos toques y el arco, pero todavía no
  cierran. Opciones pendientes de probar: satélites de acción, gestos (arrastrar
  el disco afuera para posponer), y si conviene que la ventana de 3 s sea más larga.
- **Voz.** Encaja bien (siempre hay un “esto” adelante; los canales tienen
  nombre; el resumen se puede leer en orden de gravedad) pero quedó para después.
- **Fotos reales en cámaras.** Hoy son marcadores “[video en vivo]”.
- **Peso del lienzo.** Con tantos tableros a veces tarda en iniciar; conviene
  mover las exploraciones viejas a otra página.

---

## 15. Cómo llegamos acá

1. Iconos compuestos: un glifo y dos anillos relacionados (no dos datos al azar).
2. La profundidad tiene que significar algo: activo, urgente, historia.
3. Capas en z vistas **de frente**; la perspectiva inclinada solo explica.
4. Cuatro dominios (casa, auto, mascota y uno en vidrio con WebGL) → un motor.
5. Ondas en vez de temblores: lo que necesita atención “llama”.
6. Varios avisos → cinco reglas.
7. Acciones dentro del objeto → dos toques, arco, satélites con ícono, zoom.
