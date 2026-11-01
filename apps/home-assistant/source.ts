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
  // The user's language as Home Assistant knows it (a BCP 47 tag); the object
  // formats numbers and times with it. Nothing known: English.
  readonly language?: string;
  // A state in the user's words, as Home Assistant's own frontend shows it
  // ("Heat", "Armed away"); nothing: the app's English words.
  stateText?(e: HassState): string | undefined;
  onChange(fn: (changed: HassState[]) => void): () => void;
  onRegistry(fn: () => void): () => void;
  onStatus(fn: () => void): () => void;
  call(c: Call): Promise<unknown>;
  // Resolves an entity's relative URL (a camera image) against the source.
  url(path: string): string;
  // A camera's live MJPEG stream, when the source can serve one.
  stream?(entity: string): string | undefined;
  // A numeric entity's last `hours` hours as one value per hour, oldest
  // first, the current hour last; null where nothing is known.
  history?(entity: string, hours: number): Promise<(number | null)[]>;
  // The last `hours` hours of these entities as the moments their state
  // changed (see Change), one list per entity.
  changes?(entities: string[], hours: number): Promise<Record<string, Change[]>>;
  // A total-increasing entity (energy, kWh) as one value per day of this
  // month, the first day first, up to today; null where nothing is known.
  // With `days`, the last `days` days instead, the oldest first, today last.
  statistics?(entity: string, days?: number): Promise<(number | null)[]>;
}

// What `recorder/statistics_during_period` returns per entity with period
// 'day': one row per day, `start` in ms and the day's `change`.
export type StatRow = { start: number; change?: number | null };
// The days of this month from the recorder's rows: a value where a day has one.
export function dailyOf(rows: StatRow[], now = new Date()): (number | null)[] {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const out: (number | null)[] = Array.from({ length: days }, () => null);
  for (const r of rows) {
    const d = new Date(r.start);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && r.change != null) out[d.getDate() - 1] = Math.round(r.change * 100) / 100;
  }
  return out;
}
export const monthStart = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), 1);
// The last `days` days, the oldest first and today last: a value where a day has one.
export function dailyBack(rows: StatRow[], days: number, now = new Date()): (number | null)[] {
  const out: (number | null)[] = Array.from({ length: days }, () => null);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const r of rows) {
    const d = new Date(r.start), day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const ago = Math.round((today - day) / 86_400_000);
    if (ago >= 0 && ago < days && r.change != null) out[days - 1 - ago] = Math.round(r.change * 100) / 100;
  }
  return out;
}
export const daysBack = (days: number, now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);

// What `history/history_during_period` returns with minimal_response and
// no_attributes: per entity, the state and when it was last updated (seconds).
export type HistoryRow = { s: string; lu: number };
// Hourly means of a state history. A state holds until the next one, so an
// hour with no change takes the state that was current when it began.
export function hourly(rows: HistoryRow[], hours: number, now = Date.now()): (number | null)[] {
  const end = now / 1000, start = end - hours * 3600;
  const out: (number | null)[] = [];
  let i = 0, last: number | null = null;
  // The state in force at `start`: the last row before it.
  while (i < rows.length && rows[i].lu <= start) { const v = Number(rows[i].s); last = Number.isFinite(v) ? v : last; i++; }
  for (let h = 0; h < hours; h++) {
    const t0 = start + h * 3600, t1 = t0 + 3600;
    let sum = 0, weight = 0, at = t0, current = last;
    while (i < rows.length && rows[i].lu < t1) {
      const v = Number(rows[i].s);
      if (current != null) { sum += current * (rows[i].lu - at); weight += rows[i].lu - at; }
      at = rows[i].lu;
      current = Number.isFinite(v) ? v : current;
      i++;
    }
    if (current != null) { sum += current * (t1 - at); weight += t1 - at; }
    out.push(weight > 0 ? sum / weight : null);
    last = current;
  }
  return out;
}
// A state history as the moments it changed: the state in force when the
// window began (ago = hours), then each change, oldest first, `ago` in hours.
export type Change = { state: string; ago: number };
export function changesOf(rows: HistoryRow[], hours: number, now = Date.now()): Change[] {
  const end = now / 1000, start = end - hours * 3600;
  const out: Change[] = [];
  for (const r of rows) {
    if (r.lu <= start) { out.length = 0; out.push({ state: r.s, ago: hours }); }
    else out.push({ state: r.s, ago: (end - r.lu) / 3600 });
  }
  return out;
}
export const cameraStream = (e: HassState | undefined) =>
  e && e.attributes.access_token ? `/api/camera_proxy_stream/${e.entity_id}?token=${String(e.attributes.access_token)}` : undefined;

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
  language?: string;
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
    subscribeConfig(conn, (config) => {
      this.unit = config.unit_system?.temperature ?? '°';
      // The server's language, until the user's own (their profile) is known.
      if (!this.language && config.language) { this.language = config.language; this.statusListeners.forEach((fn) => fn()); }
    });
    conn.sendMessagePromise<{ value: { language?: string } | null }>({ type: 'frontend/get_user_data', key: 'language' })
      .then((data) => { if (this.conn === conn && data?.value?.language) { this.language = data.value.language; this.statusListeners.forEach((fn) => fn()); } }, () => { /* no profile data: the server's language */ });
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

  stream(entity: string) {
    const path = cameraStream(this.states.get(entity));
    return path ? this.url(path) : undefined;
  }

  async history(entity: string, hours: number) {
    if (!this.conn) throw new Error(t.errNoConnection);
    const now = Date.now();
    const rows = await this.conn.sendMessagePromise<Record<string, HistoryRow[]>>({
      type: 'history/history_during_period', entity_ids: [entity], minimal_response: true, no_attributes: true,
      start_time: new Date(now - hours * 3600_000).toISOString(), end_time: new Date(now).toISOString(),
    });
    return hourly(rows[entity] ?? [], hours, now);
  }

  async changes(entities: string[], hours: number) {
    if (!this.conn) throw new Error(t.errNoConnection);
    const now = Date.now();
    const rows = await this.conn.sendMessagePromise<Record<string, HistoryRow[]>>({
      type: 'history/history_during_period', entity_ids: entities, minimal_response: true, no_attributes: true,
      start_time: new Date(now - hours * 3600_000).toISOString(), end_time: new Date(now).toISOString(),
    });
    return Object.fromEntries(entities.map((e) => [e, changesOf(rows[e] ?? [], hours, now)]));
  }

  async statistics(entity: string, days?: number) {
    if (!this.conn) throw new Error(t.errNoConnection);
    const rows = await this.conn.sendMessagePromise<Record<string, StatRow[]>>({
      type: 'recorder/statistics_during_period', statistic_ids: [entity], period: 'day', types: ['change'],
      start_time: (days ? daysBack(days) : monthStart()).toISOString(), end_time: new Date().toISOString(),
    });
    return days ? dailyBack(rows[entity] ?? [], days) : dailyOf(rows[entity] ?? []);
  }
}
