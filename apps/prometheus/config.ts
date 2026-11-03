// The fleet as configuration: which systems, and for each channel the PromQL
// that returns one value per host, how to read it and when it calls. The
// same channel is read two ways: on the systems axis as a swarm (a tick per
// host, the ones over the line painted), on the groups axis as the host's
// own band. The default is a fleet of node_exporter hosts; `?config=` loads
// a JSON of the same shape for anything else Prometheus scrapes.

export type Unit = 'ratio' | 'percent' | 'number' | 'bytes' | 'bytes/s' | 'seconds';
export type ChannelConfig = {
  key: string;
  name: string;
  glyph?: string;                 // an SVG path (24×24); one of the built-in names when it starts with a letter and has no spaces
  query: string;                  // PromQL: a vector with one sample per host, labelled `by`
  by?: string;                    // the label that names the host (default: instance)
  unit?: Unit;                    // how the value reads (default: ratio, as a percentage)
  max?: number;                   // the full band, in the value's units (default: 1 for a ratio)
  what?: string;                  // the words of the alert ("CPU usage")
  warn?: number;                  // over this (or under, with `below`), the host calls softly
  crit?: number;                  // and loudly
  below?: boolean;
  history?: boolean;              // worth a day in the detail (query_range, one point an hour)
};
export type SystemConfig = { id: string; title: string; channels: ChannelConfig[] };
export type FleetConfig = { systems: SystemConfig[]; every?: number };

export const NODE_EXPORTER: FleetConfig = {
  every: 15,
  systems: [
    { id: 'cpu', title: 'CPU', channels: [
      { key: 'usage', name: 'Usage', glyph: 'chip', query: '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))', what: 'CPU usage', warn: 0.8, crit: 0.95, history: true },
      { key: 'load', name: 'Load', glyph: 'gauge', query: 'node_load1 / count by (instance) (node_cpu_seconds_total{mode="idle"})', unit: 'number', max: 2, what: 'load per core', warn: 1, crit: 2, history: true },
      { key: 'steal', name: 'Steal', glyph: 'clock', query: 'avg by (instance) (rate(node_cpu_seconds_total{mode="steal"}[5m]))', what: 'CPU steal', warn: 0.1, crit: 0.3 },
    ] },
    { id: 'memory', title: 'Memory', channels: [
      { key: 'used', name: 'Used', glyph: 'memory', query: '1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes', what: 'memory used', warn: 0.85, crit: 0.95, history: true },
      { key: 'swap', name: 'Swap', glyph: 'swap', query: '1 - node_memory_SwapFree_bytes / clamp_min(node_memory_SwapTotal_bytes, 1)', what: 'swap used', warn: 0.5, crit: 0.9 },
    ] },
    { id: 'disk', title: 'Disk', channels: [
      { key: 'root', name: 'Root', glyph: 'disk', query: '1 - node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}', what: 'root filesystem', warn: 0.85, crit: 0.95, history: true },
      { key: 'io', name: 'I/O', glyph: 'drive', query: 'rate(node_disk_io_time_seconds_total[5m])', what: 'disk busy', warn: 0.8, crit: 0.95 },
    ] },
    { id: 'network', title: 'Network', channels: [
      { key: 'rx', name: 'Receive', glyph: 'down', query: 'sum by (instance) (rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*"}[5m]))', unit: 'bytes/s', max: 125e6, history: true },
      { key: 'tx', name: 'Transmit', glyph: 'up', query: 'sum by (instance) (rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*"}[5m]))', unit: 'bytes/s', max: 125e6 },
      { key: 'errors', name: 'Errors', glyph: 'alert', query: 'sum by (instance) (rate(node_network_receive_errs_total[5m]) + rate(node_network_transmit_errs_total[5m]))', unit: 'number', max: 10, what: 'network errors', warn: 0.1, crit: 1 },
    ] },
  ],
};

// A few glyphs by name, so a configuration need not carry SVG.
export const GLYPHS: Record<string, string> = {
  chip: 'M9 3v3 M15 3v3 M9 18v3 M15 18v3 M3 9h3 M3 15h3 M18 9h3 M18 15h3 M6 6h12v12H6z M9 9h6v6H9z',
  gauge: 'M12 3a9 9 0 0 0-9 9c0 2.5 1 4.7 2.6 6.4h12.8A9 9 0 0 0 12 3z M12 12l4-5 M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 3',
  memory: 'M3 8h18v8H3z M7 8v8 M11 8v8 M15 8v8 M6 16v2 M10 16v2 M14 16v2 M18 16v2',
  swap: 'M7 7h10l-3-3 M17 7l-3 3 M17 17H7l3 3 M7 17l3-3',
  disk: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 3v4 M12 17v4',
  drive: 'M4 6h16v12H4z M4 14h16 M8 17h.01 M16 17h.01',
  down: 'M12 3v14 M12 17l-5-5 M12 17l5-5 M4 21h16',
  up: 'M12 21V7 M12 7l-5 5 M12 7l5 5 M4 3h16',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 3v3 M12 18v3 M3 12h3 M18 12h3',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
};
export const glyphOf = (g?: string) => (g && GLYPHS[g]) || (g && g.includes(' ') ? g : GLYPHS.server);
