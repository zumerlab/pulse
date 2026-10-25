import type { Call, HassState, States } from './ha.ts';

// Cada canal se lee del estado vivo de Home Assistant: no hay estados "ok" y
// "aviso" escritos a mano. El aviso sale de una regla sobre los datos y su
// acción es una llamada real a un servicio. Si falta la entidad, el canal no
// aparece (otra instalación de Home Assistant arma su propio objeto).

export type Seg = { label: string; on: boolean; entity: string; act?: Call };
export type Dial = {
  min: number; max: number; step: number; unit: string; label: string;
  value: number; entity: string; set: (t: number) => Call;
};
export type Alert = {
  level: 1 | 2; big: string; label: string; why: string;
  verb: string; calls: Call[];      // sin llamadas, el verbo solo da el aviso por visto
  busy?: boolean;                   // ya se está resolviendo: sin botón hasta que Home Assistant confirme
  fail?: number[];                 // segmentos que se pintan con el color del aviso
};
export type Reading = {
  kind: 'p' | 's';
  v?: number;                       // progreso 0..1
  segs?: Seg[];
  dial?: Dial;
  big: string; label: string;
  alert?: Alert;
  entities: string[];               // de qué entidades depende (detalle y "enviando")
  camera?: string;
};
export type Channel = { key: string; name: string; glyph: string; read: (s: States, u: Units) => Reading | null };
export type PulseSystem = { id: string; title: string; channels: Channel[] };
export type Units = { temp: string };

// Código de la alarma del demo de Home Assistant (manual, "1234").
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

// Nombres cortos en castellano para las entidades del demo; si no, el de HA.
const short: Record<string, string> = {
  'light.bed_light': 'Dormitorio', 'light.ceiling_lights': 'Techo', 'light.kitchen_lights': 'Cocina',
  'light.office_rgbw_lights': 'Oficina', 'light.living_room_rgbww_lights': 'Living',
  'light.entrance_color_white_lights': 'Entrada',
  'switch.decorative_lights': 'Guirnaldas', 'switch.ac': 'Aire',
  'lock.front_door': 'Puerta principal', 'lock.kitchen_door': 'Puerta cocina',
  'lock.poorly_installed_door': 'Puerta mal instalada', 'lock.openable_lock': 'Cerradura',
  'binary_sensor.movement_backyard': 'Movimiento patio', 'binary_sensor.basement_floor_wet': 'Agua sótano',
  'cover.living_room_window': 'Ventana living', 'cover.hall_window': 'Ventana pasillo',
  'cover.kitchen_window': 'Ventana cocina', 'cover.garage_door': 'Portón', 'cover.pergola_roof': 'Pérgola',
  'valve.front_garden': 'Jardín frente', 'valve.back_garden': 'Jardín fondo', 'valve.orchard': 'Huerta',
  'valve.trees': 'Árboles', 'media_player.bedroom': 'Dormitorio', 'media_player.kitchen': 'Cocina',
  'media_player.living_room': 'Living', 'media_player.lounge_room': 'Tele', 'media_player.walkman': 'Walkman',
  'siren.siren': 'Sirena', 'siren.siren_with_all_features': 'Sirena 2',
};

export const nameOf = (s: States, id: string) => {
  const floor = /^vacuum\.demo_vacuum_(\d+)_/.exec(id)?.[1];
  return short[id] ?? (floor ? `Aspiradora piso ${floor}` : s.get(id)?.attributes.friendly_name ?? id);
};
const num = (n: number, d = 1) => n.toLocaleString('es-AR', { maximumFractionDigits: d });
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const attr = (e: HassState, k: string) => e.attributes[k] as number | undefined;
const ofDomain = (s: States, domain: string, only?: string[]) =>
  (only ?? [...s.keys()].filter((id) => id.startsWith(`${domain}.`)).sort()).filter((id) => s.has(id));
const list = (names: string[]) => {
  const low = names.map((n) => n.toLowerCase());
  return low.length <= 1 ? (low[0] ?? '') : `${low.slice(0, -1).join(', ')} y ${low.at(-1)}`;
};
const call = (domain: string, service: string, entity_id: string | string[], data = {}): Call =>
  ({ domain, service, data: { entity_id, ...data } });
