import { listOf, num, type Alert, type GeoPlot, type Reading, type Seg, type Tone } from '@zumer/pulse';
import { kindOf, metres, rank, unplanned, type Camera, type Disruption } from './feeds.ts';
import { signCalls, type Sign } from './feeds-ca.ts';
import { isDark, liveCameras, nearestCamera, watched, WATCH_METRES, type Act, type CameraSource } from './source.ts';
import { t } from './strings.ts';

// A city's roads read as a control room would: what is happening now, with
// the camera nearest it (live where the camera streams, its still elsewhere); the corridors and the works; the
// cameras themselves, and above all the ones that watch an incident. The
// alerts follow TfL's own severity for what was not planned (works and events
// never call); a camera calls only when it watches one and has gone dark or
// frozen. Each camera is an object of its own, opened from any list.

export type Channel = { key: string; name: string; glyph: string; read: (s: CameraSource) => Reading | null };
export type System = { id: string; title: string; channels: Channel[] };

const g = {
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  closed: 'M5 5l14 14 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  road: 'M8 3L5 21 M16 3l3 18 M12 5v3 M12 11v3 M12 17v3',
  works: 'M3 21h18 M6 21l4-12h4l4 12 M8 15h8',
  camera: 'M4 8h11v8H4z M15 11l5-3v8l-5-3 M7 16l-2 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  sign: 'M3 5h18v10H3z M8 15v6 M16 15v6 M7 9h10 M7 12h6',
};

const STALE = 20 * 60_000;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const got = (level: 1 | 2, big: string, label: string, why: string, key: string, acts: Act[] = []): Alert => ({ level, big, label, why, key, verb: t.gotIt, acts });
const toneOf = (d: Disruption): Tone | undefined => (rank(d) <= 1 ? 'critical' : rank(d) === 2 || d.closure ? 'warn' : undefined);
// How loud an unplanned disruption calls: TfL's severe or serious loudly, moderate (or a closure) softly.
const levelOf = (d: Disruption): 1 | 2 | 0 => (!unplanned(d) ? 0 : rank(d) <= 1 ? 2 : rank(d) === 2 || d.closure ? 1 : 0);
// "[A503] Seven Sisters Road (Eastbound) at the junction of Durham Road - Road is closed…": the place, before the dash.
export const placeOf = (d: Disruption) => (d.comments.split(' - ')[0] || d.location).replace(/^\[([^\]]+)\]\s*/, '$1 ').trim();
const whatOf = (d: Disruption) => d.subCategory || d.category;
const sentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim().replace(/[.!?]$/, '');
const incidents = (s: CameraSource) => s.disruptions.filter(unplanned).sort((a, b) => rank(a) - rank(b) || Number(b.closure) - Number(a.closure) || kindOf(a) - kindOf(b) || b.modified - a.modified);
const camOf = (s: CameraSource, d: Disruption) => nearestCamera(s.cameras.values(), d.lat, d.lon, WATCH_METRES, isDark(s));
// A camera's picture: its still, and its live stream when it has one.
const pictureOf = (s: CameraSource, c: Camera) => ({ src: s.picture(c), alt: c.name, id: c.id, video: s.stills.get(c.id) === 0 ? undefined : c.stream });
const clip = (c: Camera): Act[] => (c.video ? [{ ids: [], kind: 'open', url: c.video }] : []);
// A camera's still in words: fresh, frozen since when, dark, or off.
export function stillOf(s: CameraSource, c: Camera, now = Date.now()): { ok: boolean; text: string; word?: string } {
  if (!c.available) return { ok: false, text: 'is switched off', word: 'Off' };
  const at = s.stills.get(c.id);
  if (at === undefined) return { ok: true, text: '' };
  if (at === 0) return { ok: false, text: t.dark, word: 'Dark' };
  return now - at > STALE ? { ok: false, text: t.frozen(t.ago(now - at)), word: 'Frozen' } : { ok: true, text: `picture ${t.ago(now - at)} old` };
}
// A row naming a disruption: it opens the camera that watches it.
const incidentSeg = (s: CameraSource, d: Disruption): Seg => {
  const c = camOf(s, d)?.camera;
  return { label: `${whatOf(d)} · ${placeOf(d)}`, on: levelOf(d) === 0, id: d.id, to: c?.id };
};
const plotOf = (d: Disruption): GeoPlot => ({ lat: d.lat, lon: d.lon, label: `${whatOf(d)} · ${placeOf(d)}`, id: d.id, tone: toneOf(d), size: rank(d) <= 2 ? 0.8 : 0.4 });
const cameraPlot = (c: Camera): GeoPlot => ({ lat: c.lat, lon: c.lon, label: c.name, id: c.id, on: c.available, size: 0.25 });

