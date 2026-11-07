// The gear: what this screen shows. A panel in four tabs (content, board,
// look, tuning) behind a button on the board. Changes apply as they are made
// and are kept in this browser; "Back to defaults" returns to the frame.

import { STACK_MAX, esc } from '../radial/index.ts';
import { DEFAULT_THEME, THEMES, THEME_NAMES, applyColors, type Theme, type ThemeName } from '../themes.ts';
import { CONTROLS, DEFAULTS, GROUPS, fmt, resetTune, setTune, tune, tuneText, tuned, type Tune, type TuneGroup } from '../tune.ts';
import type { Board } from './context.ts';
import { activeElement, setHTML } from './draw.ts';
import {
  STACK_DEFAULT, activeGroups, applyGround, artBackdrop, frameGroups, hostGroups, keepPhoto, lightGround, look, setSettings, stackShown, startId, uploadedPhoto,
} from './settings.ts';
import {
  ARTS, AXES, BOARD_MODES, DAYS, DIALS, ENDS, FACES, GROUNDS, LOOK_DEFAULT, MONTHS, SETTINGS_TABS, TIMES,
  type Art, type Axis, type BoardMode, type Look, type Tab,
} from './types.ts';

const COLOR_KEYS: (keyof Theme)[] = ['bg', 'ink', 'muted', 'dim', 'line', 'minor', 'critical'];
// A theme as a small disc: its ground, a ring at rest, its text and its two alerts.
const swatch = (c: Theme) => `<span class="theme-disc" aria-hidden="true" style="--sw-bg:${c.bg};--sw-ink:${c.ink};--sw-dim:${c.dim};--sw-minor:${c.minor};--sw-critical:${c.critical}"><i></i><i></i><i></i></span>`;
const GEAR = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

// The gear's tab last open, kept for the browser's session.
const tabKey = (store: string | null) => `${store ?? 'pulse-settings'}-tab`;
export function loadTab(store: string | null): Tab {
  try { const v = sessionStorage.getItem(tabKey(store)); return SETTINGS_TABS.includes(v as Tab) ? v as Tab : 'content'; } catch { return 'content'; }
}

// The colors in force: the custom ones over the default theme's, or the chosen theme's.
function currentColors(b: Board): Theme {
  const lk = look(b);
  return lk.theme === 'custom' ? { ...THEMES[DEFAULT_THEME], ...lk.colors } : THEMES[THEME_NAMES.includes(lk.theme) ? lk.theme : DEFAULT_THEME];
}

// ─── The panel ───

