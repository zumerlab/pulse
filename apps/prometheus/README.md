# Pulse Prometheus

A fleet of hosts as Pulse objects, read from Prometheus with PromQL. The
browser queries Prometheus directly (it allows any origin by default, the
`--web.cors.origin` flag) and, when an Alertmanager is named, reads its
alerts and silences them from the ring.

The fleet is configuration: which systems, and for each channel the PromQL
that returns one value per host, how it reads and when it calls. The same
channel is read two ways:

| Axis | Objects | Channels |
|---|---|---|
| Systems (the fleet by dimension) | Targets, CPU, Memory, Disk, Network, Alerts | A swarm per channel: a tick per host, the ones over the line painted; the targets down; the alerts firing, the silenced ones dim |
| Groups (one object per host, the jobs as the gear's groups) | web-01, api-03, … | The same channels as bands with a day ring in the detail, the host's target, its alerts |

The default configuration is a fleet of node_exporter hosts: CPU (usage,
load per core, steal), memory (used, swap), disk (root, I/O), network
(receive, transmit, errors). `?config=url` loads a JSON of the same shape
(`config.ts`, `FleetConfig`) for anything else Prometheus scrapes: a channel
is `{ key, name, glyph, query, by, unit, max, what, warn, crit, below, history }`.

Alerts: a host over a channel's `warn` calls softly, over `crit` loudly; a
target down calls softly, three down loudly; a firing alert calls by its
`severity` label (warning softly, critical loudly). With an Alertmanager, the
alert's action is **Silence for an hour**: a silence on `alertname` and
`instance`, posted to `/api/v2/silences`; the ring beats until Alertmanager
reports it suppressed. Without one, Prometheus's own alerts are read and
marked seen.

## Run locally

From the repository root, with Node.js 22.18+ or 24+ and npm:

```sh
npm ci
npm run dev:prometheus
```

Open [the app](http://127.0.0.1:5179). The connect panel asks for the
server: `http://localhost:9090` on your own, or Prometheus's public demo
(the default). To explore without a server, open
[the recorded hosts](http://127.0.0.1:5179/?demo): twenty-four on five jobs,
two targets down, a disk nearly full, a hot CPU, three alerts firing.

## Options

| Parameter | What it does |
|---|---|
| `?server=http://host:9090&alertmanager=http://host:9093` | Which Prometheus, and the Alertmanager to silence on |
| `?config=https://…/fleet.json` | Systems and channels of your own instead of node_exporter's |
| `?axis=groups` | Open on the hosts, one object each |
| `?systems=cpu,alerts&mode=list&start=alerts` | What the page shows; the gear chooses within it |
| `?demo` | The recorded hosts instead of a server |

## The API

`GET /api/v1/query` for every channel on one clock (`every` seconds in the
configuration, 15 by default), `GET /api/v1/targets?state=active`,
`GET /api/v1/alerts` or Alertmanager's `GET /api/v2/alerts?active=true`,
`GET /api/v1/query_range` with an hour's step for the day ring,
`POST /api/v2/silences` for the action. Prometheus sends
`Access-Control-Allow-Origin: *` unless its `--web.cors.origin` was narrowed;
Alertmanager's CORS depends on how it is fronted.