const busy = (state: string) => /ing$/.test(state) && state !== 'playing';

// Dial de temperatura de un termostato o calefón. Muestra la medida; el anillo
// es el objetivo, que es lo que se cambia.
function thermostat(id: string, domain: 'climate' | 'water_heater', label: (e: HassState) => string,
  alert?: (s: States, e: HassState) => Alert | undefined) {
  return (s: States, u: Units): Reading | null => {
    const e = s.get(id);
    if (!e || attr(e, 'temperature') == null) return null;
    const min = attr(e, 'min_temp') ?? 7, max = attr(e, 'max_temp') ?? 35, t = attr(e, 'temperature')!;
    const cur = attr(e, 'current_temperature');
    return {
      kind: 'p', v: clamp((t - min) / (max - min)), entities: [id],
      dial: { min, max, step: attr(e, 'target_temp_step') ?? 1, unit: '°', label: 'objetivo', value: t, entity: id,
        set: (x) => call(domain, 'set_temperature', id, { temperature: x }) },
      big: cur != null ? `${num(cur)}${u.temp}` : `${num(t)}°`, label: label(e), alert: alert?.(s, e),
    };
  };
}

const hvacAction: Record<string, string> = {
  heating: 'calentando', cooling: 'enfriando', idle: 'en espera', off: 'apagado', drying: 'secando', fan: 'ventilando',
};
const hvacMode: Record<string, string> = {
  off: 'apagado', heat: 'calor', cool: 'frío', heat_cool: 'auto', auto: 'auto', dry: 'seco', fan_only: 'ventilador',
};
const coverState: Record<string, string> = { open: 'abierta', closed: 'cerrada', opening: 'abriendo…', closing: 'cerrando…' };
const alarmState: Record<string, string> = {
  disarmed: 'Desarmada', armed_home: 'En casa', armed_away: 'Fuera', armed_night: 'Noche',
  armed_vacation: 'Vacaciones', armed_custom_bypass: 'Personal', arming: 'Armando…', pending: 'Por sonar',
  triggered: 'Disparada', disarming: 'Desarmando…',
};
const armed = (s: States) => /^armed_/.test(s.get('alarm_control_panel.security')?.state ?? '');

// Segmentos de entidades que se prenden y se apagan con un toque.
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
      dial: { min: 0, max: 100, step: 10, unit: '%', label: 'abierta', value: p, entity: id,
        set: (x) => call('cover', 'set_cover_position', id, { position: x }) },
      big: p === 0 ? 'Cerrada' : `${p}%`, label: busy(e.state) ? coverState[e.state] : p === 0 ? 'del todo' : 'abierta',
    };
  };
}

