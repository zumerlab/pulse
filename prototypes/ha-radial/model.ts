import type { Call, HassState, States } from './ha.ts';
import { listOf, num } from '../shared/i18n.ts';

// Every channel is read from Home Assistant's live state: there are no
// hand-written "ok" and "alert" states. An alert comes out of a rule over the
// data and its action is a real service call. If the entity is missing, the
// channel does not appear (another Home Assistant installation builds its own
// object).

export type Seg = { label: string; on: boolean; entity: string; act?: Call };
export type Dial = {
  min: number; max: number; step: number; unit: string; label: string;
  value: number; entity: string; set: (t: number) => Call;
};
export type Alert = {
  level: 1 | 2; big: string; label: string; why: string;
  verb: string; calls: Call[];      // without calls, the verb only marks the alert as seen
  busy?: boolean;                   // already being resolved: no button until Home Assistant confirms
  fail?: number[];                  // segments painted in the alert color
};
export type Reading = {
  kind: 'p' | 's';
  v?: number;                       // progress 0..1
  segs?: Seg[];
  dial?: Dial;
  big: string; label: string;
  alert?: Alert;
  entities: string[];               // which entities it depends on (detail and "sending")
  camera?: string;
};
export type Channel = { key: string; name: string; glyph: string; read: (s: States, u: Units) => Reading | null };
export type PulseSystem = { id: string; title: string; channels: Channel[] };
export type Units = { temp: string };

// Alarm code of the Home Assistant demo (manual, "1234").
const ALARM_CODE = '1234';

const g = {
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  plug: 'M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  flame: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-5 0-9z',
  fan: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M12 10c0-4 1-7 4-7 2 0 2 3 0 5 M14 12c4 0 7 1 7 4 0 2-3 2-5 0 M12 14c0 4-1 7-4 7-2 0-2-3 0-5 M10 12c-4 0-7-1-7-4 0-2 3-2 5 0',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  siren: 'M7 18v-6a5 5 0 0 1 10 0v6 M5 21h14v-3H5z M12 3v2 M4 7l1.5 1 M20 7l-1.5 1',
  lock: 'M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3 M12 15v2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  window: 'M4 4h16v16H4z M12 4v16 M4 12h16',
  garage: 'M3 10l9-6 9 6v10H3z M7 20v-8h10v8 M7 15h10',
  sprout: 'M12 21v-9 M12 12C12 7 8 5 4 5c0 5 3 7 8 7z M12 14c0-4 3-6 8-6 0 4-3 6-8 6z',
  play: 'M7 4l13 8-13 8z',
  volume: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  air: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7',
  tap: 'M4 10h10a4 4 0 0 1 4 4v2 M8 10V6h4v4 M6 6h8 M18 19v.01',
  box: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  robot: 'M5 12a7 7 0 0 1 14 0v4H5z M9 12h.01 M15 12h.01 M3 19h18',
};

// Short names for the demo's entities; otherwise Home Assistant's friendly name.
const short: Record<string, string> = {
  'light.bed_light': 'Bedroom', 'light.ceiling_lights': 'Ceiling', 'light.kitchen_lights': 'Kitchen',
  'light.office_rgbw_lights': 'Office', 'light.living_room_rgbww_lights': 'Living room',
  'light.entrance_color_white_lights': 'Entrance',
  'switch.decorative_lights': 'Fairy lights', 'switch.ac': 'AC',
  'lock.front_door': 'Front door', 'lock.kitchen_door': 'Kitchen door',
  'lock.poorly_installed_door': 'Poorly installed door', 'lock.openable_lock': 'Lock',
  'binary_sensor.movement_backyard': 'Backyard motion', 'binary_sensor.basement_floor_wet': 'Basement water',
  'cover.living_room_window': 'Living room window', 'cover.hall_window': 'Hall window',
  'cover.kitchen_window': 'Kitchen window', 'cover.garage_door': 'Garage door', 'cover.pergola_roof': 'Pergola',
  'valve.front_garden': 'Front garden', 'valve.back_garden': 'Back garden', 'valve.orchard': 'Orchard',
  'valve.trees': 'Trees', 'media_player.bedroom': 'Bedroom', 'media_player.kitchen': 'Kitchen',
  'media_player.living_room': 'Living room', 'media_player.lounge_room': 'TV', 'media_player.walkman': 'Walkman',
  'siren.siren': 'Siren', 'siren.siren_with_all_features': 'Siren 2',
};

