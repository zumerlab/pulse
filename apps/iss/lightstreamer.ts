// A small Lightstreamer client over WebSocket (TLCP 2.5): open a session on an
// adapter set, subscribe a list of items in MERGE mode, receive their updates.
// Only what a browser needs to listen to a public feed, NASA's ISS telemetry:
// no commands, no polling fallback, no dependency. The server answers the
// session over the same socket; an update carries only the fields that
// changed, so the client keeps the last values of every item.

export type LsOptions = { url: string; adapterSet: string; items: string[]; fields: string[] };
export type LsHandlers = { onUpdate: (item: string, values: Record<string, string | null>) => void; onOpen?: () => void; onClose?: (why: string) => void };

// The client id the server expects of a web client (the public one its own library sends).
const CID = 'mgQkwtwdysogQz2BJ4Ji%20kOj2Bg';
const q = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// One field of an update as TLCP writes it: '' unchanged, '#' null, '$' empty, else percent-encoded.
export function decodeField(raw: string, was: string | null): string | null {
  if (raw === '') return was;
  if (raw === '#') return null;
  if (raw === '$') return '';
  return decodeURIComponent(raw);
}
// The values of an update line's fields ("v1|v2|^3|v6": '^n' skips n unchanged ones) over the item's last values.
export function decodeUpdate(body: string, was: (string | null)[], count: number): (string | null)[] {
  const out: (string | null)[] = [];
  for (const raw of body.split('|')) {
    const skip = /^\^(\d+)$/.exec(raw);
    if (skip) { for (let k = 0; k < Number(skip[1]); k++) out.push(was[out.length] ?? null); continue; }
    out.push(decodeField(raw, was[out.length] ?? null));
  }
  while (out.length < count) out.push(was[out.length] ?? null);
  return out.slice(0, count);
}

export class LightstreamerClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private last = new Map<number, (string | null)[]>();
  private o: LsOptions;
  private h: LsHandlers;

  constructor(o: LsOptions, h: LsHandlers) { this.o = o; this.h = h; }

  open() {
    this.closed = false;
    this.last.clear();
    const ws = new WebSocket(`${this.o.url.replace(/^http/, 'ws').replace(/\/+$/, '')}/lightstreamer`, 'TLCP-2.5.0.lightstreamer.com');
    this.ws = ws;
    ws.onopen = () => {
      ws.send('wsok');
      ws.send(`create_session\r\nLS_cid=${CID}&${q({ LS_adapter_set: this.o.adapterSet, LS_send_sync: 'false', LS_cause: 'api' })}`);
    };
    ws.onmessage = (e) => { for (const line of String(e.data).split('\r\n')) if (line) this.line(ws, line); };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.closed) this.h.onClose?.(e.reason || `closed (${e.code})`);
    };
  }

  close() {
    this.closed = true;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private line(ws: WebSocket, line: string) {
    const [tag] = line.split(',', 1);
    if (tag === 'CONOK') {
      ws.send(`control\r\n${q({ LS_reqId: '1', LS_op: 'add', LS_subId: '1', LS_mode: 'MERGE', LS_group: this.o.items.join(' '), LS_schema: this.o.fields.join(' '), LS_snapshot: 'true', LS_requested_max_frequency: 'unlimited', LS_ack: 'false' })}`);
      return;
    }
    if (tag === 'SUBOK') { this.h.onOpen?.(); return; }
    if (tag === 'U') {
      // U,<sub>,<item>,<fields>: the fields may hold commas of their own, percent-encoded or not.
      const a = line.indexOf(','), b = line.indexOf(',', a + 1), c = line.indexOf(',', b + 1);
      const item = Number(line.slice(b + 1, c)), name = this.o.items[item - 1];
      if (!name) return;
      const values = decodeUpdate(line.slice(c + 1), this.last.get(item) ?? [], this.o.fields.length);
      this.last.set(item, values);
      this.h.onUpdate(name, Object.fromEntries(this.o.fields.map((f, i) => [f, values[i]])));
      return;
    }
    // The session refused or ended: the socket closes and the source tries again.
    if (tag === 'CONERR' || tag === 'END' || tag === 'REQERR' || tag === 'ERROR') { this.h.onClose?.(line); this.close(); this.closed = false; }
  }
}
