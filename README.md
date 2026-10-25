# Pulse

Esqueleto local de domótica con descubrimiento real de servicios en la LAN y una
demo de cinco entidades controlables. TypeScript, una pantalla sin framework y
Vite. El core reconstruye su estado desde un historial de eventos.

## Ejecutar

Requiere Node.js 22.18+ o 24+ y npm.

```sh
npm ci
npm run dev
```

Abrir la dirección local indicada en la terminal. En **En tu red**, pulsar
**Buscar en mi red** para consultar los anuncios de equipos en la red de esta
máquina. Cada búsqueda dura unos 10 segundos. Debajo, la demo carga automáticamente:

| Entidad | Tipo | Controles |
| --- | --- | --- |
| Living Light | Device | Encender/apagar y brillo |
| Kitchen Light | Device | Encender/apagar y brillo |
| Bedroom Blind | Device | Posición |
| Living Thermostat | Device | Temperatura objetivo y modo HVAC |
| Home Alarm | System | Armar en casa, armar fuera y desarmar |

El historial muestra el descubrimiento y cada cambio confirmado por el mock.
La temperatura medida se muestra como lectura; cambiar el objetivo no inventa
una medición nueva. Brillo y encendido son estados independientes.

## Estructura

```text
core/           entity, device, system, capability, action, event, adapter, registry
domains/        lighting, openings, climate, security, cameras, media
adapters/mock/  MockAdapter: cinco entidades y respuestas simuladas
adapters/lan/   descubrimiento mDNS/DNS-SD y SSDP; inventario de anuncios
adapters/matter/ controlador local, vinculación y estado confirmado por Matter
adapters/upnp/  controles de sonido de televisores compatibles en la red local
server/         APIs locales de descubrimiento, vinculación y eventos
app/            pantalla de controles e historial
tests/          contrato del core e integración con adapters
```

`PulseEntity = Device | System`: un Device representa un objeto controlable;
un System representa otro controlador como unidad. Las capabilities determinan
las acciones disponibles. Los dominios enumeran capacidades posibles, sin imponer
que cada entidad las tenga todas. `cameras` queda definido sin inventar una sexta
entidad, streaming ni control de cámaras.

## Descubrimiento en la red local

El navegador consulta un servicio Node integrado en el servidor local de Vite,
tanto con `npm run dev` como con `npm run preview`. Un despliegue estático de
`dist/` por sí solo no puede hacer descubrimiento LAN.

- **mDNS / Bonjour / DNS-SD:** enumera tipos de servicio y resuelve sus anuncios
  PTR, SRV, TXT, A y AAAA. Usa IPv4 e IPv6 cuando la interfaz dispone de ambas.
  También consulta directamente Google Cast, AirPlay, HomeKit,
  Matter, HTTP, Hue, SMB y Android TV. Solo conserva metadatos de identificación
  seleccionados; no guarda todo el TXT.
- **SSDP / UPnP:** envía `M-SEARCH` y recoge respuestas unicast. Agrupa variantes
  del mismo identificador. No descarga las URLs anunciadas por los dispositivos.
- Los anuncios se agrupan por host/dirección cuando corresponde. Una fila puede
  representar varios servicios; no es una garantía de identidad física ni de
  que el equipo siga conectado después de la búsqueda.
- Los resultados reales son candidatos de descubrimiento, separados de
  `Device | System`. No se inventan dominio, estado ni capabilities controlables.
  Incorporar/controlar un equipo requiere un adapter compatible y, según su
  protocolo, autorización o emparejamiento.
- **Matter:** distingue anuncios de dispositivos operativos, de vinculación y de
  controladores. Solo muestra vinculación disponible cuando el anuncio incluye
  `CM=1` o `CM=2`; `CM=0` indica cerrada y la ausencia de ese dato queda como
  desconocida. Es lo anunciado durante la búsqueda, no una vinculación a Pulse.
  No identifica una marca por la dirección IP ni vincula equipos automáticamente.

En macOS se usa la interfaz de la ruta por defecto, que puede ser Wi-Fi, Ethernet
o VPN. Se vuelve a consultar en cada búsqueda y se muestra su dirección. Para
elegir explícitamente una interfaz local:

```sh
PULSE_INTERFACE=en0 npm run dev
```

