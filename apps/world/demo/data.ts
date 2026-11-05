// A day of calamities, recorded: the feeds' answers in their own shapes,
// built around "now" so the "3 h ago" and the "9 days" read right. The demo
// source runs the real parsers over them: what the parsers accept is what the
// live feeds send. The events are made up; the places are real.

const H = 3_600_000, MIN = 60_000;

// The day's earthquakes: an M7.1 in the Kermadec Islands three hours ago (at
// sea, an orange PAGER alert), an M4.6 in San Juan, and the usual dozen.
export function quakesJson(now: number) {
  const q = (mag: number, place: string, agoH: number, lon: number, lat: number, depth: number, alert: string | null = null, tsunami = 0) => ({
    type: 'Feature', properties: { mag, place, time: Math.round(now - agoH * H), updated: Math.round(now - agoH * H + 20 * MIN), tz: null, url: `https://earthquake.usgs.gov/earthquakes/eventpage/demo${Math.round(agoH * 100)}`,
      detail: '', felt: null, cdi: null, mmi: null, alert, status: 'reviewed', tsunami, sig: Math.round(mag * mag * 15), net: 'us', code: `demo${Math.round(agoH * 100)}`, ids: '', sources: ',us,', types: ',origin,', nst: null, dmin: null, rms: 0.8, gap: 30, magType: 'mww', type: 'earthquake', title: `M ${mag} - ${place}` },
    geometry: { type: 'Point', coordinates: [lon, lat, depth] }, id: `demo${Math.round(agoH * 100)}` });
  return { type: 'FeatureCollection', metadata: { generated: now, url: '', title: 'USGS Magnitude 2.5+ Earthquakes, Past Day', status: 200, api: '1.14.1', count: 14 }, features: [
    q(7.1, '98 km NE of Raoul Island, Kermadec Islands', 3.1, -177.4, -28.9, 35, 'orange', 1),
    q(5.4, '40 km S of Raoul Island, Kermadec Islands', 2.4, -177.9, -29.6, 30),
    q(5.0, 'Kermadec Islands region', 1.8, -177.6, -29.2, 10),
    q(4.6, '34 km W of San Juan, Argentina', 5.6, -68.9, -31.5, 110),
    q(5.6, '120 km SE of Sand Point, Alaska', 9.2, -159.4, 54.6, 25),
    q(4.9, '83 km WNW of Ternate, Indonesia', 11.5, 126.7, 1.1, 60),
    q(4.3, '15 km SSW of Yauco, Puerto Rico', 13.1, -66.9, 17.9, 12),
    q(5.1, 'South Sandwich Islands region', 14.7, -26.1, -56.8, 50),
    q(4.7, '71 km NNE of Hihifo, Tonga', 16.2, -173.6, -15.3, 115),
    q(3.1, '12 km NW of The Geysers, CA', 17.4, -122.9, 38.9, 2),
    q(4.4, '48 km ESE of Ōfunato, Japan', 19.3, 142.3, 38.9, 40),
    q(2.8, '8 km SE of Gilroy, CA', 20.6, -121.5, 36.9, 5),
    q(4.1, '29 km NE of Calama, Chile', 22.1, -68.7, -22.3, 95),
    q(3.6, 'Islas Orcadas del Sur region', 23.5, -45.2, -60.1, 10),
  ] };
}

// GDACS's event list, one hazard at a time: its dates in UTC without a zone.
const gdacsTime = (at: number) => new Date(at).toISOString().slice(0, 19);
const SCORE: Record<string, number> = { Green: 1, Orange: 2, Red: 3 };
type Ev = { kind: string; id: number; name: string; short?: string; country: string; alert: string; lat: number; lon: number; fromH: number; toH: number; severity?: number; text?: string; unit?: string; current?: boolean };
function gdacsJson(now: number, events: Ev[]) {
  return { type: 'FeatureCollection', features: events.map((e) => ({
    type: 'Feature', bbox: [e.lon, e.lat, e.lon, e.lat], geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
    properties: { eventtype: e.kind, eventid: e.id, episodeid: 1, eventname: e.short ?? '', glide: '', name: e.name, description: e.name, htmldescription: `${e.alert} ${e.name}`,
      icon: `https://www.gdacs.org/images/gdacs_icons/maps/${e.alert}/${e.kind}.png`, iconoverall: `https://www.gdacs.org/images/gdacs_icons/maps/${e.alert}/${e.kind}.png`,
      url: { geometry: '', report: `https://www.gdacs.org/report.aspx?eventid=${e.id}&episodeid=1&eventtype=${e.kind}`, details: '' },
      alertlevel: e.alert, alertscore: SCORE[e.alert], episodealertlevel: e.alert, episodealertscore: SCORE[e.alert], istemporary: 'false', iscurrent: String(e.current ?? true),
      country: e.country, fromdate: gdacsTime(now - e.fromH * H), todate: gdacsTime(now - e.toH * H), datemodified: gdacsTime(now - e.toH * H + 30 * MIN), iso3: '', source: 'GDACS', sourceid: '',
      polygonlabel: 'Centroid', Class: 'Point_Centroid', affectedcountries: [], severitydata: { severity: e.severity ?? 0, severitytext: e.text ?? 'Magnitude 0 ', severityunit: e.unit ?? '' } },
  })) };
}

