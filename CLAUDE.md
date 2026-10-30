# Pulse

La UI: objeto radial con capas por urgencia. Usa Orbit (`../orbit`) y Zumly (`../zumly`). Home Assistant es solo la fuente de datos del demo real (`prototypes/ha-radial`); Pulse no depende de HA.

- Si aparece un rodeo para algo que corresponde a Orbit o a Zumly: no dejarlo escondido en Pulse. Anotarlo en `../coordinacion/PENDIENTES.md` bajo ese proyecto.
- Orbit (`@zumer/orbit` 2.1.0) y Zumly (1.2.2) vienen de npm. Para probar una rama sin publicar, entra como `.tgz` en `prototypes/zumly-radial/vendor/`: `../coordinacion/README.md`.
- Home Assistant de prueba: Docker local en `127.0.0.1:8123`. Credenciales en `.env.local`.

## Coordinación con Orbit y Zumly

Antes de empezar, leer `../coordinacion/README.md` y `../coordinacion/PENDIENTES.md` (sección Pulse).
Al terminar, actualizar `../coordinacion/ESTADO.md`, `PENDIENTES.md` y `BITACORA.md` con lo que cambió.