En otros sistemas solo hay selección automática si existe una única interfaz
IPv4 no interna; con varias, se requiere `PULSE_INTERFACE`. La selección de red
todavía requiere una dirección IPv4. La búsqueda mDNS también escucha IPv6 en esa
misma interfaz y conserva las direcciones AAAA anunciadas. Las direcciones IPv6
link-local incluyen el ámbito de la interfaz; los anuncios por ambas familias
se agrupan por host para evitar filas duplicadas. SSDP sigue usando IPv4.
No hace búsquedas por Bluetooth ni directamente por Thread.
No enumera clientes del router ni prueba puertos: un equipo
silencioso, dormido, en otra VLAN o en una red que bloquea multicast puede no
aparecer. Los Nest tampoco se identifican por marca sin un anuncio que lo respalde.

El escaneo se limita a una interfaz y su subred; omite la propia máquina, cierra
los sockets al terminar y limita registros y consultas. Las lecturas GET de
`/api/discovery` no inician búsquedas. POST requiere el encabezado
`X-Pulse-Discovery: 1` y las búsquedas simultáneas comparten el mismo trabajo.
La API comprueba origen/host local, no habilita CORS y no acepta destinos ni URLs
del cliente. Los resultados permanecen en memoria en el servicio; reiniciarlo
los borra. Una nueva búsqueda reemplaza el inventario anterior.