// A red typhoon east of Luzon, a tropical storm in the Atlantic, and one from last month, over.
export const cyclonesJson = (now: number) => gdacsJson(now, [
  { kind: 'TC', id: 900101, name: 'Tropical Cyclone HALIA-26', short: 'HALIA-26', country: 'Philippines', alert: 'Red', lat: 15.2, lon: 127.8, fromH: 96, toH: 3, severity: 204.4, text: 'Hurricane/Typhoon > 74 mph (maximum wind speed of 204 km/h)', unit: 'km/h' },
  { kind: 'TC', id: 900102, name: 'Tropical Cyclone BRISA-26', short: 'BRISA-26', country: '', alert: 'Green', lat: 22.4, lon: -59.6, fromH: 30, toH: 3, severity: 83.3, text: 'Tropical Storm (maximum wind speed of 83 km/h)', unit: 'km/h' },
  { kind: 'TC', id: 900090, name: 'Tropical Cyclone OLMO-26', short: 'OLMO-26', country: 'Mexico', alert: 'Orange', lat: 18.9, lon: -104.6, fromH: 30 * 24, toH: 25 * 24, severity: 165, unit: 'km/h', current: false },
]);
// An orange flood in Bangladesh for nine days, a green one in Entre Ríos close to Buenos Aires, and others green.
export const floodsJson = (now: number) => gdacsJson(now, [
  { kind: 'FL', id: 900201, name: 'Flood in Bangladesh', country: 'Bangladesh', alert: 'Orange', lat: 23.7, lon: 90.4, fromH: 9 * 24, toH: 5 },
  { kind: 'FL', id: 900202, name: 'Flood in Argentina', country: 'Argentina', alert: 'Green', lat: -33.01, lon: -58.52, fromH: 3 * 24, toH: 5 },
  { kind: 'FL', id: 900203, name: 'Flood in Italy', country: 'Italy', alert: 'Green', lat: 44.5, lon: 11.3, fromH: 4 * 24, toH: 5 },
  { kind: 'FL', id: 900204, name: 'Flood in Nigeria', country: 'Nigeria', alert: 'Green', lat: 7.8, lon: 6.7, fromH: 20 * 24, toH: 5 },
  { kind: 'FL', id: 900205, name: 'Flood in Viet Nam', country: 'Viet Nam', alert: 'Green', lat: 16.0, lon: 108.2, fromH: 6 * 24, toH: 5 },
]);
// An orange wildfire in Western Australia, and the season's green ones.
export const firesJson = (now: number) => gdacsJson(now, [
  { kind: 'WF', id: 900301, name: 'Forest fires in Australia', country: 'Australia', alert: 'Orange', lat: -31.5, lon: 116.0, fromH: 6 * 24, toH: 8, severity: 48200, text: 'Orange impact for forestfire in 48200 ha', unit: 'ha' },
  { kind: 'WF', id: 900302, name: 'Forest fires in Botswana', country: 'Botswana', alert: 'Green', lat: -19.5, lon: 23.5, fromH: 9 * 24, toH: 8, severity: 25900, text: 'Green impact for forestfire in 25900 ha', unit: 'ha' },
  { kind: 'WF', id: 900303, name: 'Forest fires in Brazil', country: 'Brazil', alert: 'Green', lat: -17.5, lon: -57.0, fromH: 12 * 24, toH: 8, severity: 12400, text: 'Green impact for forestfire in 12400 ha', unit: 'ha' },
  { kind: 'WF', id: 900304, name: 'Forest fires in Bolivia', country: 'Bolivia', alert: 'Green', lat: -16.0, lon: -62.0, fromH: 7 * 24, toH: 8, severity: 8100, text: 'Green impact for forestfire in 8100 ha', unit: 'ha' },
  { kind: 'WF', id: 900305, name: 'Forest fires in South Sudan', country: 'South Sudan', alert: 'Green', lat: 9.27, lon: 25.79, fromH: 2 * 24, toH: 8, severity: 5082, text: 'Green impact for forestfire in 5082 ha', unit: 'ha' },
  { kind: 'WF', id: 900306, name: 'Forest fires in Argentina', country: 'Argentina', alert: 'Green', lat: -31.3, lon: -64.5, fromH: 3 * 24, toH: 8, severity: 3200, text: 'Green impact for forestfire in 3200 ha', unit: 'ha' },
]);
// Kanlaon erupted five days ago; Semeru two months ago, too long to count.
export const eruptionsJson = (now: number) => gdacsJson(now, [
  { kind: 'VO', id: 900401, name: 'Eruption  Kanlaon', short: 'Kanlaon', country: 'Philippines', alert: 'Orange', lat: 10.412, lon: 123.132, fromH: 5 * 24, toH: 5 * 24, text: '', current: false },
  { kind: 'VO', id: 900390, name: 'Eruption  Semeru', short: 'Semeru', country: 'Indonesia', alert: 'Orange', lat: -8.108, lon: 112.922, fromH: 60 * 24, toH: 60 * 24, text: '', current: false },
]);

