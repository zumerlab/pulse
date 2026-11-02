# Pulse · homelab

The radial object over a machine: the Mac (or the Linux box, or the Raspberry
Pi) you are sitting at, read by a small collector that runs on it. Same grammar
as the other apps: board → layered system → detail. Nothing is written by
hand: readings, alerts and their actions come from what the collector finds,
and a machine without a battery or without Docker has fewer rings. The
object itself is the core package `@zumer/pulse`; this app adds the collector,
`model.ts` (what a machine's things mean) and the shell.

```sh
npm run collect          # the collector, on the machine to watch: http://127.0.0.1:5180
npm run dev:homelab      # the app, from the repo root: http://127.0.0.1:5175
```

Open the app: it looks for the collector at `http://127.0.0.1:5180` and shows
the machine. No collector yet? The panel says how to start it, and offers a
demo machine instead (`?demo`), a MacBook with a few things calling.

## The systems

| System | Channels | Calls when |
|---|---|---|
| Compute | CPU, memory, swap, thermal, processes | CPU ≥ 90 %, memory tight, CPU hot or slowed by heat |
| Storage | volumes, main disk, backup | a volume ≥ 90 % full (critical at 97 %), no Time Machine backup for 48 h |
| Network | internet, Wi‑Fi, throughput, devices | the internet does not answer (critical) or is slow, weak Wi‑Fi |
| Power | battery, battery health, power source, uptime | battery ≤ 20 % discharging (critical at 10 %), health under 70 % |
| Services | containers, Homebrew services | a container unhealthy or exited with an error, a service in error |
| Updates & security | updates, protection | updates waiting; FileVault, the firewall or Gatekeeper off |
| Peripherals | Bluetooth batteries | a device under 20 % |

The actions on the rings are the few the collector accepts: start or restart a
container, restart a Homebrew service, start a Time Machine backup. Everything
else is "Got it".

## Files

- `collector/collector.mjs`: the collector. Node.js 22+, no dependencies. It
  reads the machine every few seconds (`--interval 3`) with the system's own
  tools (`vm_stat`, `df`, `pmset`, `ioreg`, `netstat`, `ping`, `arp`,
  `system_profiler`, `docker`, `brew`, `tmutil`, `softwareupdate`…; `/proc`
  and `/sys` on Linux), keeps a day of each thing in `~/.pulse/homelab/`, and
  serves:
  - `GET /` the snapshot: `{ host, at, interval, things: { id: { name, state, unit, attrs, changed } } }`;
  - `GET /history?ids=a,b&hours=24` rows of (state, when) for the day rings;
  - `POST /act { kind, name }` one of `docker.start`, `docker.stop`,
    `docker.restart`, `service.restart`, `backup.start`.

  `--once` prints one snapshot and exits (handy to see what your machine
  reports). It listens on `127.0.0.1` only; `--host 0.0.0.0 --token <secret>`
  opens it to the LAN, and the app sends the token (`?token=` or the connect
  panel). Temperatures on a Mac need a helper (`smctemp` or `osx-cpu-temp`,
  from Homebrew); without one, the thermal channel shows the CPU speed limit
  macOS reports (`pmset -g therm`).
- `source.ts`: `MachineSource`, the little the UI needs from a machine, and
  `CollectorSource` over HTTP. `demo/source.ts`: the demo machine.
- `model.ts`: the systems and channels, a function of the things.
- `host.ts`: the source as the board's `PulseHost`.
- `main.ts`: the shell: the connect panel, the status line, `?collector=`,
  `?token=`, `?demo`, and the board's own `?systems=…&mode=…&start=…`.

## Thing ids

`cpu.load`, `cpu.thermal`, `cpu.temperature`, `mem.used`, `mem.pressure`,
`mem.swap`, `proc.top`, `disk.<volume>`, `backup.timemachine`,
`net.internet`, `net.wifi`, `net.throughput`, `net.lan`, `battery.level`,
`power.source`, `host.uptime`, `docker.<name>`, `service.<name>`,
`update.os`, `update.brew`, `security.filevault`, `security.firewall`,
`security.gatekeeper`, `bt.<device>`. A thing the machine does not have is
not in the snapshot, and its channel does not appear.
