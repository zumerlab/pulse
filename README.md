# Pulse

Interfaz radial para estados que compiten por atención: un objeto circular por
sistema, con capas en profundidad. Lo que importa ahora va adelante; lo demás
espera atrás. Hecho con [Zumly](https://github.com/zumerlab/zumly) (navegación
por zoom) y [Orbit](https://github.com/zumerlab/orbit) (anillos y capas).

Pulse no controla dispositivos por su cuenta: se monta sobre Home Assistant.

## Ejecutar

Requiere Node.js 22.18+ o 24+ y npm.

```sh
npm ci
cp .env.example .env.local   # HA_URL, HA_USERNAME, HA_PASSWORD (o HA_TOKEN)
npm run dev
```

Abrir la dirección local indicada en la terminal y elegir un prototipo.

## Estructura

```text
prototypes/ha-radial/     el objeto radial sobre Home Assistant en vivo (WebSocket)
prototypes/zumly-radial/  el mismo objeto con datos simulados; trae el paquete de Orbit
server/homeassistant.ts   login con Home Assistant; el navegador solo recibe un token corto
docs/                     recetario del sistema radial
```

Cada prototipo tiene su README con lo que se probó y lo que quedó abierto.