// HALIA's path from EONET: a point every six hours for four days, west-northwest
// across the Philippine Sea, strengthening from 45 to 110 knots.
export function tracksJson(now: number) {
  const start = Math.floor((now - 96 * H) / (6 * H)) * 6 * H;
  const halia = Array.from({ length: 16 }, (_, i) => ({ magnitudeValue: Math.round(45 + (65 * i) / 15), magnitudeUnit: 'kts', date: new Date(start + i * 6 * H).toISOString().replace('.000', ''), type: 'Point',
    coordinates: [Math.round((140.5 - (12.7 * i) / 15) * 10) / 10, Math.round((11.0 + (4.2 * i) / 15 + Math.sin(i / 3) * 0.3) * 10) / 10] }));
  const brisa = Array.from({ length: 5 }, (_, i) => ({ magnitudeValue: 35 + i * 2, magnitudeUnit: 'kts', date: new Date(now - (30 - i * 6) * H).toISOString().replace(/\.\d+Z$/, 'Z'), type: 'Point',
    coordinates: [-54.2 - i * 1.35, 19.8 + i * 0.65] }));
  const storm = (id: string, title: string, geometry: unknown[]) => ({ id, title, description: null, link: `https://eonet.gsfc.nasa.gov/api/v3/events/${id}`, closed: null,
    categories: [{ id: 'severeStorms', title: 'Severe Storms' }], sources: [{ id: 'JTWC', url: '' }], geometry });
  return { title: 'EONET Events', description: 'Natural events from EONET.', link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    events: [storm('EONET_DEMO1', 'Super Typhoon Halia', halia), storm('EONET_DEMO2', 'Tropical Storm Brisa', brisa)] };
}

