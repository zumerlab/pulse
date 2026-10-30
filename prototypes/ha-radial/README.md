# Prototipo · Pulse sobre Home Assistant

El objeto radial de `zumly-radial`, ahora con un Home Assistant real (el demo
por defecto, corriendo en Docker). Misma gramática: tablero → sistema en capas →
detalle. Lo nuevo es que nada está escrito a mano: lecturas, avisos y su
resolución vienen del estado vivo.

```sh
cp .env.example .env.local   # HA_URL, HA_USERNAME, HA_PASSWORD (o HA_TOKEN)
npm run dev
```

Abrir `/prototypes/ha-radial/`.

## Conexión: WebSocket

Un solo socket hace todo: `get_states` al entrar, `subscribe_events`
(`state_changed`) para los cambios y `call_service` para las órdenes. REST
obligaría a sondear; con el socket los cambios llegan empujados (una persiana
que se cierra se ve moverse de a 10%).

- **El navegador no ve la contraseña.** `server/homeassistant.ts` hace el login
  (`/auth/login_flow` → `/auth/token`), guarda el refresh token en memoria y
  entrega solo un access token corto en `/api/ha/session` (solo desde esta
  máquina).
- **Mismo origen.** El socket va a `/api/ha/websocket` y Vite lo pasa a
  Home Assistant; las imágenes de cámara, por `/api/camera_proxy`.
- Si se corta, reintenta con espera creciente (hasta 15 s) y pide un token nuevo.

## Sistemas (del demo)

| Sistema | Canales | Controles en el anillo |
|---|---|---|
| Luces | 6 luces · brillo del living · enchufes | segmentos = `light.toggle`; dial = `brightness_pct` |
| Clima | calefacción · aire · Ecobee · humedad | dial = `climate.set_temperature` |
| Seguridad | alarma · sirenas · cerraduras · sensores | modos de alarma (código del demo), sirenas, cerraduras |
| Aberturas | ventana living · ventana pasillo · portón · riego | dial = `set_cover_position`; válvulas |
| Multimedia | reproductores · volumen del living | play/pausa; dial = `volume_set` |
| Energía | consumo · monóxido · agua caliente | dial = `water_heater.set_temperature` |
| Mantenimiento | actualizaciones · aspiradoras | instalar; arrancar / volver a la base |

Los modelos están en `model.ts`: cada canal es una función del estado. Si falta
una entidad, el canal no aparece; otra instalación arma su propio objeto.

## Tres vistas del tablero

Un selector arriba (se recuerda en el navegador) cambia cómo se mira la casa
entera. Las tres usan los mismos datos y abren el mismo sistema al tocarlas.

| Vista | Qué es | Para qué sirve |
|---|---|---|
| **Grilla** | Un mini anillo por sistema y los últimos cambios abajo | Ver todo parejo, leer rápido |
| **Órbita** | El pulso de la casa en el centro y los 7 sistemas alrededor | Pantalla principal: el centro late con cada cambio |
| **Capas** | Un solo objeto, un sistema por capa (la gramática del sistema, un nivel arriba) | Ver "qué llama" como profundidad: lo urgente adelante |

- **Órbita.** El anillo del centro tiene un segmento por sistema, frente a su
  tarjeta, pintado si ese sistema llama. Adentro, una cosa a la vez: cada aviso
  (el más grave primero, con "Abrir") y al final el pulso (cuántos avisos y las
  tres entidades que cambiaron último, con su valor vivo). Pasa solo cada 6 s;
  se frena con el puntero o el foco encima; los puntos de abajo (color = gravedad)
  eligen uno. Los sistemas no cambian de lugar: lo que se mueve es el color.
  - Toda la vista es un sistema de Orbit: el universo (`.bigbang`) es el cuadrado
    más grande que entra; los sistemas son satélites de `orbit-10` (anillo de 3,5
    carriles, corridos 20 px hacia adentro para el texto) y el pulso es el
    satélite `at-center` de `orbit-0` (11 carriles). Nada se posiciona a mano.
  - Los sistemas van corridos medio paso (`--o-from`: ninguno justo arriba), cada
    uno frente a su segmento del anillo del centro. En la mitad de arriba el texto
    va sobre el anillo: nada cuelga hacia el centro. Lo resuelve `.outward-y`
    de Orbit (antes, un `clamp()` sobre `--o-dir-y` en el CSS).
  - En 3D, como el objeto de cada sistema: `.depth` de Orbit con el pulso adelante
    (`layer-front`) y los sistemas un paso atrás (`data-depth="1"`), sin achicarse
    ni apagarse. El puntero inclina el conjunto ±7° (no en el celular).
  - El texto del centro escala con él (unidades `cqw`): no desborda en ventanas
    bajas.