export const incidentsSystem: System = { id: 'incidents', title: 'Incidents', channels: [
  { key: 'worst', name: 'Worst', glyph: g.alert, read: (s) => {
    const list = incidents(s), d = list[0];
    if (!d) return s.disruptions.length ? { kind: 'p', v: 0, ids: ['disruptions'], big: 'None', label: 'nothing unplanned on the roads' } : null;
    const near = camOf(s, d), c = near?.camera, lvl = levelOf(d);
    return { kind: 'p', v: clamp((4 - rank(d)) / 4), ids: [d.id, ...(c ? [c.id] : [])], big: whatOf(d), name: undefined,
      label: `${placeOf(d)}${c ? ` · ${c.stream && c.available ? 'live' : 'camera'} ${num(near!.m, 0)} m away` : ` · ${t.noCamera}`}`,
      image: c?.available ? pictureOf(s, c) : undefined,
      link: c?.video ? { label: t.watchClip, on: true, id: c.id, act: clip(c)[0] } : undefined,
      alert: lvl ? got(lvl, whatOf(d), d.severity.toLowerCase(), t.incidentWhy(placeOf(d), sentence(d.update || d.comments.split(' - ').slice(1).join(' - ') || d.comments)), `incident:${d.id}`) : undefined };
  } },
  // The worst incident a camera sees, live where it streams: what can be looked at, not only read.
  { key: 'seen', name: 'On camera', glyph: g.camera, read: (s) => {
    // As bad as it gets among what a camera sees; at the same severity, a camera that streams first.
    const seen = incidents(s).map((d) => ({ d, near: camOf(s, d) })).filter((x) => x.near?.camera.available && s.stills.get(x.near.camera.id) !== 0)
      .sort((a, b) => rank(a.d) - rank(b.d) || Number(!!b.near!.camera.stream) - Number(!!a.near!.camera.stream))[0];
    if (!seen) return null;
    const { d, near } = seen, c = near!.camera;
    return { kind: 'p', v: clamp((4 - rank(d)) / 4), ids: [d.id, c.id], big: whatOf(d), label: `${placeOf(d)} · ${c.stream ? 'live' : 'camera'} ${num(near!.m, 0)} m away`,
      image: pictureOf(s, c), link: c.video ? { label: t.watchClip, on: true, id: c.id, act: clip(c)[0] } : undefined };
  } },
  { key: 'map', name: 'On the map', glyph: g.map, read: (s) => {
    const list = incidents(s);
    if (!s.disruptions.length) return null;
    const cams = watched(s);
    return { kind: 'p', v: clamp(list.length / 20), ids: ['disruptions', ...list.map((d) => d.id)], big: `${list.length}`, label: `unplanned · ${s.disruptions.length - list.length} planned`,
      map: { center: s.city.center, zoom: s.city.zoom, plots: [...cams.map(cameraPlot), ...list.map(plotOf)] }, list: list.map((d) => incidentSeg(s, d)) };
  } },
  { key: 'closures', name: 'Closures', glyph: g.closed, read: (s) => {
    if (!s.disruptions.length) return null;
    const list = s.disruptions.filter((d) => d.closure).sort((a, b) => rank(a) - rank(b));
    return { kind: 'p', v: clamp(list.length / 10), ids: ['disruptions', ...list.map((d) => d.id)], big: `${list.length}`, label: list.length ? listOf(list.slice(0, 2).map(placeOf)) : 'roads closed', list: list.map((d) => incidentSeg(s, d)) };
  } },
] };