// The button and the panel behind it, as markup for the board's view.
export function settingsPanel(b: Board) {
  const { t, frame, sys } = b;
  const modes: [BoardMode, string][] = BOARD_MODES.map((m) => [m, t.modes[m]]);
  const tab = (id: Tab) => `<button type="button" role="tab" class="settings-tab" id="pulse-tab-${id}" data-tab="${id}" aria-controls="pulse-pane-${id}" aria-selected="false" tabindex="-1">${t.settingsTabs[id]}</button>`;
  const pane = (id: Tab, lead: string, html: string) => `<section class="settings-pane" role="tabpanel" id="pulse-pane-${id}" data-pane="${id}" aria-labelledby="pulse-tab-${id}" hidden>
    <p class="settings-lead">${lead}</p>${html}</section>`;
  const radios = (name: string, values: readonly string[], labels: Record<string, string>, title: string) =>
    `<fieldset class="settings-choice"><legend>${title}</legend><div class="settings-row">${values.map((v) =>
      `<label><input type="radio" name="${name}" value="${v}"> ${labels[v]}</label>`).join('')}</div></fieldset>`;
  const content = `<fieldset><legend>${t.systemsField}</legend>
        <div class="settings-systems">${frame.systems.map((id) =>
          `<label><input type="checkbox" name="systems" value="${id}"> ${sys[id].title}</label>`).join('')}</div></fieldset>
      <fieldset class="settings-groups" hidden><legend>${t.groupsField}</legend>
        <input type="search" name="groups-filter" class="settings-filter" placeholder="${t.filterGroups}" aria-label="${t.filterGroups}" autocomplete="off" hidden>
        <div class="settings-groups-list"></div>
        <p class="hint">${t.groupsHint}</p></fieldset>
      <fieldset class="settings-channels-field"><legend>${t.channelsField}</legend>
        <div class="settings-channels"></div>
        <p class="hint">${t.channelsHint}</p></fieldset>`;
  const board = `<h3 class="settings-section">${t.viewSection}</h3>
      ${radios('mode', modes.map(([m]) => m), Object.fromEntries(modes), t.boardView)}
      <label class="settings-check"><input type="checkbox" name="modes"> ${t.showModes}</label>
      <fieldset class="settings-axis settings-choice"><legend>${t.axisField}</legend>
        <div class="settings-row">${AXES.map((a) => `<label><input type="radio" name="axis" value="${a}"> ${t.axes[a]}</label>`).join('')}</div>
        <p class="hint">${t.axisHint}</p></fieldset>
      <label class="settings-field"><span>${t.openInside}</span>
        <select name="start" aria-describedby="pulse-settings-start"></select></label>
      <p class="hint" id="pulse-settings-start">${t.startHint}</p>
      <h3 class="settings-section">${t.orbitSection}</h3>
      <label class="settings-field"><span>${t.timeField}</span><select name="time">${TIMES.map((n) =>
        `<option value="${n}">${t.timeLook[n]}</option>`).join('')}</select></label>
      <h3 class="settings-section">${t.layersSection}</h3>
      <label class="settings-field"><span>${t.layersField}</span>
        <select name="layers" aria-describedby="pulse-settings-layers"></select></label>
      <p class="hint" id="pulse-settings-layers">${t.layersHint}</p>
      <label class="settings-field"><span>${t.stackField}</span>
        <select name="stack" aria-describedby="pulse-settings-stack">${Array.from({ length: STACK_MAX }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></label>
      <p class="hint" id="pulse-settings-stack">${t.stackHint}</p>`;
  const lookPane = `<fieldset class="settings-themes"><legend>${t.themeField}</legend>
        <div class="theme-grid">${[...THEME_NAMES, 'custom'].map((n) => `<label class="theme-tile" data-theme-tile="${n}"><input type="radio" name="theme" value="${n}">${
          n === 'custom' ? '<span class="theme-disc is-custom" aria-hidden="true"><i></i><i></i><i></i></span>' : swatch(THEMES[n as ThemeName])}<span class="theme-name">${t.themeNames[n]}<small>${t.themeNotes[n]}</small></span></label>`).join('')}</div></fieldset>
      <fieldset class="settings-colors" hidden><legend>${t.colorsField}</legend>
        <div class="color-grid">${COLOR_KEYS.map((k) => `<label class="color-field"><input type="color" name="color" data-key="${k}"><span>${t.colorLabels[k]}</span><output data-color-out="${k}"></output></label>`).join('')}</div>
        <p class="hint">${t.colorsHint}</p></fieldset>
      <h3 class="settings-section">${t.groundSection}</h3>
      ${radios('ground', GROUNDS, t.groundLook, t.groundField)}
      <label class="settings-field settings-glow"><span>${t.glowField}</span><input type="color" name="glow"></label>
      <fieldset class="settings-art"><legend>${t.artField}</legend>
        <div class="art-grid">${ARTS.map((a) => `<label class="art-tile" data-art-tile="${a}"><input type="radio" name="art" value="${a}"><span class="art-swatch" data-art="${a}" aria-hidden="true"></span><span class="art-name">${t.artNames[a]}</span></label>`).join('')}</div></fieldset>
      <div class="settings-photo">
        <div class="photo-row"><label class="plain photo-pick">${t.photoPick}<input type="file" name="photo-file" accept="image/*"></label>
          <span class="photo-state" aria-live="polite"></span></div>
        <label class="settings-field"><span>${t.photoUrl}</span><input type="text" name="photo-url" inputmode="url" placeholder="/local/living-room.jpg" autocomplete="off" spellcheck="false"></label>
        <p class="hint">${t.photoHint}</p>
        <label class="tune-field"><span>${t.dimField}</span><output data-ground-out="dim"></output><input type="range" name="dim" min="0" max="0.85" step="0.05"></label>
        <label class="tune-field"><span>${t.blurField}</span><output data-ground-out="blur"></output><input type="range" name="blur" min="0" max="24" step="1"></label>
      </div>
      <div class="settings-faces">${radios('faces', FACES, t.facesLook, t.facesField)}</div>
      <h3 class="settings-section">${t.ringsSection}</h3>
      ${radios('dial', DIALS, t.dialLook, t.dialField)}
      ${radios('day', DAYS, t.dayLook, t.dayField)}
      ${radios('ends', ENDS, t.endsLook, t.endsField)}
      <h3 class="settings-section">${t.detailsSection}</h3>
      <label class="settings-field"><span>${t.monthField}</span><select name="month">${MONTHS.map((n) =>
        `<option value="${n}">${t.monthLook[n]}</option>`).join('')}</select></label>`;
  const tunePane = GROUPS.map(([g, controls]) => `<div class="tune-group" data-tune-group="${g}">
        <div class="tune-head"><h3 class="settings-section">${t.tuneGroups[g]}</h3>
          <button type="button" class="plain tune-reset" data-tune-reset="${g}">${t.resetGroup}</button></div>
        ${controls.map((c) => `<label class="tune-field"><span>${t.tuneLabels[c.key]}</span><output data-tune-out="${c.key}"></output>
          <input type="range" name="tune" data-key="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}"></label>`).join('')}</div>`).join('') +
      `<div class="tune-actions"><button type="button" class="plain" data-tune-copy>${t.copy}</button>
        <button type="button" class="plain" data-tune-reset="all">${t.resetAllTuning}</button></div>`;
  return `<button type="button" class="gear" aria-label="${t.settings}" aria-haspopup="dialog" aria-expanded="false">${GEAR}</button>
  <div class="settings-backdrop" hidden>
    <form class="settings" role="dialog" aria-modal="true" aria-labelledby="pulse-settings-title">
      <header><h2 id="pulse-settings-title">${t.settings}</h2>
        <button type="button" class="plain settings-close" data-settings-close aria-label="${t.close}">×</button></header>
      <div class="settings-tabs" role="tablist" aria-label="${t.settings}">${SETTINGS_TABS.map(tab).join('')}</div>
      <div class="settings-body">
        ${pane('content', t.contentLead, content)}
        ${pane('board', t.boardLead, board)}
        ${pane('look', t.lookLead, lookPane)}
        ${pane('tune', t.tuneLead, tunePane)}
      </div>
      <footer><span class="settings-kept">${t.settingsLead}</span>
        <button type="button" class="plain" data-settings-reset>${t.resetSettings}</button>
        <button type="button" class="primary" data-settings-close>${t.done}</button></footer>
    </form>
  </div>`;
}

