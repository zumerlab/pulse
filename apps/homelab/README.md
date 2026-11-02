# Pulse homelab

Monitor a Mac or Linux machine with Pulse. A small collector reads CPU,
memory, disks, network and other available data. The app groups those readings
into systems and brings alerts to the front.

Channels appear when the collector has data for them. A machine without a
battery or Docker will not show those controls. The app uses the same core
board and radial components as the Home Assistant app.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run collect
```

Leave the collector running and start the app in another terminal:

```sh
npm run dev:homelab
```

Open [the app](http://127.0.0.1:5175). It looks for the collector at
`http://127.0.0.1:5180`. The connection panel lets you use another address
or try a demo machine.

To explore without a collector, open
[the simulated MacBook](http://127.0.0.1:5175/?demo).

## Systems and alerts

Available readings depend on the operating system and installed tools.

| System | Readings | Alert conditions |
|---|---|---|
| Compute | CPU, memory, swap, thermal state and processes | CPU at least 90%, memory pressure, heat or thermal throttling |
| Storage | Volumes, main disk and backup | Volume at least 90% full, critical at 97%; no Time Machine backup for 48 hours |
| Network | Internet, Wi-Fi, throughput and nearby devices | Internet unavailable or slow; weak Wi-Fi |
| Power | Battery level and health, power source and uptime | Discharging battery at most 20%, critical at 10%; health below 70% |
| Services | Docker containers and Homebrew services | Unhealthy container, container exited with an error, or service error |
| Updates & security | Available updates and protection settings | Pending updates; FileVault, firewall or Gatekeeper disabled |
| Peripherals | Bluetooth device batteries | Battery below 20% |

The collector accepts a limited set of actions: start, stop or restart a
container, restart a Homebrew service, and start a Time Machine backup.
Other alerts can be acknowledged with **Got it**.

## Collector

The collector runs on the machine you want to monitor. It uses Node.js and
system commands, with no additional npm dependencies. By default it samples
every three seconds, listens on `127.0.0.1:5180` and saves history in
`~/.pulse/homelab/history.json`.

To print one snapshot and exit:

```sh
node apps/homelab/collector/collector.mjs --once
```

To change its port and sampling interval:

```sh
node apps/homelab/collector/collector.mjs --port 5190 --interval 5
```

On macOS it reads tools such as `vm_stat`, `pmset`, `ioreg` and `tmutil`.
Linux readings use `/proc`, `/sys` and available system tools. Docker and
Homebrew data are included when those tools are available.

Mac temperature readings require `smctemp` or `osx-cpu-temp`. Without a helper,
the thermal channel uses the CPU speed limit reported by `pmset -g therm`.

### Connect from another device

To make the collector available on your LAN, bind it to a network address
and supply a token:

```sh
node apps/homelab/collector/collector.mjs --host 0.0.0.0 --token <secret>
```

Enter the collector's address and token in the app's connection panel. The
app sends the token as a Bearer authorization header. You can also provide
`collector` and `token` URL parameters. The collector requires a token when
listening beyond localhost.

### HTTP API

| Request | Response or action |
|---|---|
| `GET /` | Snapshot with `host`, `at`, `interval` and `things` |
| `GET /history?ids=a,b&hours=24` | Recorded state and timestamp rows for the requested ids |
| `POST /act` | Run an action described by `{ kind, name }` |

Supported action kinds are `docker.start`, `docker.stop`, `docker.restart`,
`service.restart` and `backup.start`.

Each item in `things` has a name, state, unit, attributes and last-change time.
Ids include `cpu.load`, `mem.used`, `disk.<volume>`, `net.internet`,
`battery.level`, `docker.<name>` and `service.<name>`. Items that are unavailable
are omitted from the snapshot.

## App settings

The gear button controls systems, channels, board layout and appearance.
Preferences stay in the current browser under `pulse-homelab-settings`.

The app also accepts URL parameters:

| Parameter | Purpose |
|---|---|
| `collector` | Collector address |
| `token` | Collector access token |
| `demo` | Use the simulated machine; no value needed |
| `systems` | Comma-separated system ids, such as `compute,network` |
| `mode` | `grid`, `orbit`, `layers` or `list` |
| `start` | System to open first |

## Development

| File | Responsibility |
|---|---|
| [collector/collector.mjs](collector/collector.mjs) | Machine readings, history, HTTP API and supported actions |
| [source.ts](source.ts) | `MachineSource` interface and HTTP collector client |
| [demo/source.ts](demo/source.ts) | Simulated machine |
| [model.ts](model.ts) | Systems, channels and alert rules |
| [host.ts](host.ts) | Adapter from the machine source to the core's `PulseHost` |
| [main.ts](main.ts) | Connection panel, URL options and board setup |

For shared rendering and interactions, see the
[core README](../../packages/core/README.md).

Run checks from the repository root:

```sh
npm run typecheck
npm run lint
npm test
npm run build -w pulse-homelab
```

The Playwright tests use the simulated machine, so they do not require a
collector running on your computer.