Referencias de protocolo: [DNS-SD, RFC 6763](https://www.rfc-editor.org/rfc/rfc6763.html),
[multicast-dns](https://github.com/mafintosh/multicast-dns),
[UPnP Device Architecture 1.1](https://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.1.pdf),
[descubrimiento Matter](https://developers.home.google.com/matter/primer/commissionable-and-operational-discovery).

## Vincular un dispositivo Matter

1. Habilitar la vinculación con otra aplicación en el dispositivo o en su app actual.
2. Pulsar **Agregar dispositivo**, siempre visible en **En tu red**, para buscar
   equipos. Pulse elige la conexión que admite cada equipo; Matter es una opción.
3. Pulsar **Agregar** en el equipo encontrado con vinculación abierta y
   dirección/puerto resueltos. Introducir el código temporal Matter (manual o
   contenido `MT:` del QR) y pulsar **Vincular**. El código se borra del campo al
   enviar y no se guarda ni se registra.
4. Los endpoints compatibles aparecen en **Mis dispositivos**; sus cambios
   llegan a la actividad mediante eventos del servidor.

El controlador usa matter.js 0.17.9 y vinculación sobre la red IP existente.
No configura Wi-Fi por Bluetooth ni aprovisiona redes Thread. La selección usa
exclusivamente las direcciones del anuncio elegido en el servidor, vigente durante
un máximo de diez minutos; el navegador no puede indicar destinos arbitrarios.

Esta versión mapea OnOff/brillo, posición de persianas y temperatura/modos de
termostatos según los clusters disponibles. En termostatos con calefacción y
refrigeración, cambiar el objetivo requiere elegir Calor o Frío: el modo automático
con dos umbrales todavía no tiene control en Pulse. Las capacidades no compatibles
no generan controles. Un equipo vinculado sin capacidades soportadas conserva la
vinculación y muestra un aviso, sin inventar una entidad controlable.

Las credenciales y la información Matter quedan en **`.pulse/matter/`**, fuera de Git,
con directorios privados y acceso web bloqueado. Conservar esa carpeta permite
recuperar los equipos tras reiniciar. No se guarda el código de incorporación.
El log de eventos permanece en memoria del servidor: recargar el navegador lo
conserva; reiniciar el servidor inicia un nuevo log a partir de la información Matter
restaurada. Los equipos sin conexión conservan sus lecturas previas y se marcan como
no disponibles. Ninguna confirmación de comando se convierte por sí sola en estado:
se usa el reporte o la lectura de vuelta del dispositivo.

`GET /api/matter` inicia el controlador local y devuelve su proyección;
`GET /api/matter/events` entrega snapshots por SSE. Los POST de vinculación y acción
exigen `X-Pulse-Matter: 1`, origen local y cuerpos acotados. La vinculación tiene un
solo trabajo concurrente; un error no borra una credencial que el equipo pudiera
haber aceptado antes de perder la respuesta final.

## Agregar una TV sin Matter

1. Encender la TV y conectarla a la misma red que esta máquina.
2. Buscarla en **En tu red** y pulsar **Agregar** en su fila.
3. Pulse consulta sus controles locales y la incorpora si puede leerlos.

El adapter UPnP admite televisores que anuncian `MediaRenderer` y
`RenderingControl`. Solo ofrece volumen y silencio cuando el televisor anuncia
las acciones correspondientes y entrega lecturas válidas. No requiere código
Matter. Detectar Google Cast, AirPlay o un servicio de red por sí solo no implica
que Pulse ya pueda controlarlo: esos equipos muestran el límite en la lista.
No se implementan encendido, canales, aplicaciones ni reproducción en este bloque.

La selección de equipos se guarda en **`.pulse/media.json`**, fuera de Git y del
acceso web. Al reiniciar se recuperan, con controles deshabilitados si no responden.
El estado se consulta periódicamente y después de cada acción; solo las lecturas
confirmadas generan cambios en el historial. UPnP funciona independientemente de
que el controlador Matter esté disponible.

La API local `/api/media` expone la proyección y `/api/media/events` sus eventos
por SSE. `/api/media/add` acepta exclusivamente el identificador de un candidato
UPnP descubierto en los últimos diez minutos; `/api/media/action` ejecuta las
acciones disponibles. Los POST requieren origen local y `X-Pulse-Media: 1`.
Las URLs de descripción y control se validan contra la dirección descubierta,
sin redirecciones ni destinos aportados por el navegador.

Referencia: [UPnP RenderingControl](https://openconnectivity.org/wp-content/uploads/2015/11/UPnP-av-RenderingControl-v3-Service-20101231.pdf).

## Contrato mínimo

```ts
import { Registry } from './core/registry.ts';
import { MockAdapter } from './adapters/mock/index.ts';

const pulse = new Registry([new MockAdapter()]);
const unsubscribe = pulse.subscribe((event) => console.log(event));
await pulse.discover();

pulse.getCapabilities('light:living');
pulse.getState('light:living');
await pulse.execute('light:living', { type: 'setBrightness', value: 40 });

unsubscribe();
pulse.dispose();
```

El adapter tiene `discover`, `getState`, `getCapabilities`, `execute` y `subscribe`.
Sus métodos de lectura devuelven promesas. El Registry expone lecturas sincrónicas
de la proyección, enruta las acciones y recibe eventos. Una respuesta exitosa de
`execute` no modifica por sí sola el estado: hace falta un evento del adapter.

El log guarda primero eventos `discovered`, con metadatos y estado inicial, y luego
eventos `stateChanged`, con parches de estado. `projectEvents(pulse.getEvents())`
reconstruye las entidades completas. El orden de inserción manda; el timestamp es
informativo. Todas las lecturas y entregas a suscriptores son copias defensivas.

La proyección se calcula al leer el log: es deliberadamente simple para este
prototipo. No hay otra caché mutable que pueda convertirse en una segunda fuente
de verdad. El estado interno del mock representa el hardware simulado.

`discover()` es idempotente durante una sesión; no duplica entidades ni listeners.
Un adapter puede emitir `discovered` después del arranque para incorporar una
entidad recién vinculada, conservando la validación de identidad y ownership.
Un Registry nuevo inicia otra sesión. El mock emite eventos al cambiar valores;
repetir el mismo valor no agrega eventos. `dispose()` cancela las suscripciones;
el historial ya registrado sigue disponible para lectura.

## Límites de esta versión

- Log del core en memoria: recargar la página reinicia la demo. El inventario LAN
  vive en la memoria del servicio local; las vinculaciones Matter sí se persisten.
- Posición y brillo: 0–100; posición 100 significa completamente abierta.
- Objetivo del termostato mock: 5–35 °C; modos `off`, `heat`, `cool`, `auto`.
- Capabilities de lectura como `motion`, `contact`, `lock` y `videoStream` están
  declaradas; esta versión no agrega acciones ni hardware para ellas.
- Sin automatizaciones, escenas, usuarios, cloud, plugins, rooms, analytics ni AI.

## Verificar

```sh
npm test
npm run lint
npm run build
```

`build` comprueba tipos y genera `dist/`. `npm run preview` sirve ese resultado
localmente. Los tests usan el runner de Node y prueban acciones, validaciones,
replay, eventos externos, aislamiento de datos y limpieza de suscripciones. Las
pruebas de LAN usan paquetes sintéticos y un servicio HTTP en loopback; no hacen
escaneos reales. Cubren resolución fuera de orden, TTL, duplicados, límites,
filtrado de subred e interfaz IPv6, direcciones AAAA, estados anunciados de Matter
y acceso a la API.

`tests/matter-integration.test.ts` ejecuta Matter real (criptografía, vinculación,
comandos, reportes y restauración de un controlador nuevo) sobre `NetworkSimulator`
aislado. No anuncia un equipo de prueba en la LAN ni cambia dispositivos físicos.
Se puede ejecutar por separado con `npm run test:matter`.