// ─── Its behavior ───

// Wires the gear drawn inside `el` (the board's view): the tabs, opening and
// closing, and every field. Nothing to do when the board has no gear.
export function wireGear(b: Board, el: HTMLElement) {
  const gear = el.querySelector<HTMLElement>('.gear');
  const backdrop = el.querySelector<HTMLElement>('.settings-backdrop');
  const form = el.querySelector<HTMLFormElement>('.settings');
  if (!gear || !backdrop || !form) return;
  const { t, frame } = b;
  const focusables = () => [...form.querySelectorAll<HTMLElement>('input, select, button')].filter((f) => !f.hasAttribute('disabled') && f.offsetParent !== null);
  // Tabs: one section at a time; the one last open comes back.
  const tabs = [...form.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const showTab = (id: Tab, focus = false) => {
    b.tab = id;
    try { sessionStorage.setItem(tabKey(b.store), id); } catch { /* only to remember */ }
    for (const x of tabs) { const on = x.dataset.tab === id; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; if (on && focus) x.focus(); }
    for (const p of form.querySelectorAll<HTMLElement>('[role="tabpanel"]')) p.hidden = p.dataset.pane !== id;
    form.querySelector<HTMLElement>('.settings-body')!.scrollTop = 0;
  };
  form.querySelector<HTMLElement>('.settings-tabs')!.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((x) => x.dataset.tab === b.tab);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    showTab(SETTINGS_TABS[(next + tabs.length) % tabs.length], true);
  });
  showTab(b.tab);
  // Wide enough, the panel is a sheet at the side and the board moves over to
  // stay in view (what is tuned shows as it changes); narrow, a dialog over it.
  const open = () => {
    const side = el.clientWidth >= 880;
    el.classList.toggle('settings-side', side);
    el.classList.add('settings-open');
    form.setAttribute('aria-modal', String(!side));
    backdrop.hidden = false;
    gear.setAttribute('aria-expanded', 'true');
    tabs.find((x) => x.dataset.tab === b.tab)?.focus();
  };
  const close = () => {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    el.classList.remove('settings-open', 'settings-side');
    gear.setAttribute('aria-expanded', 'false');
    gear.focus();
  };
  gear.addEventListener('click', () => (backdrop.hidden ? open() : close()));
  backdrop.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target === backdrop || target.closest('[data-settings-close]')) { close(); return; }
    const tabId = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
    if (tabId) { showTab(tabId); return; }
    if (target.closest('[data-settings-reset]')) { b.local = {}; setSettings(b, {}); return; }
    const reset = target.closest<HTMLElement>('[data-tune-reset]')?.dataset.tuneReset;
    if (reset) { resetTune(reset === 'all' ? undefined : reset as TuneGroup); syncTune(b, form); return; }
    const copy = target.closest<HTMLButtonElement>('[data-tune-copy]');
    if (copy) {
      void navigator.clipboard?.writeText(tuneText()).catch(() => undefined);
      copy.textContent = t.copied;
      setTimeout(() => { copy.textContent = t.copy; }, 1200);
    }
  });
  // Sliders and colors move the board as they are dragged; the filter narrows the groups.
  form.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'groups-filter') filterGroups(form.querySelector<HTMLElement>('.settings-groups-list')!, target.value);
    else if (target.name === 'tune') { setTune(target.dataset.key as keyof Tune, Number(target.value)); syncTune(b, form); }
    else if (target.name === 'dim' || target.name === 'blur' || target.name === 'glow') {
      // Live while dragged: the ground only; kept on release (the change event).
      const v = target.name === 'glow' ? target.value : Number(target.value);
      b.local = { ...b.local, look: { ...b.local.look, [target.name]: v } };
      applyGround(b);
      if (target.name !== 'glow') form.querySelector<HTMLOutputElement>(`[data-ground-out="${target.name}"]`)!.textContent = target.name === 'dim' ? `${Math.round(Number(v) * 100)}%` : `${v}px`;
    }
    else if (target.name === 'color') {
      const k = target.dataset.key as keyof Theme;
      applyColors(b.canvas, { ...currentColors(b), [k]: target.value });
      form.querySelector<HTMLOutputElement>(`[data-color-out="${k}"]`)!.textContent = target.value;
    }
  });
  // Only the field that changed is kept: the others stay as the frame says.
  form.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement, field = target.name, data = new FormData(form);
    const local = b.local;
    if (field === 'groups-filter') return;
    if (field === 'systems') {
      const chosen = data.getAll('systems').map(String);
      // At least one system: unchecking the last one does not stick.
      if (!chosen.length) { syncSettings(b, form); return; }
      setSettings(b, { systems: chosen.length === frame.systems.length ? undefined : chosen });
    } else if (field === 'axis') {
      const a = String(data.get('axis')) as Axis;
      setSettings(b, { axis: a === (frame.axis ?? 'systems') ? undefined : a });
    } else if (field === 'groups') {
      const chosen = data.getAll('groups').map(String);
      if (!chosen.length) { syncSettings(b, form); return; }
      setSettings(b, { groups: chosen.length === frameGroups(b).length ? undefined : chosen });
    } else if (field === 'channel') {
      // The system of the box that changed: its hidden channels are the unticked ones.
      const sysId = String(target.value).split('/')[0];
      const ticked = data.getAll('channel').map(String).filter((v) => v.startsWith(`${sysId}/`)).map((v) => v.split('/')[1]);
      if (!ticked.length) { syncSettings(b, form); return; }
      const hidden = b.sys[sysId].channels.map((ch) => ch.key).filter((k) => !ticked.includes(k));
      const next = { ...local.channels };
      if (hidden.length) next[sysId] = hidden; else delete next[sysId];
      setSettings(b, { channels: Object.keys(next).length ? next : undefined });
    } else if (field === 'pick') {
      const key = (target as HTMLSelectElement).dataset.key!, value = target.value;
      const next = { ...local.picks };
      if (value && value !== (target as HTMLSelectElement).dataset.default) next[key] = value; else delete next[key];
      setSettings(b, { picks: Object.keys(next).length ? next : undefined });
    } else if (field === 'mode') {
      const mode = String(data.get('mode')) as BoardMode;
      if (BOARD_MODES.includes(mode)) setSettings(b, { mode });
    } else if (field === 'start') {
      setSettings(b, { start: String(data.get('start') ?? '') || undefined });
    } else if (field === 'layers') {
      const n = Number(data.get('layers')) || undefined;
      setSettings(b, { layers: n === frame.layers ? undefined : n });
    } else if (field === 'stack') {
      const n = Number(data.get('stack')) || undefined;
      setSettings(b, { stack: n === (frame.stack ?? STACK_DEFAULT) ? undefined : n });
    } else if (field === 'tune') {
      // Kept as it moved (the input event).
    } else if (field === 'theme' || field === 'color') {
      const next: Look = { ...local.look };
      if (field === 'color') next.colors = { ...currentColors(b), [(target as HTMLInputElement).dataset.key!]: target.value };
      else if (target.value === 'custom') next.colors = local.look?.colors ?? currentColors(b);
      next.theme = field === 'color' ? 'custom' : target.value as Look['theme'];
      if (next.theme === (frame.look?.theme ?? LOOK_DEFAULT.theme)) delete next.theme;
      setSettings(b, { look: Object.keys(next).length ? next : undefined });
    } else if (field === 'ground' || field === 'art' || field === 'faces' || field === 'glow' || field === 'dim' || field === 'blur' || field === 'photo-url') {
      const v = field === 'dim' || field === 'blur' ? Number(target.value) : field === 'photo-url' ? target.value.trim() : target.value;
      const next: Look = { ...local.look, [field === 'photo-url' ? 'photo' : field]: v };
      if (field === 'photo-url' && v) next.ground = 'photo';
      for (const k of ['ground', 'art', 'faces', 'glow', 'photo', 'dim', 'blur'] as const) if (next[k] === (frame.look?.[k] ?? LOOK_DEFAULT[k])) delete next[k];
      setSettings(b, { look: Object.keys(next).length ? next : undefined });
    } else if (field === 'photo-file') {
      const file = (target as HTMLInputElement).files?.[0];
      const state = form.querySelector<HTMLElement>('.photo-state')!;
      if (!file) return;
      state.dataset.busy = '1';
      state.textContent = t.photoLoading;
      void keepPhoto(b, file).then((ok) => {
        delete state.dataset.busy;
        (target as HTMLInputElement).value = '';
        if (!ok) { state.textContent = t.photoTooBig; return; }
        setSettings(b, { look: { ...b.local.look, ground: 'photo', photo: 'upload' } });
      });
    } else if (field === 'modes') {
      const next: Look = { ...local.look, modes: (target as HTMLInputElement).checked ? 'shown' : 'hidden' };
      if (next.modes === (frame.look?.modes ?? LOOK_DEFAULT.modes)) delete next.modes;
      setSettings(b, { look: Object.keys(next).length ? next : undefined });
    } else if (field === 'dial' || field === 'day' || field === 'ends' || field === 'time' || field === 'month') {
      const next: Look = { ...local.look, [field]: String(data.get(field)) };
      for (const k of ['dial', 'day', 'ends', 'time', 'month'] as const) if (next[k] === (frame.look?.[k] ?? LOOK_DEFAULT[k])) delete next[k];
      setSettings(b, { look: Object.keys(next).length ? next : undefined });
    }
  });
  // The dialog keeps the keyboard: Escape closes, Tab cycles inside.
  form.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const list = focusables(), first = list[0], last = list[list.length - 1];
    if (e.shiftKey && activeElement(b) === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && activeElement(b) === last) { e.preventDefault(); first.focus(); }
  });
}

