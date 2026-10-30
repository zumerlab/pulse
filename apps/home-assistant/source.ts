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

// What Home Assistant knows about the home besides states: where each entity
// is (areas, floors, devices), which ones are hidden or diagnostic, and the
// repairs it raised. The model reads it next to the states.
export type RegistryEntity = {
  entity_id: string; name?: string; area_id?: string; device_id?: string; platform?: string;
  hidden?: boolean; category?: 'config' | 'diagnostic';
};
export type RegistryArea = { area_id: string; name: string; floor_id?: string | null; icon?: string | null };
export type RegistryDevice = { id: string; name: string; area_id?: string | null };
export type RegistryFloor = { floor_id: string; name: string; level?: number | null };
export type Issue = {
  issue_id: string; domain: string; severity: 'critical' | 'error' | 'warning' | null;
  is_fixable: boolean | null; translation_key?: string | null; learn_more_url?: string | null; created: string; ignored: boolean;
};
export type Registry = {
  areas: Map<string, RegistryArea>;
  devices: Map<string, RegistryDevice>;
  entities: Map<string, RegistryEntity>;
  floors: Map<string, RegistryFloor>;
  issues: Issue[];
};
export const emptyRegistry = (): Registry => ({ areas: new Map(), devices: new Map(), entities: new Map(), floors: new Map(), issues: [] });

export interface PulseSource {
  readonly states: States;
  readonly registry: Registry;
  readonly status: Status;
  readonly error: string;        // why, when status is 'error'
  readonly version: string;      // Home Assistant's version
  readonly unit: string;         // temperature unit of the installation
  onChange(fn: (changed: HassState[]) => void): () => void;
  onRegistry(fn: () => void): () => void;
  onStatus(fn: () => void): () => void;
  call(c: Call): Promise<unknown>;
  // Resolves an entity's relative URL (a camera image) against the source.
  url(path: string): string;
}

// The lists Home Assistant serves over the WebSocket, as the registry. None of
// them needs an admin user. `repairs/list_issues` fails when the repairs
// integration is not loaded (a minimal setup): no issues then.
type AreaRow = { area_id: string; name: string; floor_id: string | null; icon: string | null };
type DeviceRow = { id: string; name: string | null; name_by_user: string | null; area_id: string | null };
type EntityRow = {
  entity_id: string; name: string | null; area_id: string | null; device_id: string | null; platform: string;
  hidden_by: string | null; entity_category: 'config' | 'diagnostic' | null;
};
type FloorRow = { floor_id: string; name: string; level: number | null };
export async function fetchRegistry(conn: Connection): Promise<Registry> {
  const [areas, devices, entities, floors, issues] = await Promise.all([
    conn.sendMessagePromise<AreaRow[]>({ type: 'config/area_registry/list' }),
    conn.sendMessagePromise<DeviceRow[]>({ type: 'config/device_registry/list' }),
    conn.sendMessagePromise<EntityRow[]>({ type: 'config/entity_registry/list' }),
    conn.sendMessagePromise<FloorRow[]>({ type: 'config/floor_registry/list' }).catch(() => [] as FloorRow[]),
    conn.sendMessagePromise<{ issues: Issue[] }>({ type: 'repairs/list_issues' }).then((r) => r.issues, () => [] as Issue[]),
  ]);
  return {
    areas: new Map(areas.map((a) => [a.area_id, a])),
    devices: new Map(devices.map((d) => [d.id, { id: d.id, name: d.name_by_user ?? d.name ?? d.id, area_id: d.area_id }])),
    entities: new Map(entities.map((e) => [e.entity_id, {
      entity_id: e.entity_id, name: e.name ?? undefined, area_id: e.area_id ?? undefined, device_id: e.device_id ?? undefined,
      platform: e.platform, hidden: e.hidden_by != null || undefined, category: e.entity_category ?? undefined,
    }])),
    floors: new Map(floors.map((f) => [f.floor_id, f])),
    issues,
  };
}
// The events that mean a list changed.
export const REGISTRY_EVENTS = ['area_registry_updated', 'device_registry_updated', 'entity_registry_updated', 'floor_registry_updated', 'repairs_issue_registry_updated'];

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
  registry: Registry = emptyRegistry();
  status: Status = 'connecting';
  error = '';
  version = '';
  unit = '°';
  private auth: Auth | null = null;
  private conn: Connection | null = null;
  private listeners = new Set<(changed: HassState[]) => void>();
  private registryListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();
  private registryTimer = 0;

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onRegistry(fn: () => void) { this.registryListeners.add(fn); return () => this.registryListeners.delete(fn); }
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
    this.registry = emptyRegistry();
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
    // The registries once, and again (a moment after) whenever one changes.
    const loadRegistry = () => fetchRegistry(conn).then((registry) => {
      if (this.conn !== conn) return;
      this.registry = registry;
      this.registryListeners.forEach((fn) => fn());
    }, () => { /* no registries: the model works from the states alone */ });
    void loadRegistry();
    for (const event of REGISTRY_EVENTS) {
      void conn.subscribeEvents(() => {
        clearTimeout(this.registryTimer);
        this.registryTimer = window.setTimeout(loadRegistry, 500);
      }, event).catch(() => { /* not available: the first load stands */ });
    }
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
