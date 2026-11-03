// A stormy day, recorded: the feeds' answers in their own shapes, built
// around "now" so the day rings and the "3 h ago" read right. The demo source
// runs the real parsers over them: what the parsers accept is what the live
// feeds send.

const H = 3_600_000, MIN = 60_000;
// SWPC writes "YYYY-MM-DD HH:MM:SS.000" in UTC.
const swpc = (at: number) => new Date(at).toISOString().replace('T', ' ').replace('Z', '');
const floorTo = (at: number, step: number) => Math.floor(at / step) * step;

export function scalesJson(now: number) {
  const day = (d: number) => new Date(now + d * 24 * H).toISOString().slice(0, 10);
  const stamp = new Date(now).toISOString().slice(11, 19);
  return {
    '-1': { DateStamp: day(-1), TimeStamp: '00:00:00', R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '1', Text: 'minor' } },
    '0': { DateStamp: day(0), TimeStamp: stamp, R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '2', Text: 'moderate' } },
    '1': { DateStamp: day(1), TimeStamp: '00:00:00', R: { Scale: null, Text: null, MinorProb: '35', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '2', Text: 'moderate' } },
    '2': { DateStamp: day(2), TimeStamp: '00:00:00', R: { Scale: null, Text: null, MinorProb: '25', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '1', Text: 'minor' } },
    '3': { DateStamp: day(3), TimeStamp: '00:00:00', R: { Scale: null, Text: null, MinorProb: '20', MajorProb: '1' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '0', Text: 'none' } },
  };
}

// Two days of Kp every three hours: calm, then a storm building through today.
export function kpJson(now: number) {
  const rows: string[][] = [['time_tag', 'Kp', 'a_running', 'station_count']];
  const start = floorTo(now, 3 * H) - 16 * 3 * H;
  for (let i = 0; i <= 16; i++) {
    const at = start + i * 3 * H, h = (now - at) / H;
    const kp = h > 18 ? 1.67 + (i % 3) * 0.33 : h > 9 ? 3 + (18 - h) * 0.15 : 5.33 + (9 - h) * 0.11;
    rows.push([swpc(at), kp.toFixed(2), String(Math.round(kp * 7)), '8']);
  }
  return rows;
}

// A day of solar wind, a row a minute: a CME arrives six hours ago and the
// speed jumps from 380 to 620 km/s; Bz turns south an hour later.
export function plasmaJson(now: number) {
  const rows: string[][] = [['time_tag', 'density', 'speed', 'temperature']];
  const start = floorTo(now, MIN) - 24 * H;
  for (let at = start; at <= now; at += MIN) {
    const h = (now - at) / H;
    const speed = h > 6 ? 380 + 8 * Math.sin(h) : h > 5.5 ? 380 + (6 - h) * 480 : 620 - (5.5 - h) * 4 + 6 * Math.sin(h * 7);
    const density = h > 6 ? 4.2 + Math.sin(h * 2) : 11 - (6 - h) * 0.8;
    rows.push([swpc(at), density.toFixed(2), speed.toFixed(1), String(Math.round(60000 + speed * 100))]);
  }
  return rows;
}
export function magJson(now: number) {
  const rows: string[][] = [['time_tag', 'bx_gsm', 'by_gsm', 'bz_gsm', 'lon_gsm', 'lat_gsm', 'bt']];
  const start = floorTo(now, MIN) - 24 * H;
  for (let at = start; at <= now; at += MIN) {
    const h = (now - at) / H;
    const bz = h > 5 ? 1.5 + 2 * Math.sin(h * 3) : -14 + 3 * Math.sin(h * 5);
    const bt = Math.abs(bz) + 6;
    rows.push([swpc(at), '2.10', '-3.40', bz.toFixed(2), '211.0', (-Math.asin(bz / bt) * 180 / Math.PI).toFixed(1), bt.toFixed(2)]);
  }
  return rows;
}