// The US volcanoes above normal: Kilauea erupting (orange, watch), Great Sitkin and Ahyi restless (yellow, advisory).
export function elevatedJson(now: number) {
  const v = (obs: string, abbr: string, name: string, vnum: string, color: string, level: string, agoH: number) => {
    const at = now - agoH * H, id = `DOI-USGS-${abbr.toUpperCase()}-${new Date(at).toISOString().slice(0, 19)}+00:00`;
    return { obs_fullname: obs, obs_abbr: abbr, volcano_name: name, vnum, notice_type_cd: 'DU', notice_identifier: id, sent_utc: new Date(at).toISOString().slice(0, 19).replace('T', ' '),
      sent_unixtime: Math.round(at / 1000), color_code: color, alert_level: level, notice_url: `https://volcanoes.usgs.gov/hans-public/notice/${id}`,
      notice_data: `https://volcanoes.usgs.gov/hans-public/api/notice/getNotice/${id}` };
  };
  return [
    v('Hawaiian Volcano Observatory', 'hvo', 'Kilauea', '332010', 'ORANGE', 'WATCH', 6),
    v('Alaska Volcano Observatory', 'avo', 'Great Sitkin', '311120', 'YELLOW', 'ADVISORY', 20),
    v('Northern Mariana Islands', 'nmi', 'Ahyi Seamount', '284141', 'YELLOW', 'ADVISORY', 5 * 24),
  ];
}
// Where the US volcanoes are (a few of the list's hundred and seventy), with
// their height, their threat by the national warning system, picture and page.
export function usVolcanoesJson() {
  const v = (abbr: string, vnum: string, name: string, region: string, latitude: number, longitude: number, elevation: number, threat: string, page: string, image: string) =>
    ({ obs_abbr: abbr, obs_fullname: '', obs_email: '', volcano_cd: '', vnum, volcano_name: name, region, latitude, longitude, elevation_meters: elevation, boilerplate: '',
      volcano_url: page, volcano_image_url: image, nvews_threat: threat, icao_coordinates: '' });
  return [
    v('hvo', '332010', 'Kilauea', 'Hawaii', 19.421, -155.287, 1247, 'Very High Threat', 'https://www.usgs.gov/volcanoes/kilauea', 'https://volcanoes.usgs.gov/vsc/images/kilauea/kilauea.jpg'),
    v('hvo', '332020', 'Mauna Loa', 'Hawaii', 19.475, -155.608, 4170, 'Very High Threat', 'https://www.usgs.gov/volcanoes/mauna-loa', 'https://volcanoes.usgs.gov/vsc/images/mauna_loa/mauna_loa.jpg'),
    v('avo', '311120', 'Great Sitkin', 'Alaska - Aleutians', 52.0765, -176.1109, 1740, 'High Threat', 'https://www.avo.alaska.edu/activity/GreatSitkin.php', 'https://avo.alaska.edu/images/dbimages/display/1102983616_16_3.jpg'),
    v('avo', '313040', 'Spurr', 'Alaska - Cook Inlet', 61.299, -152.251, 3374, 'High Threat', 'https://www.avo.alaska.edu/activity/Spurr.php', ''),
    v('nmi', '284141', 'Ahyi Seamount', 'Mariana Islands', 20.42, 145.03, -55, 'Very Low Threat', 'https://www.usgs.gov/volcanoes/ahyi-seamount', 'https://volcanoes.usgs.gov/vsc/images/ahyi/ahyi-home.jpg'),
    v('cvo', '321050', 'St. Helens', 'Washington', 46.2, -122.18, 2549, 'Very High Threat', 'https://www.usgs.gov/volcanoes/mount-st.-helens', ''),
  ];
}
// The latest notice of each volcano above normal, as the observatories wrote
// them (USGS, public domain), sent when the list of elevated volcanoes says.
export function noticeJson(vnum: string, now: number) {
  const n = (type: string, agoH: number, synopsis: string, summary: string, image: string) => {
    const at = now - agoH * H;
    return { notice_type: type, sent_unixtime: Math.round(at / 1000), notice_url: 'https://volcanoes.usgs.gov/hans-public/', notice_sections: [{ vnum, synopsis, summary, vImage: image }] };
  };
  switch (vnum) {
    case '332010': return n('Daily Update', 6, 'HVO Kilauea ORANGE/WATCH - Intermittent lava flows have continued from the north vent over the past day. High fountaining remains a possibility today or anytime within the next few days.',
      '<p><strong>Overview:</strong></p><p>Lava flows have occurred intermittently over the past day from the north vent. Summit inflation that continued through most of yesterday shifted to deflation around 3 a.m. this morning. Seismic tremor at the summit is elevated, and SO<sub>2</sub> emission rates are elevated.</p>',
      'https://volcanoes.usgs.gov/vsc/images/kilauea/kilauea.jpg');
    case '311120': return n('Daily Update', 20, 'AVO Great Sitkin YELLOW/ADVISORY - Lava likely continues to erupt slowly within the summit crater.',
      '<p>Lava likely continues to erupt slowly within the summit crater of Great Sitkin Volcano. A few small earthquakes were detected at the volcano over the last day. The current eruption began in July 2021; since then, lava flows have filled most of the summit crater.</p>',
      'https://avo.alaska.edu/images/dbimages/display/1102983616_16_3.jpg');
    case '284141': return n('Weekly Update', 5 * 24, 'NMI Ahyi Seamount YELLOW/ADVISORY - No signs of unrest in satellite data; no significant geophysical signals.',
      '<p>Small plumes of discolored water were seen in the ocean above Ahyi this past week, drifting several hundred meters from the summit. They are likely associated with degassing and hydrothermal activity at the summit of the underwater volcano.</p>',
      'https://volcanoes.usgs.gov/vsc/images/ahyi/ahyi-home.jpg');
    default: return null;
  }
}
