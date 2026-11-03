// A small MQTT 3.1.1 client over WebSocket: connect, subscribe, receive. Only
// what a browser needs to listen to a public feed: QoS 0 subscriptions, a
// ping every half minute, PUBACK for the odd QoS 1 publish. No dependency,
// no polyfill: a few bytes of framing over the browser's own WebSocket.

export type MqttMessage = { topic: string; payload: Uint8Array };
export type MqttOptions = { url: string; topics: string[]; username?: string; password?: string; keepalive?: number; clientId?: string };
export type MqttHandlers = { onMessage: (m: MqttMessage) => void; onOpen?: () => void; onClose?: (why: string) => void };

const enc = new TextEncoder(), dec = new TextDecoder();
const str = (s: string) => { const b = enc.encode(s); return [b.length >> 8, b.length & 0xff, ...b]; };
const varint = (n: number) => { const out: number[] = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 0x80; out.push(d); } while (n > 0); return out; };
const packet = (type: number, body: number[]) => new Uint8Array([type, ...varint(body.length), ...body]);

export class MqttClient {
  private ws: WebSocket | null = null;
  private buf = new Uint8Array(0);
  private ping = 0;
  private nextId = 1;
  private closed = false;
  private o: MqttOptions;
  private h: MqttHandlers;

  constructor(o: MqttOptions, h: MqttHandlers) { this.o = o; this.h = h; }

  open() {
    this.closed = false;
    const ws = new WebSocket(this.o.url, 'mqtt');
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      const keepalive = this.o.keepalive ?? 60;
      const flags = 0x02 | (this.o.username ? 0x80 : 0) | (this.o.password ? 0x40 : 0);
      const body = [...str('MQTT'), 4, flags, keepalive >> 8, keepalive & 0xff, ...str(this.o.clientId ?? `pulse-${Math.random().toString(36).slice(2, 10)}`)];
      if (this.o.username) body.push(...str(this.o.username));
      if (this.o.password) body.push(...str(this.o.password));
      ws.send(packet(0x10, body));
      this.ping = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xc0, 0])); }, Math.max(5, keepalive / 2) * 1000);
    };
    ws.onmessage = (e) => this.feed(new Uint8Array(e.data as ArrayBuffer));
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = (e) => {
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.closed) this.h.onClose?.(e.reason || `closed (${e.code})`);
    };
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xe0, 0]));
    ws?.close();
  }

  // A WebSocket frame may hold several packets or part of one: bytes are kept until a whole packet is in.
  private feed(chunk: Uint8Array) {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf); joined.set(chunk, this.buf.length);
    this.buf = joined;
    for (;;) {
      if (this.buf.length < 2) return;
      let len = 0, mult = 1, i = 1;
      for (;;) {
        if (i >= this.buf.length) return;
        const d = this.buf[i++];
        len += (d & 0x7f) * mult; mult *= 128;
        if (!(d & 0x80)) break;
        if (i > 4) { this.h.onClose?.('bad length'); this.close(); return; }
      }
      if (this.buf.length < i + len) return;
      this.handle(this.buf[0], this.buf.subarray(i, i + len));
      this.buf = this.buf.slice(i + len);
    }
  }

  private handle(head: number, body: Uint8Array) {
    const type = head >> 4;
    if (type === 2) {                                       // CONNACK
      if (body[1] !== 0) { this.h.onClose?.(`refused (${body[1]})`); this.close(); return; }
      const subs = this.o.topics.flatMap((tp) => [...str(tp), 0]);
      const id = this.nextId++;
      this.ws?.send(packet(0x82, [id >> 8, id & 0xff, ...subs]));
      this.h.onOpen?.();
    } else if (type === 3) {                                // PUBLISH
      const qos = (head >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = dec.decode(body.subarray(2, 2 + tlen));
      let at = 2 + tlen;
      if (qos > 0) { const id = (body[at] << 8) | body[at + 1]; at += 2; this.ws?.send(new Uint8Array([0x40, 2, id >> 8, id & 0xff])); }
      this.h.onMessage({ topic, payload: body.subarray(at) });
    }
    // SUBACK and PINGRESP need no answer.
  }
}

export const text = (payload: Uint8Array) => dec.decode(payload);