// Six hours of X-rays: a C-class background and an M1.2 flare three hours ago.
export function xraysJson(now: number) {
  const rows: { time_tag: string; satellite: number; flux: number; observed_flux: number; electron_correction: number; electron_contaminaton: boolean; energy: string }[] = [];
  const start = floorTo(now, MIN) - 6 * H;
  for (let at = start; at <= now; at += MIN) {
    const h = (now - at) / H;
    const flare = h > 3.3 ? 0 : h > 3.1 ? (3.3 - h) * 5.5e-5 : 1.2e-4 * Math.exp(-(3.1 - h) * 2.2);
    const long = 4.1e-6 + flare, short = long / 12;
    const iso = new Date(at).toISOString().replace('.000Z', 'Z');
    rows.push({ time_tag: iso, satellite: 19, flux: short, observed_flux: short, electron_correction: 0, electron_contaminaton: false, energy: '0.05-0.4nm' });
    rows.push({ time_tag: iso, satellite: 19, flux: long, observed_flux: long, electron_correction: 0, electron_contaminaton: false, energy: '0.1-0.8nm' });
  }
  return rows;
}

// The day's earthquakes: an M7.1 in the Kermadec Islands three hours ago
// (tsunami watch), an M4.6 in San Juan, and the usual dozen.
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

// A warm, windy afternoon with a storm coming in: Open-Meteo's shape, local times without a zone.
export function weatherJson(now: number) {
  const offset = -3 * 3600;
  const local = (at: number) => new Date(at + offset * 1000).toISOString().slice(0, 16);
  const hourStart = floorTo(now, H);
  const hours = Array.from({ length: 36 }, (_, i) => hourStart - 24 * H + i * H);
  const tempAt = (at: number) => { const h = ((at + offset * 1000) / H) % 24; return 22 + 7 * Math.sin((h - 9) / 24 * Math.PI * 2); };
  const probAt = (at: number) => { const ahead = (at - now) / H; return ahead < 0 ? 5 : ahead < 1 ? 40 : ahead < 4 ? 85 : 60; };
  const mmAt = (at: number) => { const ahead = (at - now) / H; return ahead < 1 ? 0 : ahead < 4 ? 3.1 : ahead < 6 ? 1.2 : 0; };
  const uvAt = (at: number) => { const h = ((at + offset * 1000) / H) % 24; return Math.max(0, 9 * Math.sin((h - 6) / 13 * Math.PI)); };
  return {
    latitude: -34.625, longitude: -58.375, generationtime_ms: 0.4, utc_offset_seconds: offset, timezone: 'America/Argentina/Buenos_Aires', timezone_abbreviation: 'GMT-3', elevation: 25,
    current_units: { time: 'iso8601', interval: 'seconds', temperature_2m: '°C', relative_humidity_2m: '%', apparent_temperature: '°C', precipitation: 'mm', weather_code: 'wmo code', wind_speed_10m: 'km/h', wind_direction_10m: '°', wind_gusts_10m: 'km/h', uv_index: '' },
    current: { time: local(floorTo(now, 15 * MIN)), interval: 900, temperature_2m: Math.round(tempAt(now) * 10) / 10, relative_humidity_2m: 71, apparent_temperature: Math.round((tempAt(now) + 2.4) * 10) / 10, precipitation: 0, weather_code: 3,
      // The UV now is fixed (not the hour's), so the recorded day calls the same at any time of day.
      wind_speed_10m: 38.2, wind_direction_10m: 152, wind_gusts_10m: 64.1, uv_index: 2.7 },
    hourly_units: { time: 'iso8601', temperature_2m: '°C', precipitation_probability: '%', precipitation: 'mm', uv_index: '' },
    hourly: { time: hours.map(local), temperature_2m: hours.map((at) => Math.round(tempAt(at) * 10) / 10), precipitation_probability: hours.map(probAt), precipitation: hours.map(mmAt), uv_index: hours.map((at) => Math.round(uvAt(at) * 100) / 100) },
    daily_units: { time: 'iso8601', uv_index_max: '', temperature_2m_min: '°C', temperature_2m_max: '°C' },
    daily: { time: [local(now).slice(0, 10)], uv_index_max: [8.9], temperature_2m_min: [15.2], temperature_2m_max: [29.1] },
  };
}
export function airJson(now: number) {
  return { latitude: -34.6, longitude: -58.4, generationtime_ms: 0.2, utc_offset_seconds: -10800, timezone: 'America/Argentina/Buenos_Aires', timezone_abbreviation: 'GMT-3', elevation: 25,
    current_units: { time: 'iso8601', interval: 'seconds', european_aqi: 'EAQI', us_aqi: 'USAQI', pm2_5: 'μg/m³', pm10: 'μg/m³', ozone: 'μg/m³' },
    current: { time: new Date(floorTo(now, H) - 10800 * 1000).toISOString().slice(0, 16), interval: 3600, european_aqi: 28, us_aqi: 41, pm2_5: 9.8, pm10: 18.4, ozone: 61 } };
}

