// The frame and the viewer's choices within it: which systems and groups,
// the view, the look and the ground, how many layers. Kept in the browser
// under the board's store; applied to the board as they change.

import { PHONE, STACK_MAX } from '../radial/index.ts';
import { DEFAULT_THEME, THEMES, THEME_NAMES, applyColors, applyTheme, isLight, type ThemeName } from '../themes.ts';
import type { System } from '../model.ts';
import type { Board } from './context.ts';
import { AXES, BOARD_MODES, LOOK_DEFAULT, type Art, type BoardSettings, type LookFull } from './types.ts';

export function loadSettings(store: string | null): BoardSettings {
  if (!store) return {};
  try {
    const raw = localStorage.getItem(store);
    if (raw) return JSON.parse(raw) as BoardSettings;
  } catch { /* no storage: the frame as it comes */ }
  return {};
}

export const valid = (b: Board, ids?: string[]) => (ids ?? []).filter((id) => b.all.includes(id));
const defined = <T extends object>(o?: T) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>;
// The look in force: the viewer's choice over the shell's, over the defaults.
export const look = (b: Board): LookFull => ({ ...LOOK_DEFAULT, ...defined(b.frame.look), ...defined(b.local.look) });

// The host's groups as systems: built again when the host or the choices
// change, and each gets its view (sys-<group>) the first time.
function groupSystems(b: Board) {
  const list = b.host.byGroup?.(b.chosen, (sys, ch) => hiddenChannels(b, sys).includes(ch), b.t.noGroup) ?? [];
  for (const g of list) { b.sys[g.id] = g; if (!b.views[`sys-${g.id}`]) b.views[`sys-${g.id}`] = b.systemView(g.id); }
  return list.map((g) => g.id);
}

// Past this many objects a view cannot name each one: the ring of the orbit
// and of the list run out of room, the grid out of rows. On the groups axis
// the board then climbs a level: one object per group of the gear (a line of
// trams, a kind of aircraft, a job of hosts), each with the channels of the
// systems chosen read within that group, as a home's rooms are; each member
// is one zoom further, from a segment, a row or a dot that names it.
export const CROWD = 12;
const CROWD_ID = 'crowd:';
export const isCrowd = (id: string) => id.startsWith(CROWD_ID);
function crowdSystems(b: Board, members: string[]): string[] | null {
  const groups = hostGroups(b);
  if (members.length <= CROWD || groups.length < 2) return null;
  const left = new Set(members.map(groupOf)), list: { title: string; items: string[] }[] = [];
  for (const g of groups) {
    const items = g.items.map((i) => i.id).filter((i) => left.has(i));
    items.forEach((i) => left.delete(i));
    if (items.length) list.push({ title: g.title, items });
  }
  if (left.size) list.push({ title: b.t.noGroup, items: [...left] });
  if (list.length < 2) return null;
  return list.map(({ title, items }) => {
    const sys: System = { id: `${CROWD_ID}${title}`, title, channels: b.chosen.flatMap((sid) => {
      const hidden = hiddenChannels(b, sid);
      return b.sys[sid].channels.filter((ch) => !hidden.includes(ch.key)).map((ch) => ({
        key: `${sid}/${ch.key}`, name: ch.name, glyph: ch.glyph, read: (ctx) => ch.read({ ...ctx, groups: items }) }));
    }) };
    b.sys[sys.id] = sys;
    if (!b.views[`sys-${sys.id}`]) b.views[`sys-${sys.id}`] = b.systemView(sys.id);
    return sys.id;
  });
}

export function applySettings(b: Board) {
  const { frame, local, host } = b;
  const chosen = valid(b, local.systems).filter((id) => frame.systems.includes(id));
  b.chosen = chosen.length ? chosen : frame.systems;
  b.axis = host.byGroup && local.axis && AXES.includes(local.axis) ? local.axis : host.byGroup && frame.axis ? frame.axis : 'systems';
  if (b.axis === 'groups') {
    // The groups within the ones in force; the object of what is in no group only when none is chosen.
    const within = activeGroups(b);
    const members = groupSystems(b).filter((id) => !within || within.includes(groupOf(id)));
    b.ids = crowdSystems(b, members) ?? members;
  } else b.ids = b.chosen;
  b.mode = local.mode && BOARD_MODES.includes(local.mode) ? local.mode : frame.mode ?? 'grid';
  const theme = local.look?.theme ?? frame.look?.theme;
  if (theme === 'custom') applyColors(b.canvas, { ...frame.look?.colors, ...local.look?.colors });
  else applyTheme(b.canvas, theme && THEME_NAMES.includes(theme) ? theme : DEFAULT_THEME);
  applyGround(b);
}