// ─── Showing what is in force ───

// A list of the panel redrawn only when its markup changes, and the control
// that had the focus (a select just changed) gets it back.
// Only the members whose name (or group) has the words typed; a group with none left hides.
const FILTER_FROM = 24;
function filterGroups(list: HTMLElement, query: string) {
  const q = query.trim().toLowerCase();
  for (const group of list.querySelectorAll<HTMLElement>('.settings-group')) {
    const title = group.querySelector('.settings-group-title')?.textContent?.toLowerCase() ?? '';
    let shown = 0;
    for (const label of group.querySelectorAll<HTMLElement>('label')) {
      const hit = !q || title.includes(q) || (label.textContent ?? '').toLowerCase().includes(q);
      label.hidden = !hit;
      if (hit) shown++;
    }
    group.hidden = !shown;
  }
}

function rebuild(b: Board, list: HTMLElement, html: string) {
  if (list.dataset.html === html) return;
  const focused = activeElement(b), inside = focused && list.contains(focused) ? focused as HTMLInputElement | HTMLSelectElement : null;
  const where = inside ? { name: inside.name, value: inside.dataset.key ?? inside.value } : null;
  setHTML(list, html);
  list.dataset.html = html;
  if (where) {
    const again = [...list.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[name="${where.name}"]`)]
      .find((x) => (x.dataset.key ?? x.value) === where.value);
    again?.focus();
  }
}

// The sliders of the last tab, each with its value; the changed ones marked, the reset of a group only when it has one.
function syncTune(b: Board, form: HTMLFormElement) {
  for (const c of CONTROLS) {
    const input = form.querySelector<HTMLInputElement>(`input[name="tune"][data-key="${c.key}"]`)!;
    if (activeElement(b) !== input) input.value = String(tune[c.key]);
    const out = form.querySelector<HTMLOutputElement>(`[data-tune-out="${c.key}"]`)!;
    out.textContent = fmt(c, tune[c.key]);
    out.classList.toggle('changed', tune[c.key] !== DEFAULTS[c.key]);
  }
  for (const [g] of GROUPS) form.querySelector<HTMLButtonElement>(`[data-tune-reset="${g}"]`)!.hidden = !tuned(g);
  form.querySelector<HTMLButtonElement>('[data-tune-reset="all"]')!.hidden = !tuned();
}

// A thing's name for the gear's lists, with where it is when that adds something.
const labelOf = (b: Board, id: string) => {
  const n = b.host.nameOf(id), p = b.host.whereIs?.(id);
  return p && !n.toLowerCase().includes(p.toLowerCase()) ? `${n} · ${p}` : n;
};

// Every field as it is in force. The board's paint calls it, so the panel
// follows the host (new groups, new channels) while it is open.
export function syncSettings(b: Board, form: HTMLFormElement) {
  const { t, frame, sys, channels } = b;
  const active = activeElement(b);
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="systems"]')) box.checked = b.chosen.includes(box.value);
  const lk = look(b);
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="dial"], input[name="day"], input[name="ends"]')) box.checked = lk[box.name as keyof Look] === box.value;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="theme"]')) box.checked = box.value === lk.theme;
  form.querySelector<HTMLInputElement>('input[name="modes"]')!.checked = lk.modes === 'shown';
  // The ground: its fields only for the ground chosen.
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="ground"], input[name="art"], input[name="faces"]')) box.checked = lk[box.name as 'ground' | 'art' | 'faces'] === box.value;
  form.querySelector<HTMLElement>('.settings-glow')!.hidden = lk.ground !== 'glow';
  form.querySelector<HTMLElement>('.settings-art')!.hidden = lk.ground !== 'art';
  // Each tile painted with its ground over the theme in force, light or dark.
  const light = lightGround(b);
  for (const sw of form.querySelectorAll<HTMLElement>('.art-swatch')) sw.style.background = artBackdrop(sw.dataset.art as Art, light);
  form.querySelector<HTMLElement>('.settings-photo')!.hidden = lk.ground !== 'photo';
  form.querySelector<HTMLElement>('.settings-faces')!.hidden = lk.ground === 'flat';
  const glowIn = form.querySelector<HTMLInputElement>('input[name="glow"]')!;
  if (active !== glowIn) glowIn.value = lk.glow;
  const urlIn = form.querySelector<HTMLInputElement>('input[name="photo-url"]')!;
  if (active !== urlIn) urlIn.value = lk.photo === 'upload' ? '' : lk.photo;
  const photoState = form.querySelector<HTMLElement>('.photo-state')!;
  if (!photoState.dataset.busy) photoState.textContent = lk.photo === 'upload' && uploadedPhoto(b) ? t.photoKept : '';
  for (const k of ['dim', 'blur'] as const) {
    const input = form.querySelector<HTMLInputElement>(`input[name="${k}"]`)!;
    if (active !== input) input.value = String(lk[k]);
    form.querySelector<HTMLOutputElement>(`[data-ground-out="${k}"]`)!.textContent = k === 'dim' ? `${Math.round(lk.dim * 100)}%` : `${lk.blur}px`;
  }
  // Your colors: shown with the custom theme, each as it is in force.
  const colorsField = form.querySelector<HTMLElement>('.settings-colors')!;
  colorsField.hidden = lk.theme !== 'custom';
  const inForce = currentColors(b);
  for (const input of form.querySelectorAll<HTMLInputElement>('input[name="color"]')) {
    const k = input.dataset.key as keyof Theme;
    if (active !== input) input.value = inForce[k];
    form.querySelector<HTMLOutputElement>(`[data-color-out="${k}"]`)!.textContent = inForce[k];
  }
  const disc = form.querySelector<HTMLElement>('.theme-disc.is-custom')!;
  for (const k of COLOR_KEYS) disc.style.setProperty(`--sw-${k}`, (lk.colors?.[k] ?? inForce[k]));
  syncTune(b, form);
  form.querySelector<HTMLSelectElement>('select[name="time"]')!.value = lk.time;
  form.querySelector<HTMLSelectElement>('select[name="month"]')!.value = lk.month;
  // Groups, as the host groups them, and the channels of the systems shown:
  // built from the host and the readings, so only redrawn when they change (the
  // panel repaints with the host; a list rebuilt under the pointer would lose taps).
  const groupsField = form.querySelector<HTMLElement>('.settings-groups')!, groupsList = groupsField.querySelector<HTMLElement>('.settings-groups-list')!;
  const offered = frameGroups(b);
  groupsField.hidden = offered.length < 2;
  const groups = hostGroups(b).map((g) => ({ title: g.title, items: g.items.filter((i) => offered.includes(i.id)) })).filter((g) => g.items.length);
  const groupsHtml = groups.map((g) => `<div class="settings-group">${g.title ? `<span class="settings-group-title">${esc(g.title)}</span>` : ''}${g.items.map((i) =>
    `<label><input type="checkbox" name="groups" value="${esc(i.id)}"> ${esc(i.name)}</label>`).join('')}</div>`).join('');
  rebuild(b, groupsList, groupsHtml);
  // Past a couple of dozen members (a fleet), a filter over the names.
  const filter = groupsField.querySelector<HTMLInputElement>('input[name="groups-filter"]')!;
  filter.hidden = groups.reduce((n, g) => n + g.items.length, 0) <= FILTER_FROM;
  filterGroups(groupsList, filter.hidden ? '' : filter.value);
  const inGroups = activeGroups(b);
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="groups"]')) box.checked = !inGroups || inGroups.includes(box.value);
  const chList = form.querySelector<HTMLElement>('.settings-channels')!;
  const chHtml = b.chosen.filter((id) => channels[id]?.length).map((id) => `<div class="settings-group"><span class="settings-group-title">${sys[id].title}</span>${
    channels[id].map(({ ch, r }) => `<div class="settings-channel"><label><input type="checkbox" name="channel" value="${id}/${ch.key}"> ${esc(ch.name)}</label>${
      r.choices ? `<select name="pick" data-key="${id}/${ch.key}" data-default="${esc(r.choices[0])}" aria-label="${esc(t.pickFor(ch.name))}">${
        r.choices.map((e) => `<option value="${esc(e)}">${esc(labelOf(b, e))}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>`).join('');
  rebuild(b, chList, chHtml);
  form.querySelector<HTMLElement>('.settings-channels-field')!.hidden = !chHtml;
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="channel"]')) {
    const [sysId, key] = box.value.split('/');
    box.checked = !channels[sysId]?.find((c) => c.ch.key === key)?.hidden;
  }
  for (const select of form.querySelectorAll<HTMLSelectElement>('select[name="pick"]')) {
    const [sysId, key] = select.dataset.key!.split('/');
    const r = channels[sysId]?.find((c) => c.ch.key === key)?.r;
    if (r?.choice) select.value = r.choice;
  }
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.checked = radio.value === b.mode;
  // The groups axis only when the host offers it and names groups.
  form.querySelector<HTMLElement>('.settings-axis')!.hidden = !b.host.byGroup || !hostGroups(b).some((g) => g.items.length);
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="axis"]')) radio.checked = radio.value === b.axis;
  const select = form.querySelector<HTMLSelectElement>('select[name="start"]')!;
  setHTML(select, `<option value="">${t.theBoard}</option>${b.ids.map((id) => `<option value="${id}">${sys[id].title}</option>`).join('')}`);
  select.value = startId(b) ?? '';
  const layersSel = form.querySelector<HTMLSelectElement>('select[name="layers"]')!;
  setHTML(layersSel, `<option value="">${t.allSystems}</option>${Array.from({ length: Math.max(0, b.ids.length - 1) }, (_, i) =>
    `<option value="${i + 2}">${i + 2}</option>`).join('')}`);
  const cap = b.local.layers ?? frame.layers;
  layersSel.value = cap && cap < b.ids.length ? String(cap) : '';
  form.querySelector<HTMLSelectElement>('select[name="stack"]')!.value = String(stackShown(b));
}