// Status pages: GitHub with Actions down and an open incident; the rest fine.
export function statusJson(slug: string, now: number) {
  const iso = (agoMin: number) => new Date(now - agoMin * MIN).toISOString();
  const comp = (name: string, status: string, position: number, agoMin = 60 * 24 * 6) => ({ id: `${slug}-${position}`, name, status, created_at: iso(60 * 24 * 400), updated_at: iso(agoMin), position, description: null, showcase: true, start_date: null, group_id: null, page_id: slug, group: false, only_show_if_degraded: false });
  const page = { id: slug, name: slug, url: `https://status.example/${slug}`, time_zone: 'Etc/UTC', updated_at: iso(2) };
  if (slug === 'github') {
    return { page: { ...page, name: 'GitHub', url: 'https://www.githubstatus.com' }, status: { indicator: 'major', description: 'Partial System Outage' },
      components: [comp('Git Operations', 'operational', 1), comp('API Requests', 'operational', 2), comp('Webhooks', 'degraded_performance', 3, 38), comp('Issues', 'operational', 4), comp('Pull Requests', 'operational', 5),
        comp('Actions', 'partial_outage', 6, 41), comp('Packages', 'operational', 7), comp('Pages', 'operational', 8), comp('Codespaces', 'operational', 9), comp('Copilot', 'operational', 10)],
      incidents: [{ id: 'inc-demo', name: 'Incident with Actions and Webhooks', status: 'identified', created_at: iso(44), updated_at: iso(12), monitoring_at: null, resolved_at: null, impact: 'major', shortlink: 'https://www.githubstatus.com/incidents/demo', started_at: iso(44), page_id: 'github',
        incident_updates: [{ id: 'u2', status: 'identified', body: 'We have identified the cause of delayed Actions workflow runs and webhook deliveries and are applying a fix. Queued jobs will run once it lands.', created_at: iso(12), updated_at: iso(12), display_at: iso(12), incident_id: 'inc-demo' },
          { id: 'u1', status: 'investigating', body: 'We are investigating reports of delayed Actions workflow runs.', created_at: iso(44), updated_at: iso(44), display_at: iso(44), incident_id: 'inc-demo' }], components: [] }],
      scheduled_maintenances: [] };
  }
  const names: Record<string, string[]> = {
    cloudflare: ['Cloudflare Sites and Services', 'Cloudflare Dashboard', 'Cloudflare API', 'Workers', 'R2', 'Zero Trust'],
    openai: ['API', 'ChatGPT', 'Sora', 'Playground'],
    npm: ['Package Publishing', 'Package Installation', 'Website', 'Login'],
    vercel: ['Deployments', 'Edge Network', 'Serverless Functions', 'Dashboard', 'Domains'],
  };
  const list = names[slug] ?? ['API', 'Website', 'Dashboard'];
  return { page: { ...page, name: slug }, status: { indicator: 'none', description: 'All Systems Operational' }, components: list.map((name, i) => comp(name, 'operational', i + 1)), incidents: [], scheduled_maintenances: [] };
}