- **Capas.** Siete capas que crecen 16% cada una (en lugar de 42%), todas a la
  vista: rompe la regla de "máximo 3 capas" a propósito, para probar el objeto
  integrado. Adelante va el sistema que más llama; tocar una banda trae ese
  sistema al frente hasta que llegue un aviso nuevo; tocar el centro entra.
  En 3D, como la órbita: cada capa 70 px más atrás y el puntero inclina el objeto ±7°.

## Ajustes en vivo (solo en desarrollo)

Con `npm run dev` aparece abajo a la derecha un panel "Ajustes" para probar
tamaños y distancias de la órbita y las capas sin tocar el código: órbita y
anillo de los sistemas, pulso del centro, distancia en 3D, crecimiento,
distancia, zoom y opacidad de las capas, e inclinación. Los valores quedan
guardados en el navegador; el número en color es el que se movió del valor del
código. "Copiar" deja la lista en el portapapeles para pasarla al código; "Volver
a los del código" los descarta. En el build no aparece (`tune.ts`).

## Avisos: reglas sobre el estado

| Aviso | Regla | Acción |
|---|---|---|
| Sirenas sonando (grave) | algún `siren` en `on` | Apagar |
| Cerradura trabada (grave) | `lock` en `jammed` | Reintentar |
| Movimiento en el patio (grave) | sensor en `on` **y** alarma armada | Entendido |
| Agua en el sótano (grave) | sensor de humedad en `on` | Entendido |
| Alarma disparada (grave) | `triggered` / `pending` | Desarmar |
| Calienta con ventanas abiertas (leve) | calefacción `heating` **y** ventanas abiertas | Cerrar ventanas |
| Sin llave con la alarma armada (leve) | alarma armada **y** cerraduras abiertas | Cerrar con llave |
| Portón abierto de noche (leve) | portón abierto **y** sol bajo el horizonte | Cerrar |
| Monóxido (leve ≥ 35 ppm, grave ≥ 100) | `sensor.carbon_monoxide` | Entendido |
| Actualizaciones (leve) | `update` en `on` | Instalar |

Las reglas cruzadas son lo interesante: armar la alarma desde el anillo hace
aparecer "movimiento" y "sin llave" sin que ningún dispositivo cambie.

## Qué se afinó respecto de zumly-radial

- **Se ve lo confirmado, no lo pedido.** Una orden marca su segmento o dial como
  *enviando* (late) hasta que Home Assistant manda el estado nuevo, o 8 s. El dial
  se mueve en el lugar mientras se arrastra y la orden sale al soltar (con
  teclado o rueda, tras 0,5 s quieto). Si Home Assistant falla, el error aparece
  en la franja y el valor vuelve.
- **Avisos en curso.** Mientras las ventanas se cierran, el aviso sigue con
  "en curso…" y sin botón; se va cuando Home Assistant confirma `closed`.
- **Varios segmentos en falla** se pintan todos (dos sirenas, dos puertas). Si el
  aviso llama (adelante y sin silenciar), la onda sale de esos segmentos
  (`o-arc.ripple` de Orbit); el disco ondea solo cuando el canal es un dial.
- **Regla 1 (estable)** con tiempo de llegada real; **regla 3 (satélites)**: los
  avisos que esperan orbitan el anillo de adelante con su ícono y se traen con
  un toque. **Silenciar** saca la onda y manda el aviso detrás; si el aviso cambia
  de texto, vuelve.
- **Un aviso grave nuevo abre su sistema solo** si se está en el tablero.
- **Tamaño según el espacio:** el objeto se achica (`--fit`) si el disco de
  adelante no entra con el zoom de aviso. Resuelve el hallazgo 3 de zumly-radial.
- **Tablero con pulso:** estado de la conexión, una línea con lo que llama y los
  últimos cambios de las entidades que se muestran.
- **Detalle:** los mismos controles, las entidades de Home Assistant detrás de
  cada canal y la imagen de la cámara cuando hay movimiento.

## Notas del demo

- La unidad es la de la instalación (el demo viene en °F).
- El código de la alarma del demo es `1234` (está en `model.ts`).
- "Poorly Installed Door" se traba a propósito al cerrarla: queda como aviso grave.
- Las sirenas del demo arrancan encendidas: es el primer aviso que aparece.