const signSeg = (x: Sign): Seg => ({ label: `${x.lines.join(' ')} · ${x.name}`, on: !signCalls(x), id: x.id });
export const roadsSystem: System = { id: 'roads', title: 'Roads', channels: [
  { key: 'signs', name: 'Signs', glyph: g.sign, read: (s) => {
    if (!s.signs.length) return null;
    const showing = s.signs.filter((x) => x.lines.length), calling = showing.filter(signCalls);
    const segs = (calling.length ? calling : showing).slice(0, 60).map(signSeg);
    return { kind: 's', segs, ids: ['signs', ...calling.map((x) => x.id)], list: showing.map(signSeg), big: calling.length ? `${calling.length}` : `${showing.length}`,
      label: calling.length ? `signs warn of something now · ${calling[0].lines.slice(0, 2).join(' ')}` : `signs with a message · ${s.signs.length - showing.length} blank`,
      alert: calling.length ? got(1, calling[0].lines[0], 'the signs say', t.signWhy(calling[0].name, calling[0].lines.join(' ')), `sign:${calling[0].id}:${calling[0].lines.join('|')}`) : undefined };
  } },
  { key: 'corridors', name: 'Corridors', glyph: g.road, read: (s) => {
    if (!s.roads.length) return null;
    const bad = s.roads.filter((r) => r.status !== 'Good');
    const segs: Seg[] = s.roads.map((r) => ({ label: `${r.name} · ${r.description.toLowerCase()}`, on: r.status === 'Good', id: `road:${r.id}` }));
    const worst = bad.find((r) => /closure|severe/i.test(r.status)) ?? bad.find((r) => /serious/i.test(r.status));
    return { kind: 's', segs, ids: s.roads.map((r) => `road:${r.id}`), list: segs, big: `${s.roads.length - bad.length} of ${s.roads.length}`, label: bad.length ? `flowing · ${listOf(bad.slice(0, 2).map((r) => r.name))} not` : 'flowing',
      alert: worst ? { ...got(/closure|severe/i.test(worst.status) ? 2 : 1, worst.name, worst.status.toLowerCase(), t.roadWhy(worst.name, worst.description.toLowerCase()), `road:${worst.id}:${worst.status}`), fail: s.roads.map((r, i) => (r.status === 'Good' ? -1 : i)).filter((i) => i >= 0) } : undefined };
  } },
  { key: 'works', name: 'Works', glyph: g.works, read: (s) => {
    if (!s.disruptions.length) return null;
    const list = s.disruptions.filter((d) => !unplanned(d)).sort((a, b) => rank(a) - rank(b));
    const heavy = list.filter((d) => rank(d) <= 2);
    return { kind: 'p', v: clamp(heavy.length / 20), ids: ['disruptions'], big: `${list.length}`, label: `planned · ${heavy.length} with delays`, list: list.map((d) => incidentSeg(s, d)) };
  } },
] };

export const camerasSystem: System = { id: 'cameras', title: 'Cameras', channels: [
  { key: 'watching', name: 'Watching', glyph: g.eye, read: (s) => {
    if (!s.cameras.size || !s.disruptions.length) return null;
    const list = incidents(s).map((d) => ({ d, c: camOf(s, d)?.camera })).filter((x): x is { d: Disruption; c: Camera } => !!x.c);
    const seen = new Set<string>(), rows = list.filter((x) => !seen.has(x.c.id) && seen.add(x.c.id));
    const segs: Seg[] = rows.map(({ d, c }) => { const st = stillOf(s, c); return { label: `${c.name} · ${whatOf(d)}${st.text ? ` · ${st.text}` : ''}`, on: st.ok, id: c.id, to: c.id }; });
    const bad = rows.find(({ c }) => !stillOf(s, c).ok);
    return { kind: 's', segs, ids: ['cameras', ...rows.map(({ c }) => c.id)], list: segs, big: `${rows.length}`, label: `cameras on an incident · ${incidents(s).length - rows.length} with none near`,
      alert: bad ? { ...got(1, stillOf(s, bad.c).word ?? 'Blind', bad.c.name, t.cameraWhy(bad.c.name, whatOf(bad.d).toLowerCase(), stillOf(s, bad.c).text), `blind:${bad.c.id}`), fail: rows.map(({ c }, i) => (stillOf(s, c).ok ? -1 : i)).filter((i) => i >= 0) } : undefined };
  } },
  // A camera that streams, live: the working one nearest the worst incident; every live one a row.
  { key: 'live', name: 'Live', glyph: g.camera, read: (s) => {
    const list = liveCameras(s), first = list.find((x) => s.stills.get(x.c.id) !== 0);
    if (!first) return null;
    const worst = incidents(s)[0], c = first.c;
    const segs: Seg[] = list.map(({ c: x, m }) => ({ label: `${x.name} · ${m < 1000 ? `${num(m, 0)} m` : `${num(m / 1000, 1)} km`}${s.stills.get(x.id) === 0 ? ' · dark' : ''}`, on: s.stills.get(x.id) !== 0, id: x.id, to: x.id }));
    return { kind: 'p', v: clamp(list.filter((x) => s.stills.get(x.c.id) !== 0).length / Math.max(1, list.length)), ids: [c.id], big: c.name.split(/\s+(?=at\b|AT\b)/)[0] || c.name, name: undefined,
      label: worst ? `the live camera nearest ${whatOf(worst).toLowerCase()}, ${first.m < 1000 ? `${num(first.m, 0)} m` : `${num(first.m / 1000, 1)} km`} away` : `${list.length} cameras streaming`,
      image: pictureOf(s, c), list: segs };
  } },
  { key: 'available', name: 'Available', glyph: g.camera, read: (s) => {
    if (!s.cameras.size) return null;
    const all = [...s.cameras.values()].sort((a, b) => a.name.localeCompare(b.name)), up = all.filter((c) => c.available);
    const segs: Seg[] = all.map((c) => ({ label: c.name, on: c.available, id: c.id, to: c.id }));
    return { kind: 's', segs, ids: ['cameras'], big: `${up.length} of ${all.length}`, label: `switched on${all.some((c) => c.stream) ? ` · ${up.filter((c) => c.stream).length} live` : ''}`, list: segs };
  } },
  { key: 'map', name: 'On the map', glyph: g.map, read: (s) => {
    if (!s.cameras.size) return null;
    const all = [...s.cameras.values()];
    return { kind: 'p', v: clamp(all.filter((c) => c.available).length / all.length), ids: ['cameras'], big: `${all.length}`, label: `traffic cameras · ${all.filter((c) => c.stream).length} live`, map: { center: s.city.center, zoom: s.city.zoom, plots: all.map(cameraPlot) } };
  } },
] };