// Keeps a patch of the viewer's choices (only what differs from the frame
// survives), applies them and repaints.
export function setSettings(b: Board, patch: BoardSettings) {
  const local: BoardSettings = { ...b.local, ...patch };
  for (const k of Object.keys(local) as (keyof BoardSettings)[]) {
    const v = local[k];
    if (v === undefined || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete local[k];
  }
  b.local = local;
  if (b.store) {
    try { if (Object.keys(local).length) localStorage.setItem(b.store, JSON.stringify(local)); else localStorage.removeItem(b.store); }
    catch { /* only to remember */ }
  }
  applySettings(b);
  b.repaint();
}

// What the board shows now, as the shell can ask for it.
export const settings = (b: Board): BoardSettings => ({ systems: b.chosen, mode: b.mode, axis: b.axis, start: startId(b) ?? undefined,
  groups: activeGroups(b), channels: b.local.channels, picks: b.local.picks, look: look(b), layers: layersShown(b), stack: stackShown(b) });

export const startId = (b: Board) => { const id = b.local.start ?? b.frame.start; return id && b.ids.includes(id) ? id : null; };

// ─── Groups ───

// The groups the gear offers: the host's, within the frame; and the ones in force.
export const hostGroups = (b: Board) => b.host.groups?.() ?? [];
export const frameGroups = (b: Board) => hostGroups(b).flatMap((g) => g.items.map((i) => i.id)).filter((a) => !b.frame.groups || b.frame.groups.includes(a));
export const activeGroups = (b: Board): string[] | undefined => {
  const offered = frameGroups(b);
  const chosen = (b.local.groups ?? []).filter((a) => offered.includes(a));
  return chosen.length ? chosen : b.frame.groups;
};
// The group a system of the groups axis stands for: its id, unless the host
// prefixed it ("room:kitchen" stands for "kitchen").
const groupOf = (id: string) => id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;

// Channels a system does not show; at least one stays (all of them hidden shows all of them).
export const hiddenChannels = (b: Board, id: string) => {
  const hidden = b.local.channels?.[id] ?? [];
  return b.sys[id].channels.every((ch) => hidden.includes(ch.key)) ? [] : hidden;
};

// ─── How much is stacked ───

// How many layers the Layers view stacks: the viewer's choice, the shell's, or every system.
export const layersShown = (b: Board) => { const n = b.local.layers ?? b.frame.layers; return n && n >= 1 ? Math.min(n, b.ids.length) : b.ids.length; };
// How many channels a system stacks as layers: the viewer's choice, the shell's, or three (two on a phone), never past STACK_MAX.
export const STACK_DEFAULT = PHONE ? 2 : 3;
export const stackShown = (b: Board) => { const n = b.local.stack ?? b.frame.stack; return Math.min(STACK_MAX, n && n >= 1 ? n : STACK_DEFAULT); };

// While something calls, what is fine folds into one quiet element; the
// viewer opens it on demand, kept with the viewer's settings.
export const calmOpen = (b: Board) => b.local.calm === 'open';

// ─── The ground: a glow, an abstract ground or a photo behind every view ───

// The three abstract grounds, as CSS over the theme's own tokens: they weigh
// nothing, stay sharp at any size and follow a light or a dark theme alike.
// Aurora: three veils of color, teal and violet above, blue below (brighter
// ones on a light ground, where a deep hue would go muddy). Contours: fine
// concentric lines from beyond the bottom-right corner, in the ink, fading as
// they go. Grain: a light from the top-left, a vignette (lighter on a light
// ground) and film grain, an SVG noise tile the browser draws, gray so it
// shows on either ground.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .3 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`)}")`;
const veilOf = (color: string, p: number) => `color-mix(in srgb, ${color} ${p}%, transparent)`;
export function artBackdrop(art: Art, light = false): string {
  switch (art) {
    case 'aurora': return [
      `radial-gradient(60% 55% at 16% 10%, ${veilOf(light ? '#49d2de' : '#35b6c6', light ? 42 : 38)} 0%, transparent 72%)`,
      `radial-gradient(55% 50% at 86% 14%, ${veilOf(light ? '#a394ff' : '#7f6cf0', light ? 40 : 34)} 0%, transparent 72%)`,
      `radial-gradient(80% 60% at 50% 104%, ${veilOf(light ? '#7cc4f0' : '#2a6b9a', light ? 44 : 32)} 0%, transparent 72%)`,
      'var(--bg)'].join(', ');
    case 'contours': return [
      `radial-gradient(circle at 78% 112%, transparent 30%, ${veilOf('var(--bg)', 100)} 95%)`,
      `repeating-radial-gradient(circle at 78% 112%, transparent 0 42px, ${veilOf('var(--ink)', 10)} 42px 44px)`,
      'var(--bg)'].join(', ');
    case 'grain': return [
      `${GRAIN} 0 0 / 240px 240px repeat`,
      `radial-gradient(120% 100% at 50% 42%, transparent 38%, rgb(0 0 0 / ${light ? '.16' : '.6'}) 100%)`,
      `linear-gradient(135deg, ${veilOf('var(--ink)', light ? 8 : 14)} 0%, transparent 55%)`,
      'var(--bg)'].join(', ');
  }
}
// Whether the ground in force is light: the theme's, or the viewer's own colors'.
export function lightGround(b: Board) {
  const lk = look(b);
  const bg = lk.theme === 'custom' ? lk.colors?.bg ?? THEMES[DEFAULT_THEME].bg : (THEMES[lk.theme as ThemeName] ?? THEMES[DEFAULT_THEME]).bg;
  return isLight(bg);
}

// On the mount as --backdrop (each view paints it, so it zooms with the view).
const photoKey = (b: Board) => b.store ? `${b.store}-photo` : null;
export const uploadedPhoto = (b: Board) => { const key = photoKey(b); try { return key ? localStorage.getItem(key) ?? '' : ''; } catch { return ''; } };
const cssUrl = (u: string) => `url("${u.replace(/["\\\n]/g, (c) => encodeURIComponent(c))}")`;
export function applyGround(b: Board) {
  const lk = look(b), st = b.canvas.style;
  const src = lk.ground === 'photo' ? (lk.photo === 'upload' ? uploadedPhoto(b) : lk.photo) : '';
  const ground = lk.ground === 'glow' || lk.ground === 'art' || (lk.ground === 'photo' && src) ? lk.ground : 'flat';
  b.canvas.dataset.ground = ground;
  if (ground === 'art') b.canvas.dataset.art = lk.art; else delete b.canvas.dataset.art;
  b.canvas.dataset.faces = ground === 'flat' ? 'flat' : lk.faces;
  if (ground === 'flat') { for (const k of ['--backdrop', '--backdrop-blur']) st.removeProperty(k); return; }
  const veil = (p: number) => `color-mix(in srgb, var(--bg) ${Math.round(p * 100)}%, transparent)`;
  st.setProperty('--backdrop', ground === 'glow'
    ? `radial-gradient(130% 130% at 32% 22%, color-mix(in srgb, ${lk.glow} 62%, var(--bg)) 0%, color-mix(in srgb, ${lk.glow} 26%, var(--bg)) 36%, var(--bg) 78%)`
    : ground === 'art' ? artBackdrop(lk.art, lightGround(b))
    : `linear-gradient(${veil(lk.dim)}, ${veil(lk.dim)}), ${cssUrl(src)} center / cover no-repeat, var(--bg)`);
  st.setProperty('--backdrop-blur', `${ground === 'photo' ? lk.blur : 0}px`);
}
// A photo from this browser: at most 1920 px on its long side, as a JPEG, kept apart from the settings.
export async function keepPhoto(b: Board, file: File): Promise<boolean> {
  const key = photoKey(b);
  if (!key) return false;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55]) {
      try { localStorage.setItem(key, c.toDataURL('image/jpeg', q)); return true; } catch { /* too big: try smaller */ }
    }
    return false;
  } catch { return false; } finally { URL.revokeObjectURL(url); }
}