export const nameOf = (s: States, id: string) => {
  const floor = /^vacuum\.demo_vacuum_(\d+)_/.exec(id)?.[1];
  return short[id] ?? (floor ? `Floor ${floor} vacuum` : s.get(id)?.attributes.friendly_name ?? id);
};
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const attr = (e: HassState, k: string) => e.attributes[k] as number | undefined;
const ofDomain = (s: States, domain: string, only?: string[]) =>
  (only ?? [...s.keys()].filter((id) => id.startsWith(`${domain}.`)).sort()).filter((id) => s.has(id));
const list = (names: string[]) => listOf(names.map((n) => n.toLowerCase()));
const call = (domain: string, service: string, entity_id: string | string[], data = {}): Call =>
  ({ domain, service, data: { entity_id, ...data } });
const busy = (state: string) => /ing$/.test(state) && state !== 'playing';
const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());

// Temperature dial of a thermostat or water heater. It shows the measurement;
// the ring is the target, which is what changes.
function thermostat(id: string, domain: 'climate' | 'water_heater', label: (e: HassState) => string,
  alert?: (s: States, e: HassState) => Alert | undefined) {
  return (s: States, u: Units): Reading | null => {
    const e = s.get(id);
    if (!e || attr(e, 'temperature') == null) return null;
    const min = attr(e, 'min_temp') ?? 7, max = attr(e, 'max_temp') ?? 35, t = attr(e, 'temperature')!;
    const cur = attr(e, 'current_temperature');
    return {
      kind: 'p', v: clamp((t - min) / (max - min)), entities: [id],
      dial: { min, max, step: attr(e, 'target_temp_step') ?? 1, unit: '°', label: 'target', value: t, entity: id,
        set: (x) => call(domain, 'set_temperature', id, { temperature: x }) },
      big: cur != null ? `${num(cur)}${u.temp}` : `${num(t)}°`, label: label(e), alert: alert?.(s, e),
    };
  };
}

const hvacAction: Record<string, string> = {
  heating: 'heating', cooling: 'cooling', idle: 'idle', off: 'off', drying: 'drying', fan: 'fan',
};
const hvacMode: Record<string, string> = {
  off: 'off', heat: 'heat', cool: 'cool', heat_cool: 'auto', auto: 'auto', dry: 'dry', fan_only: 'fan only',
};
const coverState: Record<string, string> = { open: 'open', closed: 'closed', opening: 'opening…', closing: 'closing…' };
const alarmState: Record<string, string> = {
  disarmed: 'Disarmed', armed_home: 'Home', armed_away: 'Away', armed_night: 'Night',
  armed_vacation: 'Vacation', armed_custom_bypass: 'Custom', arming: 'Arming…', pending: 'About to sound',
  triggered: 'Triggered', disarming: 'Disarming…',
};
const armed = (s: States) => /^armed_/.test(s.get('alarm_control_panel.security')?.state ?? '');
const thermoLabel = (e: HassState) =>
  `target ${num(attr(e, 'temperature')!)}° · ${hvacAction[String(e.attributes.hvac_action)] ?? hvacMode[e.state] ?? e.state}`;

// Segments of entities switched on and off with a tap.
function switches(ids: string[], s: States, isOn: (e: HassState) => boolean, act: (e: HassState) => Call | undefined): Seg[] {
  return ids.map((id) => { const e = s.get(id)!; return { label: nameOf(s, id), on: isOn(e), entity: id, act: act(e) }; });
}

const openWindows = (s: States) => ofDomain(s, 'cover')
  .filter((id) => s.get(id)!.attributes.device_class !== 'garage' && ['open', 'opening', 'closing'].includes(s.get(id)!.state)
    && id !== 'cover.pergola_roof');

