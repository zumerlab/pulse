// PulseSource over the `hass` object a custom card receives: Home Assistant
// already holds the connection and pushes a new `hass` on every change.
import { changesOf, hourly, type HistoryRow } from '@zumer/pulse';
import { cameraStream, dailyBack, dailyOf, daysBack, emptyRegistry, monthStart, type Call, type StatRow, type HassState, type Issue, type PulseSource, type Registry, type States, type Status } from '../source.ts';
import { t } from '../strings.ts';
import type { HomeAssistant } from './hass.ts';

export class HassSource implements PulseSource {
  readonly states: States = new Map();
  registry: Registry = emptyRegistry();
  status: Status = 'connecting';
  error = '';
  version = '';
  unit = '°';
  language?: string;
  private hass: HomeAssistant | null = null;
  private seen: { areas?: unknown; devices?: unknown; entities?: unknown; floors?: unknown } = {};
  private issues: Issue[] = [];
  private issuesFrom: unknown = null;
  private listeners = new Set<(changed: HassState[]) => void>();
  private registryListeners = new Set<() => void>();
  private statusListeners = new Set<() => void>();

  onChange(fn: (changed: HassState[]) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onRegistry(fn: () => void) { this.registryListeners.add(fn); return () => this.registryListeners.delete(fn); }
  onStatus(fn: () => void) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  url(path: string) { return /^https?:/.test(path) ? path : this.hass ? this.hass.hassUrl(path) : path; }
  // The frontend's words for a state, in the user's language.
  stateText(e: HassState) { try { return this.hass?.formatEntityState?.(e) || undefined; } catch { return undefined; } }

  // Each `hass` carries the whole state; the frontend keeps the objects of the
  // entities that did not change, so a diff by reference finds the changed ones.
  setHass(hass: HomeAssistant) {
    this.hass = hass;
    this.version = hass.config?.version ?? '';
    this.unit = hass.config?.unit_system?.temperature ?? '°';
    const language = hass.locale?.language ?? hass.language ?? hass.config?.language;
    const languageChanged = language !== this.language;
    this.language = language;
    const changed: HassState[] = [];
    for (const [id, e] of Object.entries(hass.states)) {
      if (this.states.get(id) !== e) { this.states.set(id, e); changed.push(e); }
    }
    for (const id of [...this.states.keys()]) if (!(id in hass.states)) this.states.delete(id);
    const status: Status = hass.connected === false ? 'offline' : 'live';
    if (status !== this.status || languageChanged) {
      this.status = status;
      this.statusListeners.forEach((fn) => fn());
    }
    if (changed.length) this.listeners.forEach((fn) => fn(changed));
    this.readRegistry(hass);
  }

  // The frontend replaces `hass.areas` (and the others) with a new object when
  // a registry changes: same object, nothing to do. Repairs are not on `hass`:
  // asked once per connection, and again when their registry event fires.
  private readRegistry(hass: HomeAssistant) {
    const same = hass.areas === this.seen.areas && hass.devices === this.seen.devices && hass.entities === this.seen.entities && hass.floors === this.seen.floors;
    if (hass.connection && hass.connection !== this.issuesFrom && hass.callWS) {
      this.issuesFrom = hass.connection;
      const load = () => hass.callWS!<{ issues: Issue[] }>({ type: 'repairs/list_issues' })
        .then((r) => { this.issues = r.issues; this.build(hass); }, () => { /* no repairs integration */ });
      void load();
      void hass.connection.subscribeEvents(() => setTimeout(load, 500), 'repairs_issue_registry_updated').catch(() => { /* first load stands */ });
    }
    if (same) return;
    this.seen = { areas: hass.areas, devices: hass.devices, entities: hass.entities, floors: hass.floors };
    this.build(hass);
  }

  private build(hass: HomeAssistant) {
    this.registry = {
      areas: new Map(Object.values(hass.areas ?? {}).map((a) => [a.area_id, a])),
      devices: new Map(Object.values(hass.devices ?? {}).map((d) => [d.id, { id: d.id, name: d.name_by_user ?? d.name ?? d.id, area_id: d.area_id }])),
      entities: new Map(Object.values(hass.entities ?? {}).map((e) => [e.entity_id, {
        entity_id: e.entity_id, name: e.name, area_id: e.area_id, device_id: e.device_id, platform: e.platform,
        hidden: e.hidden || undefined, category: e.entity_category,
      }])),
      floors: new Map(Object.values(hass.floors ?? {}).map((f) => [f.floor_id, f])),
      issues: this.issues,
    };
    this.registryListeners.forEach((fn) => fn());
  }

  call({ domain, service, data }: Call) {
    if (!this.hass) return Promise.reject(new Error(t.errNoConnection));
    const { entity_id, ...rest } = data;
    return this.hass.callService(domain, service, rest, entity_id ? { entity_id: entity_id as string | string[] } : undefined);
  }

  stream(entity: string) {
    const path = cameraStream(this.states.get(entity));
    return path ? this.url(path) : undefined;
  }

  async history(entity: string, hours: number) {
    if (!this.hass?.callWS) throw new Error(t.errNoConnection);
    const now = Date.now();
    const rows = await this.hass.callWS<Record<string, HistoryRow[]>>({
      type: 'history/history_during_period', entity_ids: [entity], minimal_response: true, no_attributes: true,
      start_time: new Date(now - hours * 3600_000).toISOString(), end_time: new Date(now).toISOString(),
    });
    return hourly(rows[entity] ?? [], hours, now);
  }

  async changes(entities: string[], hours: number) {
    if (!this.hass?.callWS) throw new Error(t.errNoConnection);
    const now = Date.now();
    const rows = await this.hass.callWS<Record<string, HistoryRow[]>>({
      type: 'history/history_during_period', entity_ids: entities, minimal_response: true, no_attributes: true,
      start_time: new Date(now - hours * 3600_000).toISOString(), end_time: new Date(now).toISOString(),
    });
    return Object.fromEntries(entities.map((e) => [e, changesOf(rows[e] ?? [], hours, now)]));
  }

  async statistics(entity: string, days?: number) {
    if (!this.hass?.callWS) throw new Error(t.errNoConnection);
    const rows = await this.hass.callWS<Record<string, StatRow[]>>({
      type: 'recorder/statistics_during_period', statistic_ids: [entity], period: 'day', types: ['change'],
      start_time: (days ? daysBack(days) : monthStart()).toISOString(), end_time: new Date().toISOString(),
    });
    return days ? dailyBack(rows[entity] ?? [], days) : dailyOf(rows[entity] ?? []);
  }
}
