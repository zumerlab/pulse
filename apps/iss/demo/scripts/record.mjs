// Records a few seconds of the station for the demo: the telemetry's snapshot
// and first updates as the raw TLCP lines the server sent, the position and
// the track ahead (wheretheiss.at), the station, its expedition and the
// launches (Launch Library 2), trimmed to the fields the parsers read. Writes
// demo/recording.json; `demo/data.ts` imports it. Run from the repo root:
//   node apps/iss/demo/scripts/record.mjs [seconds]
// Launch Library allows fifteen questions an hour: this asks three.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, ITEMS } from '../../telemetry.ts';
import { expeditionUrl, LAUNCHES_URL, STATION_URL, trackUrl, WHERE_API } from '../../feeds.ts';

const seconds = Number(process.argv[2] ?? 8);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'recording.json');
const get = async (url) => { const r = await fetch(url, { headers: { Accept: 'application/json' } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

function telemetry() {
  return new Promise((resolve) => {
    const lines = [], t0 = Date.now();
    const ws = new WebSocket('wss://push.lightstreamer.com/lightstreamer', 'TLCP-2.5.0.lightstreamer.com');
    ws.onopen = () => { ws.send('wsok'); ws.send('create_session\r\nLS_cid=mgQkwtwdysogQz2BJ4Ji%20kOj2Bg&LS_adapter_set=ISSLIVE&LS_send_sync=false&LS_cause=api'); };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split('\r\n')) {
        if (line.startsWith('CONOK')) ws.send(`control\r\nLS_reqId=1&LS_op=add&LS_subId=1&LS_mode=MERGE&LS_group=${ITEMS.join('%20')}&LS_schema=${FIELDS.join('%20')}&LS_snapshot=true&LS_requested_max_frequency=unlimited&LS_ack=false`);
        if (line.startsWith('U,')) lines.push([Date.now() - t0, line]);
      }
    };
    setTimeout(() => { ws.close(); resolve({ items: ITEMS, fields: FIELDS, at: t0, lines }); }, seconds * 1000);
  });
}

const now = Date.now();
const [tlm, position, track, station, launches] = await Promise.all([telemetry(), get(WHERE_API), get(trackUrl(now)), get(STATION_URL), get(LAUNCHES_URL)]);
const expedition = station.active_expeditions?.[0] ? await get(expeditionUrl(station.active_expeditions[0].id)) : null;
const recording = {
  at: now,
  telemetry: tlm,
  position, track,
  station: {
    name: station.name, onboard_crew: station.onboard_crew,
    active_expeditions: station.active_expeditions.map((e) => pick(e, ['id', 'name', 'start', 'end'])),
    docking_location: station.docking_location.map((d) => ({ name: d.name, currently_docked: d.currently_docked ? {
      docking: d.currently_docked.docking,
      flight_vehicle_chaser: d.currently_docked.flight_vehicle_chaser ? { spacecraft: { name: d.currently_docked.flight_vehicle_chaser.spacecraft?.name } } : null,
    } : null })),
  },
  expedition: expedition && {
    name: expedition.name,
    crew: expedition.crew.map((c) => ({ role: { role: c.role.role }, astronaut: { name: c.astronaut.name, agency: { abbrev: c.astronaut.agency?.abbrev }, nationality: (c.astronaut.nationality ?? []).slice(0, 1).map((n) => ({ alpha_2_code: n.alpha_2_code })), last_flight: c.astronaut.last_flight } })),
    spacewalks: (expedition.spacewalks ?? []).map((w) => pick(w, ['name', 'start', 'end'])),
  },
  launches: { results: launches.results.map((l) => ({
    ...pick(l, ['id', 'name', 'net', 'window_end', 'probability', 'weather_concerns', 'webcast_live']),
    status: pick(l.status, ['id', 'name']), net_precision: l.net_precision && { name: l.net_precision.name },
    mission: l.mission && { name: l.mission.name, description: l.mission.description, orbit: l.mission.orbit && { abbrev: l.mission.orbit.abbrev } },
    pad: { name: l.pad.name, latitude: l.pad.latitude, longitude: l.pad.longitude, location: { name: l.pad.location.name } },
    rocket: { configuration: { full_name: l.rocket.configuration.full_name } },
    launch_service_provider: { name: l.launch_service_provider.name },
    vid_urls: (l.vid_urls ?? []).slice(0, 3).map((v) => pick(v, ['priority', 'url', 'live', 'title'])),
  })) },
};
writeFileSync(out, `${JSON.stringify(recording, null, 1)}\n`);
console.log(`${out}: ${tlm.lines.length} telemetry lines, ${recording.launches.results.length} launches, ${recording.expedition?.crew.length ?? 0} aboard`);
