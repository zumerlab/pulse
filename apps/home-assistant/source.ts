// What the UI needs from Home Assistant, and the WebSocket implementation of
// it. The object (@zumer/pulse) never sees this: `model.ts` turns a source's
// states into readings. A second implementation over the `hass` object a
// custom card receives would let the same app run inside a dashboard.

import {
  Auth, ERR_CANNOT_CONNECT, ERR_HASS_HOST_REQUIRED, ERR_INVALID_AUTH, ERR_INVALID_AUTH_CALLBACK,
  ERR_INVALID_HTTPS_TO_HTTP, callService, createConnection, createLongLivedTokenAuth, getAuth,
  subscribeConfig, subscribeEntities, type AuthData, type Connection, type HassEntity,
} from 'home-assistant-js-websocket';
import { t } from './strings.ts';

export type HassState = HassEntity;
export type States = Map<string, HassState>;
export type Call = { domain: string; service: string; data: Record<string, unknown> };
// signed-out: no credentials; the login is shown. The rest follow the socket.
export type Status = 'signed-out' | 'connecting' | 'live' | 'offline' | 'error';

export interface PulseSource {
  readonly states: States;
  readonly status: Status;
  readonly error: string;        // why, when status is 'error'
  readonly version: string;      // Home Assistant's version
  readonly unit: string;         // temperature unit of the installation
  onChange(fn: (changed: HassState[]) => void): () => void;
  onStatus(fn: () => void): () => void;
  call(c: Call): Promise<unknown>;
  // Resolves an entity's relative URL (a camera image) against the source.
  url(path: string): string;
}

const TOKENS = 'pulse-ha-auth';
const LAST_URL = 'pulse-ha-url';

const loadTokens = async (): Promise<AuthData | null> => {
  try { return JSON.parse(localStorage.getItem(TOKENS) ?? 'null') as AuthData | null; } catch { return null; }
};
const saveTokens = (data: AuthData | null) => {
  try {
    if (data) localStorage.setItem(TOKENS, JSON.stringify(data));
    else localStorage.removeItem(TOKENS);
  } catch { /* no storage: the session lasts while the page does */ }
};

export const lastUrl = () => {
  try { return localStorage.getItem(LAST_URL) ?? ''; } catch { return ''; }
};
const trimUrl = (u: string) => u.trim().replace(/\/+$/, '');

function reason(error: unknown) {
  switch (error) {
    case ERR_CANNOT_CONNECT: return t.errCannotConnect;
    case ERR_INVALID_AUTH: return t.errInvalidAuth;
    case ERR_HASS_HOST_REQUIRED: return t.errHostRequired;
    case ERR_INVALID_HTTPS_TO_HTTP: return t.errHttpsToHttp;
    case ERR_INVALID_AUTH_CALLBACK: return t.errAuthCallback;
    default: return error instanceof Error ? error.message : String(error);
  }
}

// Home Assistant over its WebSocket, signed in with its own OAuth flow (the
// user signs in on Home Assistant's page and comes back with a code) or with
// a long-lived access token. Tokens stay in the browser; no server in between.
export class WebSocketSource implements PulseSource {
  readonly states: States = new Map();
  status: Status = 'connecting';
  error = '';
  version = '';
  unit = '°';
  private auth: Auth | null = null;
  private conn: Connection | null = null;
  private listeners = new Set<(changed: HassState[]) => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  url(path: string) { return /^https?:/.test(path) ? path : `${this.auth?.data.hassUrl ?? ''}${path}`; }
  get hassUrl() { return this.auth?.data.hassUrl ?? ''; }

  private setStatus(status: Status, error = '') {
    this.status = status;
    this.error = error;
    this.statusListeners.forEach((fn) => fn());
  }

  // Saved tokens, or the code Home Assistant sent us back with. Without
  // either, the login is shown.
  async resume() {
    this.setStatus('connecting');
    try {
      this.auth = await getAuth({ loadTokens, saveTokens });
    } catch (error) {
      if (error === ERR_HASS_HOST_REQUIRED) { this.setStatus('signed-out'); return; }
      this.setStatus('signed-out', reason(error));
      return;
    }
    if (location.search.includes('auth_callback=1')) history.replaceState(null, '', location.pathname);
    await this.open();
  }

  // Sends the browser to Home Assistant's login page; it comes back to this URL.
  async signIn(hassUrl: string) {
    hassUrl = trimUrl(hassUrl);
    try { localStorage.setItem(LAST_URL, hassUrl); } catch { /* only to remember */ }
    this.setStatus('connecting');
    try {
      await getAuth({ hassUrl, loadTokens: async () => null, saveTokens });
    } catch (error) {
      this.setStatus('signed-out', reason(error));
    }
  }

  async signInWithToken(hassUrl: string, token: string) {
    hassUrl = trimUrl(hassUrl);
    try { localStorage.setItem(LAST_URL, hassUrl); } catch { /* only to remember */ }
    this.auth = createLongLivedTokenAuth(hassUrl, token.trim());
    saveTokens(this.auth.data);
    await this.open();
  }

  async signOut() {
    const auth = this.auth;
    this.conn?.close();
    this.conn = null;
    this.auth = null;
    this.states.clear();
    saveTokens(null);
    if (auth?.data.refresh_token) { try { await auth.revoke(); } catch { /* already gone */ } }
    this.setStatus('signed-out');
  }

  private async open() {
    if (!this.auth) return;
    this.setStatus('connecting');
    let conn: Connection;
    try {
      conn = await createConnection({ auth: this.auth });
    } catch (error) {
      if (error === ERR_INVALID_AUTH) { saveTokens(null); this.auth = null; this.setStatus('signed-out', t.errInvalidAuth); return; }
      this.setStatus('error', reason(error));
      return;
    }
    this.conn = conn;
    this.version = conn.haVersion;
    conn.addEventListener('ready', () => { this.version = conn.haVersion; this.setStatus('live'); });
    conn.addEventListener('disconnected', () => this.setStatus('offline'));
    conn.addEventListener('reconnect-error', (_c, error) => {
      if (error === ERR_INVALID_AUTH) void this.signOut();
      else this.setStatus('error', reason(error));
    });
    subscribeConfig(conn, (config) => { this.unit = config.unit_system?.temperature ?? '°'; });
    // One subscription gives the initial states and compressed diffs after.
    let first = true;
    subscribeEntities(conn, (entities) => {
      const changed: HassState[] = [];
      for (const [id, e] of Object.entries(entities)) {
        if (this.states.get(id) !== e) { this.states.set(id, e); changed.push(e); }
      }
      for (const id of [...this.states.keys()]) if (!(id in entities)) this.states.delete(id);
      if (first) { first = false; this.setStatus('live'); }
      this.listeners.forEach((fn) => fn(changed));
    });
  }

  call({ domain, service, data }: Call) {
    if (!this.conn) return Promise.reject(new Error(t.errNoConnection));
    const { entity_id, ...rest } = data;
    return callService(this.conn, domain, service, rest, entity_id ? { entity_id: entity_id as string | string[] } : undefined);
  }
}