function coverDial(id: string) {
  return (s: States): Reading | null => {
    const e = s.get(id);
    if (!e || attr(e, 'current_position') == null) return null;
    const p = attr(e, 'current_position')!;
    return {
      kind: 'p', v: p / 100, entities: [id],
      dial: { min: 0, max: 100, step: 10, unit: '%', label: 'open', value: p, entity: id,
        set: (x) => call('cover', 'set_cover_position', id, { position: x }) },
      big: p === 0 ? 'Closed' : `${p}%`, label: busy(e.state) ? coverState[e.state] : p === 0 ? 'all the way' : 'open',
    };
  };
}

export const systems: PulseSystem[] = [
  { id: 'lights', title: 'Lights', channels: [
    { key: 'lights', name: 'Lights', glyph: g.bulb, read: (s) => {
      const ids = ofDomain(s, 'light');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('light', 'toggle', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: `${on.length} of ${segs.length}`,
        label: on.length ? list(on.map((x) => x.label)) : 'all off' };
    } },
    { key: 'brightness', name: 'Living room brightness', glyph: g.sun, read: (s) => {
      const id = 'light.living_room_rgbww_lights', e = s.get(id);
      if (!e) return null;
      const pct = e.state === 'on' ? Math.round((attr(e, 'brightness') ?? 255) / 2.55) : 0;
      return { kind: 'p', v: pct / 100, entities: [id], big: pct ? `${pct}%` : 'Off', label: 'living room',
        dial: { min: 0, max: 100, step: 5, unit: '%', label: 'brightness', value: pct, entity: id,
          set: (x) => x ? call('light', 'turn_on', id, { brightness_pct: x }) : call('light', 'turn_off', id) } };
    } },
    { key: 'plugs', name: 'Plugs', glyph: g.plug, read: (s) => {
      const ids = ofDomain(s, 'switch');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('switch', 'toggle', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: `${on.length} of ${segs.length}`,
        label: on.length ? list(on.map((x) => x.label)) : 'all off' };
    } },
  ] },

  { id: 'climate', title: 'Climate', channels: [
    { key: 'heating', name: 'Heating', glyph: g.flame,
      read: thermostat('climate.heatpump', 'climate', thermoLabel,
        // Rule across entities: heating with the windows open.
        (s, e) => {
          const open = openWindows(s);
          if (e.attributes.hvac_action !== 'heating' || !open.length) return undefined;
          if (open.every((id) => s.get(id)!.state === 'closing')) {
            return { level: 1, big: 'Closing', label: `${open.length} windows`, why: 'The windows are closing',
              verb: '', calls: [], busy: true };
          }
          return { level: 1, big: 'Windows', label: `${open.length} open`,
            why: `Heating with ${list(open.map((id) => nameOf(s, id)))} open`, verb: 'Close windows',
            calls: [call('cover', 'close_cover', open)] };
        }) },
    { key: 'ac', name: 'Air conditioning', glyph: g.fan, read: thermostat('climate.hvac', 'climate', thermoLabel) },
    { key: 'ecobee', name: 'Ecobee', glyph: g.thermo, read: (s, u) => {
      const id = 'climate.ecobee', e = s.get(id);
      if (!e || attr(e, 'current_temperature') == null) return null;
      const min = attr(e, 'min_temp') ?? 7, max = attr(e, 'max_temp') ?? 35, cur = attr(e, 'current_temperature')!;
      const lo = attr(e, 'target_temp_low'), hi = attr(e, 'target_temp_high');
      return { kind: 'p', v: clamp((cur - min) / (max - min)), entities: [id], big: `${num(cur)}${u.temp}`,
        label: lo != null && hi != null ? `between ${num(lo)}° and ${num(hi)}°` : hvacMode[e.state] ?? e.state };
    } },
    { key: 'humidity', name: 'Humidity', glyph: g.drop, read: (s) => {
      // The first id is a simulated sensor of the local test installation.
      const id = ['sensor.humedad_simulada', 'sensor.outside_humidity'].find((x) => s.has(x));
      if (!id) return null;
      const h = Number(s.get(id)!.state), dry = 'humidifier.dehumidifier', dryOff = s.get(dry)?.state === 'off';
      return { kind: 'p', v: clamp(h / 100), entities: [id], big: `${num(h, 0)}%`, label: nameOf(s, id).toLowerCase(),
        alert: h >= 70 ? { level: 1, big: `${num(h, 0)}%`, label: 'high humidity', why: 'Humidity went past 70%',
          verb: dryOff ? 'Turn on dehumidifier' : 'Got it', calls: dryOff ? [call('humidifier', 'turn_on', dry)] : [] }
          : undefined };
    } },
  ] },

  { id: 'security', title: 'Security', channels: [
    { key: 'alarm', name: 'Alarm', glyph: g.shield, read: (s) => {
      const id = 'alarm_control_panel.security', e = s.get(id);
      if (!e) return null;
      const modes: [string, string, string][] = [
        ['disarmed', 'Disarmed', 'alarm_disarm'], ['armed_home', 'Home', 'alarm_arm_home'], ['armed_away', 'Away', 'alarm_arm_away']];
      const next = String(e.attributes.next_state ?? '');
      const segs = modes.map(([st, label, service]) => ({ label, entity: id,
        on: e.state === st || (e.state === 'arming' && next === st),
        act: e.state === st ? undefined : call('alarm_control_panel', service, id, { code: ALARM_CODE }) }));
      const fired = e.state === 'triggered' || e.state === 'pending';
      return { kind: 's', segs, entities: [id], big: alarmState[e.state] ?? e.state,
        label: e.state === 'arming' ? `switching to ${alarmState[next]?.toLowerCase() ?? 'armed'}` : 'tap a mode',
        alert: fired ? { level: 2, big: alarmState[e.state], label: 'alarm', fail: [0, 1, 2],
          why: e.state === 'triggered' ? 'The alarm went off' : 'The alarm is about to sound', verb: 'Disarm',
          calls: [call('alarm_control_panel', 'alarm_disarm', id, { code: ALARM_CODE })] } : undefined };
    } },
    { key: 'sirens', name: 'Sirens', glyph: g.siren, read: (s) => {
      const ids = ofDomain(s, 'siren');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('siren', e.state === 'on' ? 'turn_off' : 'turn_on', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? 'Sounding' : 'Silent', label: on.length ? list(on.map((x) => x.label)) : `${ids.length} sirens`,
        alert: on.length ? { level: 2, big: 'Sounding', label: list(on.map((x) => x.label)), fail: on.map((x) => segs.indexOf(x)),
          why: on.length > 1 ? 'Sirens are sounding' : 'A siren is sounding', verb: 'Turn off',
          calls: [call('siren', 'turn_off', on.map((x) => x.entity))] } : undefined };
    } },
    { key: 'locks', name: 'Locks', glyph: g.lock, read: (s) => {
      const ids = ofDomain(s, 'lock');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => ['locked', 'locking'].includes(e.state),
        (e) => busy(e.state) ? undefined : call('lock', e.state === 'locked' ? 'unlock' : 'lock', e.entity_id));
      const shut = segs.filter((x) => x.on).length;
      const jammed = ids.findIndex((id) => s.get(id)!.state === 'jammed');
      const open = segs.filter((x) => !x.on);
      let alert: Alert | undefined;
      if (jammed >= 0) {
        alert = { level: 2, big: 'Jammed', label: segs[jammed].label.toLowerCase(), fail: [jammed],
          why: `${segs[jammed].label} did not finish locking`, verb: 'Retry', calls: [call('lock', 'lock', ids[jammed])] };
      } else if (armed(s) && open.length) {
        alert = { level: 1, big: 'Unlocked', label: list(open.map((x) => x.label)), fail: open.map((x) => segs.indexOf(x)),
          why: 'Alarm armed with doors unlocked', verb: 'Lock', calls: [call('lock', 'lock', open.map((x) => x.entity))] };
      }
      return { kind: 's', segs, entities: ids, big: `${shut} of ${segs.length}`, label: 'locked', alert };
    } },
    { key: 'sensors', name: 'Sensors', glyph: g.eye, read: (s) => {
      const ids = ofDomain(s, 'binary_sensor', ['binary_sensor.movement_backyard', 'binary_sensor.basement_floor_wet']);
      if (!ids.length) return null;
      // On = the sensor works; the one that detects something is the one painted.
      const segs = ids.map((id) => ({ label: nameOf(s, id), on: s.get(id)!.state !== 'unavailable', entity: id }));
      const wet = s.get('binary_sensor.basement_floor_wet')?.state === 'on';
      const moving = s.get('binary_sensor.movement_backyard')?.state === 'on';
      const camera = s.has('camera.demo_camera') ? 'camera.demo_camera' : undefined;
      let alert: Alert | undefined;
      if (wet) alert = { level: 2, big: 'Water', label: 'basement', fail: [ids.indexOf('binary_sensor.basement_floor_wet')],
        why: 'The basement floor is wet', verb: 'Got it', calls: [] };
      else if (moving && armed(s)) alert = { level: 2, big: 'Motion', label: 'backyard', fail: [ids.indexOf('binary_sensor.movement_backyard')],
        why: 'Motion in the backyard with the alarm armed', verb: 'Got it', calls: [] };
      return { kind: 's', segs, entities: [...ids, ...(camera ? [camera] : [])], camera,
        big: moving ? 'Motion' : 'Still', label: moving ? 'in the backyard' : 'backyard and basement', alert };
    } },
  ] },

  { id: 'openings', title: 'Openings', channels: [
    { key: 'living', name: 'Living room window', glyph: g.window, read: coverDial('cover.living_room_window') },
    { key: 'hall', name: 'Hall window', glyph: g.window, read: coverDial('cover.hall_window') },
    { key: 'garage', name: 'Garage door', glyph: g.garage, read: (s) => {
      const id = 'cover.garage_door', e = s.get(id);
      if (!e) return null;
      const open = e.state !== 'closed';
      const night = s.get('sun.sun')?.state === 'below_horizon';
      return { kind: 's', entities: [id], big: coverState[e.state] ? cap(coverState[e.state]) : e.state,
        label: night ? 'it is night' : 'it is daytime',
        segs: [{ label: 'Garage door', on: !open, entity: id, act: busy(e.state) ? undefined : call('cover', open ? 'close_cover' : 'open_cover', id) }],
        alert: open && night ? { level: 1, big: busy(e.state) ? cap(coverState[e.state]) : 'Open', label: 'at night', fail: [0],
          why: e.state === 'closing' ? 'The garage door is closing' : 'The garage door was left open at night', busy: busy(e.state),
          verb: 'Close', calls: [call('cover', 'close_cover', id)] } : undefined };
    } },
    { key: 'irrigation', name: 'Irrigation', glyph: g.sprout, read: (s) => {
      const ids = ofDomain(s, 'valve');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => ['open', 'opening'].includes(e.state),
        (e) => busy(e.state) ? undefined : call('valve', e.state === 'open' ? 'close_valve' : 'open_valve', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} watering` : 'Closed',
        label: on.length ? list(on.map((x) => x.label)) : `${ids.length} valves` };
    } },
  ] },

  { id: 'media', title: 'Media', channels: [
    { key: 'playing', name: 'Playing', glyph: g.play, read: (s) => {
      const ids = ofDomain(s, 'media_player',
        ['media_player.living_room', 'media_player.kitchen', 'media_player.bedroom', 'media_player.lounge_room', 'media_player.walkman']);
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'playing',
        (e) => ['playing', 'paused'].includes(e.state) ? call('media_player', 'media_play_pause', e.entity_id) : undefined);
      const on = segs.filter((x) => x.on);
      const title = on.length ? String(s.get(on[0].entity)!.attributes.media_title ?? '') : '';
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} of ${segs.length}` : 'Silence',
        label: on.length ? (title.length > 26 ? `${title.slice(0, 25)}…` : title || list(on.map((x) => x.label))) : 'all paused' };
    } },
    { key: 'volume', name: 'Living room volume', glyph: g.volume, read: (s) => {
      const id = 'media_player.living_room', e = s.get(id);
      if (!e || attr(e, 'volume_level') == null) return null;
      const pct = Math.round(attr(e, 'volume_level')! * 100);
      return { kind: 'p', v: pct / 100, entities: [id], big: `${pct}%`, label: e.state === 'playing' ? 'living room, playing' : 'living room',
        dial: { min: 0, max: 100, step: 5, unit: '%', label: 'volume', value: pct, entity: id,
          set: (x) => call('media_player', 'volume_set', id, { volume_level: x / 100 }) } };
    } },
  ] },

  { id: 'energy', title: 'Energy', channels: [
    { key: 'power', name: 'Power', glyph: g.bolt, read: (s) => {
      // The first id is a simulated sensor of the local test installation.
      const id = ['sensor.consumo_simulado', 'sensor.power_consumption'].find((x) => s.has(x));
      if (!id) return null;
      const w = Number(s.get(id)!.state), capW = 3000;
      return { kind: 'p', v: clamp(w / capW), entities: [id], big: `${num(w, 0)} W`, label: `of ${num(capW)} W`,
        alert: w > 2000 ? { level: 1, big: `${num(w, 0)} W`, label: 'high consumption', why: 'Consumption went past 2000 W',
          verb: 'Got it', calls: [] } : undefined };
    } },
    { key: 'co', name: 'Carbon monoxide', glyph: g.air, read: (s) => {
      const id = 'sensor.carbon_monoxide', e = s.get(id);
      if (!e) return null;
      const ppm = Number(e.state);
      // 35 ppm: the EPA's one-hour limit; 100 ppm is already dangerous.
      const level = ppm >= 100 ? 2 : ppm >= 35 ? 1 : 0;
      return { kind: 'p', v: clamp(ppm / 150), entities: [id], big: `${num(ppm, 0)} ppm`, label: 'carbon monoxide',
        alert: level ? { level: level as 1 | 2, big: `${num(ppm, 0)} ppm`, label: 'carbon monoxide',
          why: level === 2 ? 'Dangerous carbon monoxide: ventilate and leave' : 'Carbon monoxide above 35 ppm', verb: 'Got it', calls: [] }
          : undefined };
    } },
    { key: 'water', name: 'Hot water', glyph: g.tap,
      read: thermostat('water_heater.demo_water_heater', 'water_heater',
        (e) => `target ${num(attr(e, 'temperature')!)}° · ${String(e.attributes.operation_mode ?? e.state)}`) },
  ] },

  { id: 'maintenance', title: 'Maintenance', channels: [
    { key: 'updates', name: 'Updates', glyph: g.box, read: (s) => {
      const ids = ofDomain(s, 'update');
      if (!ids.length) return null;
      // On = up to date; the pending one is the one painted.
      const segs = ids.map((id) => ({ label: String(s.get(id)!.attributes.title ?? nameOf(s, id)), on: true, entity: id }));
      const pending = ids.filter((id) => s.get(id)!.state === 'on');
      const running = ids.find((id) => s.get(id)!.attributes.in_progress);
      if (running) {
        const p = s.get(running)!.attributes.update_percentage as number | null;
        return { kind: 'p', v: (p ?? 0) / 100, entities: ids, big: p != null ? `${num(p, 0)}%` : 'Installing',
          label: String(s.get(running)!.attributes.title ?? nameOf(s, running)) };
      }
      const installable = pending.filter((id) => (Number(s.get(id)!.attributes.supported_features) & 1) === 1);
      return { kind: 's', segs, entities: ids, big: pending.length ? `${pending.length} pending` : 'Up to date',
        label: `${ids.length - pending.length} of ${ids.length} up to date`,
        alert: pending.length ? { level: 1, big: `${pending.length} new`, label: 'updates', fail: pending.map((id) => ids.indexOf(id)),
          why: installable.length ? `${segs[ids.indexOf(installable[0])].label} has a new version` : 'There are new versions',
          verb: installable.length ? 'Install' : 'Got it',
          calls: installable.length ? [call('update', 'install', installable[0])] : [] } : undefined };
    } },
    { key: 'vacuums', name: 'Vacuums', glyph: g.robot, read: (s) => {
      const ids = ofDomain(s, 'vacuum');
      if (!ids.length) return null;
      const segs = ids.map((id, i) => {
        const e = s.get(id)!, f = Number(e.attributes.supported_features);
        const cleaning = e.state === 'cleaning';
        const act = cleaning ? (f & 16 ? call('vacuum', 'return_to_base', id) : f & 8 ? call('vacuum', 'stop', id) : undefined)
          : f & 8192 ? call('vacuum', 'start', id) : undefined;
        return { label: `Floor ${i}`, on: cleaning, entity: id, act };
      });
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} cleaning` : 'Docked',
        label: on.length ? list(on.map((x) => x.label)) : `${ids.length} vacuums` };
    } },
  ] },
];