export const systems: PulseSystem[] = [
  { id: 'luces', title: 'Luces', channels: [
    { key: 'luces', name: 'Luces', glyph: g.bulb, read: (s) => {
      const ids = ofDomain(s, 'light');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('light', 'toggle', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: `${on.length} de ${segs.length}`,
        label: on.length ? list(on.map((x) => x.label)) : 'todas apagadas' };
    } },
    { key: 'brillo', name: 'Brillo living', glyph: g.sun, read: (s) => {
      const id = 'light.living_room_rgbww_lights', e = s.get(id);
      if (!e) return null;
      const pct = e.state === 'on' ? Math.round((attr(e, 'brightness') ?? 255) / 2.55) : 0;
      return { kind: 'p', v: pct / 100, entities: [id], big: pct ? `${pct}%` : 'Apagada', label: 'living',
        dial: { min: 0, max: 100, step: 5, unit: '%', label: 'brillo', value: pct, entity: id,
          set: (x) => x ? call('light', 'turn_on', id, { brightness_pct: x }) : call('light', 'turn_off', id) } };
    } },
    { key: 'enchufes', name: 'Enchufes', glyph: g.plug, read: (s) => {
      const ids = ofDomain(s, 'switch');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('switch', 'toggle', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: `${on.length} de ${segs.length}`,
        label: on.length ? list(on.map((x) => x.label)) : 'todos apagados' };
    } },
  ] },

  { id: 'clima', title: 'Clima', channels: [
    { key: 'calefaccion', name: 'Calefacción', glyph: g.flame,
      read: thermostat('climate.heatpump', 'climate',
        (e) => `objetivo ${num(attr(e, 'temperature')!)}° · ${hvacAction[String(e.attributes.hvac_action)] ?? hvacMode[e.state] ?? e.state}`,
        // Regla entre entidades: calienta con ventanas abiertas.
        (s, e) => {
          const open = openWindows(s);
          if (e.attributes.hvac_action !== 'heating' || !open.length) return undefined;
          if (open.every((id) => s.get(id)!.state === 'closing')) {
            return { level: 1, big: 'Cerrando', label: `${open.length} ventanas`, why: 'Se están cerrando las ventanas',
              verb: '', calls: [], busy: true };
          }
          return { level: 1, big: 'Ventanas', label: `${open.length} abiertas`,
            why: `Calienta con ${list(open.map((id) => nameOf(s, id)))} abiertas`, verb: 'Cerrar ventanas',
            calls: [call('cover', 'close_cover', open)] };
        }) },
    { key: 'aire', name: 'Aire', glyph: g.fan,
      read: thermostat('climate.hvac', 'climate',
        (e) => `objetivo ${num(attr(e, 'temperature')!)}° · ${hvacAction[String(e.attributes.hvac_action)] ?? hvacMode[e.state] ?? e.state}`) },
    { key: 'ecobee', name: 'Ecobee', glyph: g.thermo, read: (s, u) => {
      const id = 'climate.ecobee', e = s.get(id);
      if (!e || attr(e, 'current_temperature') == null) return null;
      const min = attr(e, 'min_temp') ?? 7, max = attr(e, 'max_temp') ?? 35, cur = attr(e, 'current_temperature')!;
      const lo = attr(e, 'target_temp_low'), hi = attr(e, 'target_temp_high');
      return { kind: 'p', v: clamp((cur - min) / (max - min)), entities: [id], big: `${num(cur)}${u.temp}`,
        label: lo != null && hi != null ? `entre ${num(lo)}° y ${num(hi)}°` : hvacMode[e.state] ?? e.state };
    } },
    { key: 'humedad', name: 'Humedad', glyph: g.drop, read: (s) => {
      const id = ['sensor.humedad_simulada', 'sensor.outside_humidity'].find((x) => s.has(x));
      if (!id) return null;
      const h = Number(s.get(id)!.state), dry = 'humidifier.dehumidifier', dryOff = s.get(dry)?.state === 'off';
      return { kind: 'p', v: clamp(h / 100), entities: [id], big: `${num(h, 0)}%`, label: nameOf(s, id).toLowerCase(),
        alert: h >= 70 ? { level: 1, big: `${num(h, 0)}%`, label: 'humedad alta', why: 'Pasó el 70% de humedad',
          verb: dryOff ? 'Prender deshumidificador' : 'Entendido', calls: dryOff ? [call('humidifier', 'turn_on', dry)] : [] }
          : undefined };
    } },
  ] },

  { id: 'seguridad', title: 'Seguridad', channels: [
    { key: 'alarma', name: 'Alarma', glyph: g.shield, read: (s) => {
      const id = 'alarm_control_panel.security', e = s.get(id);
      if (!e) return null;
      const modes: [string, string, string][] = [
        ['disarmed', 'Desarmada', 'alarm_disarm'], ['armed_home', 'En casa', 'alarm_arm_home'], ['armed_away', 'Fuera', 'alarm_arm_away']];
      const next = String(e.attributes.next_state ?? '');
      const segs = modes.map(([st, label, service]) => ({ label, entity: id,
        on: e.state === st || (e.state === 'arming' && next === st),
        act: e.state === st ? undefined : call('alarm_control_panel', service, id, { code: ALARM_CODE }) }));
      const fired = e.state === 'triggered' || e.state === 'pending';
      return { kind: 's', segs, entities: [id], big: alarmState[e.state] ?? e.state,
        label: e.state === 'arming' ? `pasa a ${alarmState[next]?.toLowerCase() ?? 'armada'}` : 'tocá un modo',
        alert: fired ? { level: 2, big: alarmState[e.state], label: 'alarma', fail: [0, 1, 2],
          why: e.state === 'triggered' ? 'La alarma se disparó' : 'La alarma está por sonar', verb: 'Desarmar',
          calls: [call('alarm_control_panel', 'alarm_disarm', id, { code: ALARM_CODE })] } : undefined };
    } },
    { key: 'sirena', name: 'Sirenas', glyph: g.siren, read: (s) => {
      const ids = ofDomain(s, 'siren');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'on', (e) => call('siren', e.state === 'on' ? 'turn_off' : 'turn_on', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? 'Sonando' : 'En silencio', label: on.length ? list(on.map((x) => x.label)) : `${ids.length} sirenas`,
        alert: on.length ? { level: 2, big: 'Sonando', label: list(on.map((x) => x.label)), fail: on.map((x) => segs.indexOf(x)),
          why: on.length > 1 ? 'Hay sirenas sonando' : 'Una sirena está sonando', verb: 'Apagar',
          calls: [call('siren', 'turn_off', on.map((x) => x.entity))] } : undefined };
    } },
    { key: 'cerraduras', name: 'Cerraduras', glyph: g.lock, read: (s) => {
      const ids = ofDomain(s, 'lock');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => ['locked', 'locking'].includes(e.state),
        (e) => busy(e.state) ? undefined : call('lock', e.state === 'locked' ? 'unlock' : 'lock', e.entity_id));
      const shut = segs.filter((x) => x.on).length;
      const jammed = ids.findIndex((id) => s.get(id)!.state === 'jammed');
      const open = segs.filter((x) => !x.on);
      let alert: Alert | undefined;
      if (jammed >= 0) {
        alert = { level: 2, big: 'Trabada', label: segs[jammed].label.toLowerCase(), fail: [jammed],
          why: `${segs[jammed].label} no terminó de cerrar`, verb: 'Reintentar', calls: [call('lock', 'lock', ids[jammed])] };
      } else if (armed(s) && open.length) {
        alert = { level: 1, big: 'Sin llave', label: list(open.map((x) => x.label)), fail: open.map((x) => segs.indexOf(x)),
          why: 'Alarma armada con puertas sin llave', verb: 'Cerrar con llave', calls: [call('lock', 'lock', open.map((x) => x.entity))] };
      }
      return { kind: 's', segs, entities: ids, big: `${shut} de ${segs.length}`, label: 'con llave', alert };
    } },
    { key: 'sensores', name: 'Sensores', glyph: g.eye, read: (s) => {
      const ids = ofDomain(s, 'binary_sensor', ['binary_sensor.movement_backyard', 'binary_sensor.basement_floor_wet']);
      if (!ids.length) return null;
      // Encendido = el sensor funciona; el que detecta algo es el que se pinta.
      const segs = ids.map((id) => ({ label: nameOf(s, id), on: s.get(id)!.state !== 'unavailable', entity: id }));
      const wet = s.get('binary_sensor.basement_floor_wet')?.state === 'on';
      const moving = s.get('binary_sensor.movement_backyard')?.state === 'on';
      const camera = s.has('camera.demo_camera') ? 'camera.demo_camera' : undefined;
      let alert: Alert | undefined;
      if (wet) alert = { level: 2, big: 'Agua', label: 'sótano', fail: [ids.indexOf('binary_sensor.basement_floor_wet')],
        why: 'Se mojó el piso del sótano', verb: 'Entendido', calls: [] };
      else if (moving && armed(s)) alert = { level: 2, big: 'Movimiento', label: 'patio', fail: [ids.indexOf('binary_sensor.movement_backyard')],
        why: 'Movimiento en el patio con la alarma armada', verb: 'Entendido', calls: [] };
      return { kind: 's', segs, entities: [...ids, ...(camera ? [camera] : [])], camera,
        big: moving ? 'Movimiento' : 'Quieto', label: moving ? 'en el patio' : 'patio y sótano', alert };
    } },
  ] },

  { id: 'aberturas', title: 'Aberturas', channels: [
    { key: 'living', name: 'Ventana living', glyph: g.window, read: coverDial('cover.living_room_window') },
    { key: 'pasillo', name: 'Ventana pasillo', glyph: g.window, read: coverDial('cover.hall_window') },
    { key: 'porton', name: 'Portón', glyph: g.garage, read: (s) => {
      const id = 'cover.garage_door', e = s.get(id);
      if (!e) return null;
      const open = e.state !== 'closed';
      const night = s.get('sun.sun')?.state === 'below_horizon';
      return { kind: 's', entities: [id], big: coverState[e.state]?.replace(/^./, (c) => c.toUpperCase()) ?? e.state,
        label: night ? 'es de noche' : 'es de día',
        segs: [{ label: 'Portón', on: !open, entity: id, act: busy(e.state) ? undefined : call('cover', open ? 'close_cover' : 'open_cover', id) }],
        alert: open && night ? { level: 1, big: busy(e.state) ? coverState[e.state] : 'Abierto', label: 'de noche', fail: [0],
          why: e.state === 'closing' ? 'El portón se está cerrando' : 'El portón quedó abierto de noche', busy: busy(e.state),
          verb: 'Cerrar', calls: [call('cover', 'close_cover', id)] } : undefined };
    } },
    { key: 'riego', name: 'Riego', glyph: g.sprout, read: (s) => {
      const ids = ofDomain(s, 'valve');
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => ['open', 'opening'].includes(e.state),
        (e) => busy(e.state) ? undefined : call('valve', e.state === 'open' ? 'close_valve' : 'open_valve', e.entity_id));
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} regando` : 'Cerrado',
        label: on.length ? list(on.map((x) => x.label)) : `${ids.length} válvulas` };
    } },
  ] },

  { id: 'multimedia', title: 'Multimedia', channels: [
    { key: 'sonando', name: 'Sonando', glyph: g.play, read: (s) => {
      const ids = ofDomain(s, 'media_player',
        ['media_player.living_room', 'media_player.kitchen', 'media_player.bedroom', 'media_player.lounge_room', 'media_player.walkman']);
      if (!ids.length) return null;
      const segs = switches(ids, s, (e) => e.state === 'playing',
        (e) => ['playing', 'paused'].includes(e.state) ? call('media_player', 'media_play_pause', e.entity_id) : undefined);
      const on = segs.filter((x) => x.on);
      const title = on.length ? String(s.get(on[0].entity)!.attributes.media_title ?? '') : '';
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} de ${segs.length}` : 'Silencio',
        label: on.length ? (title.length > 26 ? `${title.slice(0, 25)}…` : title || list(on.map((x) => x.label))) : 'todo en pausa' };
    } },
    { key: 'volumen', name: 'Volumen living', glyph: g.volume, read: (s) => {
      const id = 'media_player.living_room', e = s.get(id);
      if (!e || attr(e, 'volume_level') == null) return null;
      const pct = Math.round(attr(e, 'volume_level')! * 100);
      return { kind: 'p', v: pct / 100, entities: [id], big: `${pct}%`, label: e.state === 'playing' ? 'living, sonando' : 'living',
        dial: { min: 0, max: 100, step: 5, unit: '%', label: 'volumen', value: pct, entity: id,
          set: (x) => call('media_player', 'volume_set', id, { volume_level: x / 100 }) } };
    } },
  ] },

  { id: 'energia', title: 'Energía', channels: [
    { key: 'consumo', name: 'Consumo', glyph: g.bolt, read: (s) => {
      const id = ['sensor.consumo_simulado', 'sensor.power_consumption'].find((x) => s.has(x));
      if (!id) return null;
      const w = Number(s.get(id)!.state), cap = 3000;
      return { kind: 'p', v: clamp(w / cap), entities: [id], big: `${num(w, 0)} W`, label: `de ${num(cap)} W`,
        alert: w > 2000 ? { level: 1, big: `${num(w, 0)} W`, label: 'consumo alto', why: 'Pasó los 2000 W',
          verb: 'Entendido', calls: [] } : undefined };
    } },
    { key: 'monoxido', name: 'Monóxido', glyph: g.air, read: (s) => {
      const id = 'sensor.carbon_monoxide', e = s.get(id);
      if (!e) return null;
      const ppm = Number(e.state);
      // 35 ppm: límite de una hora de la EPA; 100 ppm ya es peligroso.
      const level = ppm >= 100 ? 2 : ppm >= 35 ? 1 : 0;
      return { kind: 'p', v: clamp(ppm / 150), entities: [id], big: `${num(ppm, 0)} ppm`, label: 'monóxido de carbono',
        alert: level ? { level: level as 1 | 2, big: `${num(ppm, 0)} ppm`, label: 'monóxido',
          why: level === 2 ? 'Monóxido peligroso: ventilar y salir' : 'Monóxido por encima de 35 ppm', verb: 'Entendido', calls: [] }
          : undefined };
    } },
    { key: 'agua', name: 'Agua caliente', glyph: g.tap,
      read: thermostat('water_heater.demo_water_heater', 'water_heater',
        (e) => `objetivo ${num(attr(e, 'temperature')!)}° · ${String(e.attributes.operation_mode ?? e.state)}`) },
  ] },

  { id: 'mantenimiento', title: 'Mantenimiento', channels: [
    { key: 'updates', name: 'Actualizaciones', glyph: g.box, read: (s) => {
      const ids = ofDomain(s, 'update');
      if (!ids.length) return null;
      // Encendido = al día; el pendiente es el que se pinta.
      const segs = ids.map((id) => ({ label: String(s.get(id)!.attributes.title ?? nameOf(s, id)), on: true, entity: id }));
      const pending = ids.filter((id) => s.get(id)!.state === 'on');
      const running = ids.find((id) => s.get(id)!.attributes.in_progress);
      if (running) {
        const p = s.get(running)!.attributes.update_percentage as number | null;
        return { kind: 'p', v: (p ?? 0) / 100, entities: ids, big: p != null ? `${num(p, 0)}%` : 'Instalando',
          label: String(s.get(running)!.attributes.title ?? nameOf(s, running)) };
      }
      const installable = pending.filter((id) => (Number(s.get(id)!.attributes.supported_features) & 1) === 1);
      return { kind: 's', segs, entities: ids, big: pending.length ? `${pending.length} pendientes` : 'Al día',
        label: `${ids.length - pending.length} de ${ids.length} al día`,
        alert: pending.length ? { level: 1, big: `${pending.length} nuevas`, label: 'actualizaciones', fail: pending.map((id) => ids.indexOf(id)),
          why: installable.length ? `${segs[ids.indexOf(installable[0])].label} tiene versión nueva` : 'Hay versiones nuevas',
          verb: installable.length ? 'Instalar' : 'Entendido',
          calls: installable.length ? [call('update', 'install', installable[0])] : [] } : undefined };
    } },
    { key: 'aspiradoras', name: 'Aspiradoras', glyph: g.robot, read: (s) => {
      const ids = ofDomain(s, 'vacuum');
      if (!ids.length) return null;
      const segs = ids.map((id, i) => {
        const e = s.get(id)!, f = Number(e.attributes.supported_features);
        const cleaning = e.state === 'cleaning';
        const act = cleaning ? (f & 16 ? call('vacuum', 'return_to_base', id) : f & 8 ? call('vacuum', 'stop', id) : undefined)
          : f & 8192 ? call('vacuum', 'start', id) : undefined;
        return { label: `Piso ${i}`, on: cleaning, entity: id, act };
      });
      const on = segs.filter((x) => x.on);
      return { kind: 's', segs, entities: ids, big: on.length ? `${on.length} limpiando` : 'En la base',
        label: on.length ? list(on.map((x) => x.label)) : `${ids.length} aspiradoras` };
    } },
  ] },
];