export const systemsOf = (): System[] => [incidentsSystem, roadsSystem, camerasSystem];

// ─── One camera as an object ───

const nearby = (s: CameraSource, c: Camera) => s.disruptions.map((d) => ({ d, m: metres(c.lat, c.lon, d.lat, d.lon) })).filter((x) => x.m <= 1000).sort((a, b) => rank(a.d) - rank(b.d) || a.m - b.m);
const cameraChannels: { key: string; name: string; glyph: string; read: (s: CameraSource, c: Camera) => Reading | null }[] = [
  { key: 'picture', name: 'Picture', glyph: g.camera, read: (s, c) => {
    const st = stillOf(s, c), watching = nearby(s, c).find((x) => unplanned(x.d) && x.m <= 600);
    return { kind: 'p', v: st.ok ? 1 : 0, ids: [c.id], big: c.view ? `Looking ${c.view.toLowerCase()}` : c.name, label: `${c.name}${st.text ? ` · ${st.text}` : ''}`,
      image: c.available ? pictureOf(s, c) : undefined,
      link: c.video ? { label: t.watchClip, on: true, id: c.id, act: clip(c)[0] } : undefined,
      alert: watching && !st.ok ? got(1, st.word ?? 'Blind', 'blind spot', t.cameraWhy(c.name, whatOf(watching.d).toLowerCase(), st.text), `blind:${c.id}`) : undefined };
  } },
  { key: 'nearby', name: 'Nearby', glyph: g.alert, read: (s, c) => {
    const list = nearby(s, c), worst = list.find((x) => levelOf(x.d));
    const segs: Seg[] = list.map(({ d, m }) => ({ label: `${whatOf(d)} · ${num(m, 0)} m · ${placeOf(d)}`, on: levelOf(d) === 0, id: d.id }));
    return { kind: 'p', v: clamp(list.length / 5), ids: [c.id, ...list.map((x) => x.d.id)], big: `${list.length}`, label: list.length ? `within a kilometre · ${whatOf(list[0].d).toLowerCase()}` : 'nothing within a kilometre', list: segs,
      alert: worst ? got(levelOf(worst.d) as 1 | 2, whatOf(worst.d), `${num(worst.m, 0)} m away`, t.incidentWhy(placeOf(worst.d), sentence(worst.d.update || worst.d.comments)), `incident:${worst.d.id}`) : undefined };
  } },
  { key: 'where', name: 'Where', glyph: g.pin, read: (s, c) => ({ kind: 'p', v: 1, ids: [c.id], big: c.name.split(/\s+(?=[A-Z][a-z])/)[0] || c.name, label: c.name,
    map: { center: { lat: c.lat, lon: c.lon }, zoom: 15, plots: [...nearby(s, c).map((x) => plotOf(x.d)), { ...cameraPlot(c), size: 1 }] } }) },
];
export const cameraObject = (s: CameraSource, id: string): System | null => {
  const c = s.cameras.get(id);
  if (!c) return null;
  return { id, title: c.name, channels: cameraChannels.map((ch) => ({ key: ch.key, name: ch.name, glyph: ch.glyph, read: (src: CameraSource) => { const now = src.cameras.get(id); return now ? ch.read(src, now) : null; } })) };
};
