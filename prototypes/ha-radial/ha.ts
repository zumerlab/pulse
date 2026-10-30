// Minimal client for Home Assistant's WebSocket API: login with the token the
// local server hands out, initial states, live changes and services. One socket
// does everything: readings are pushed and calls use the same channel, with no
// REST polling.

export type HassState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & { friendly_name?: string };
  last_changed: string;
  last_updated: string;
};
export type States = Map<string, HassState>;
export type Call = { domain: string; service: string; data: Record<string, unknown> };
export type Status = 'connecting' | 'live' | 'offline' | 'error';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class HomeAssistant {
  readonly states: States = new Map();
  status: Status = 'connecting';
  error = '';
  version = '';
  unit = '°';       // temperature unit of the installation (°C or °F)
  private ws: WebSocket | null = null;
  private id = 1;
  private pending = new Map<number, Pending>();
  private retry = 1000;
  private listeners = new Set<(changed: HassState[]) => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }

  private setStatus(status: Status, error = '') {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }

  async connect() {
    this.setStatus('connecting');
    let token: string;
    try {
      const response = await fetch('/api/ha/session', { cache: 'no-store' });
      const body = await response.json() as { accessToken?: string; error?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.error ?? 'No session.');
      token = body.accessToken;
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : String(error));
      this.reconnect();
      return;
    }
    const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/api/ha/websocket`);
    this.ws = ws;
    ws.addEventListener('message', (e) => this.receive(JSON.parse(String(e.data)), token));
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const p of this.pending.values()) p.reject(new Error('The connection dropped.'));
      this.pending.clear();
      this.setStatus('offline');
      this.reconnect();
    });
  }

  private reconnect() {
    setTimeout(() => { void this.connect(); }, this.retry);
    this.retry = Math.min(this.retry * 2, 15_000);
  }

  private send(msg: Record<string, unknown>) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('No connection to Home Assistant.'));
    const id = this.id++;
    ws.send(JSON.stringify({ id, ...msg }));
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error('Home Assistant did not answer.'));
      }, 10_000);
    });
  }

  private async receive(msg: Record<string, unknown>, token: string) {
    switch (msg.type) {
      case 'auth_required':
        this.version = String(msg.ha_version ?? '');
        this.ws?.send(JSON.stringify({ type: 'auth', access_token: token }));
        return;
      case 'auth_invalid':
        this.setStatus('error', String(msg.message ?? 'Invalid token.'));
        this.ws?.close();
        return;
      case 'auth_ok': {
        this.retry = 1000;
        // Subscribe before asking for the states: a change in between is not lost.
        const sub = this.send({ type: 'subscribe_events', event_type: 'state_changed' });
        const config = this.send({ type: 'get_config' }) as Promise<{ unit_system?: { temperature?: string } }>;
        const all = await this.send({ type: 'get_states' }) as HassState[];
        await sub;
        this.unit = (await config).unit_system?.temperature ?? '°';
        this.states.clear();
        for (const s of all) this.states.set(s.entity_id, s);
        this.setStatus('live');
        this.listeners.forEach((fn) => fn(all));
        return;
      }
      case 'result': {
        const p = this.pending.get(Number(msg.id));
        if (!p) return;
        this.pending.delete(Number(msg.id));
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(String((msg.error as { message?: string })?.message ?? 'The service failed.')));
        return;
      }
      case 'event': {
        const data = (msg.event as { data: { entity_id: string; new_state: HassState | null } }).data;
        if (data.new_state) this.states.set(data.entity_id, data.new_state);
        else this.states.delete(data.entity_id);
        if (data.new_state) this.listeners.forEach((fn) => fn([data.new_state!]));
        return;
      }
    }
  }

  call({ domain, service, data }: Call) {
    const { entity_id, ...rest } = data;
    return this.send({
      type: 'call_service', domain, service,
      ...(entity_id ? { target: { entity_id } } : {}),
      service_data: rest,
    });
  }
}
