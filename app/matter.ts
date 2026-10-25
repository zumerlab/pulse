import type { DiscoveredDevice } from '../adapters/lan/types.ts';
import type { MatterSnapshot } from '../adapters/matter/api.ts';
import type { Action } from '../core/action.ts';
import type { PulseEntity, State } from '../core/entity.ts';
import type { PulseEvent } from '../core/event.ts';

type Source = 'matter' | 'media';
interface DeviceSnapshot {
  status: 'starting' | 'ready' | 'error';
  entities: PulseEntity[];
  events: PulseEvent[];
  error?: string;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

const modes: Record<string, string> = { off: 'Apagado', heat: 'Calor', cool: 'Frío', auto: 'Automático' };
const labels: Record<string, string> = {
  on: 'Luz', brightness: 'Brillo', position: 'Apertura', temperature: 'Temperatura',
  targetTemperature: 'Objetivo', hvacMode: 'Modo', online: 'Conexión', volume: 'Volumen', muted: 'Silencio',
};

function valueText(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Sin lectura';
  if (key === 'muted') return value ? 'activado' : 'desactivado';
  if (key === 'on') return value ? 'encendida' : 'apagada';
  if (key === 'online') return value ? 'disponible' : 'sin conexión';
  if (key === 'brightness' || key === 'position' || key === 'volume') return `${String(value)} %`;
  if (key === 'temperature' || key === 'targetTemperature') return `${String(value)} °C`;
  return modes[String(value)] ?? String(value);
}

function stateText(state: State): string {
  return Object.entries(state).filter(([key]) => key in labels)
    .map(([key, value]) => `${labels[key]}: ${valueText(key, value)}`).join(' · ') || 'Estado recibido';
}

export function mountDevices(root: HTMLElement) {
  root.className = 'matter-section';
  root.setAttribute('aria-labelledby', 'matter-heading');
  const heading = node('div', 'section-heading');
  const title = node('h2', '', 'Mis dispositivos');
  title.id = 'matter-heading';
  const count = node('span');
  heading.append(title, count);
  const status = node('p', 'matter-status', 'Preparando la conexión local…');
  status.setAttribute('role', 'status');
  const retry = node('button', 'retry', 'Reintentar conexión');
  retry.type = 'button';
  retry.hidden = true;
  const workspace = node('div', 'workspace');
  const content = node('div');
  const empty = node('p', 'matter-empty', 'Elige Agregar en un dispositivo de tu red para empezar.');
  const entities = node('div', 'entities');
  content.append(empty, entities);
  const activity = node('aside', 'activity');
  activity.setAttribute('aria-labelledby', 'matter-activity-heading');
  const activityHeading = node('div', 'section-heading');
  const activityTitle = node('h2', '', 'Actividad de los dispositivos');
  activityTitle.id = 'matter-activity-heading';
  const eventCount = node('span', '', '0 eventos');
  activityHeading.append(activityTitle, eventCount);
  const activityEmpty = node('p', 'empty', 'Esperando el primer dispositivo…');
  const events = node('ol', 'matter-events');
  events.setAttribute('aria-label', 'Eventos confirmados de dispositivos vinculados');
  activity.append(activityHeading, node('p', 'activity-intro', 'Estado confirmado por los dispositivos.'), activityEmpty, events);
  workspace.append(content, activity);
  root.append(heading, status, retry, workspace);

  const dialog = node('dialog', 'matter-dialog');
  dialog.setAttribute('aria-labelledby', 'matter-pair-title');
  const pairTitle = node('h2', '', 'Vincular dispositivo');
  pairTitle.id = 'matter-pair-title';
  const pairDescription = node('p', 'matter-pair-description');
  const pairForm = node('form', 'matter-pair-form');
  const codeLabel = node('label', 'control', 'Código de vinculación Matter');
  const code = node('input');
  code.type = 'password';
  code.autocomplete = 'off';
  code.inputMode = 'text';
  code.required = true;
  code.maxLength = 258;
  code.setAttribute('aria-describedby', 'matter-code-note');
  codeLabel.append(code);
  const codeNote = node('p', 'matter-pair-note', 'Usa el código temporal de la app del dispositivo o pega el contenido de su código QR Matter. La vinculación se guarda en esta máquina.');
  codeNote.id = 'matter-code-note';
  const pairStatus = node('p', 'matter-pair-status');
  pairStatus.setAttribute('role', 'status');
  const pairButtons = node('div', 'matter-pair-buttons');
  const closePair = node('button', '', 'Cancelar');
  closePair.type = 'button';
  const pairSubmit = node('button', 'power', 'Vincular');
  pairSubmit.type = 'submit';
  pairButtons.append(closePair, pairSubmit);
  pairForm.append(codeLabel, codeNote, pairStatus, pairButtons);
  dialog.append(pairTitle, pairDescription, pairForm);
  root.append(dialog);

  let snapshot: MatterSnapshot = { status: 'starting', entities: [], events: [], pairing: { status: 'idle' } };
  let mediaSnapshot: DeviceSnapshot = { status: 'starting', entities: [], events: [] };
  const connections: Record<Source, { connected: boolean; stream?: EventSource; generation: number }> = {
    matter: { connected: false, generation: 0 }, media: { connected: false, generation: 0 },
  };
  let disposed = false;
  let selected: DiscoveredDevice | undefined;
  let pairTrigger: HTMLElement | undefined;
  let submittingPair = false;
  let pairFailure = '';
  const abort = new AbortController();
  const views = new Map<string, { row: HTMLElement; update: (entity: PulseEntity) => void }>();
  let shownEvents: PulseEvent[] = [];

  async function request(source: Source, path: string, body?: object): Promise<DeviceSnapshot> {
    const response = await fetch(`/api/${source}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', [source === 'matter' ? 'X-Pulse-Matter' : 'X-Pulse-Media']: '1' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(body ? 45_000 : 20_000)]),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('No se pudo consultar la conexión local.');
    const result = await response.json() as DeviceSnapshot;
    if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
    return result;
  }

  function receive(source: Source, next: DeviceSnapshot, fromStream = false) {
    if (disposed) return;
    const previous = source === 'matter' ? snapshot : mediaSnapshot;
    // A command response can arrive after a newer stream event.
    if (!fromStream && next.events.length < previous.events.length) return;
    if (source === 'matter') snapshot = next as MatterSnapshot;
    else mediaSnapshot = next;
    render();
  }

  const allEntities = () => [...snapshot.entities, ...mediaSnapshot.entities];
  const allEvents = () => [...snapshot.events, ...mediaSnapshot.events].sort((a, b) => a.timestamp - b.timestamp);
  const entitySource = (entity: PulseEntity): Source => entity.source.adapter === 'upnp' ? 'media' : 'matter';

  function pairPending() {
    return submittingPair || snapshot.pairing.status === 'pairing';
  }

  function renderPair() {
    if (!dialog.open) return;
    const pending = pairPending();
    const isSelected = snapshot.pairing.candidateId === selected?.id;
    const succeeded = isSelected && snapshot.pairing.status === 'success';
    code.disabled = pending || succeeded;
    pairSubmit.disabled = pending || succeeded || !connections.matter.connected || snapshot.status !== 'ready';
    pairSubmit.hidden = succeeded;
    closePair.disabled = pending;
    closePair.textContent = succeeded ? 'Cerrar' : 'Cancelar';
    pairStatus.classList.toggle('error', Boolean(pairFailure) || (isSelected && snapshot.pairing.status === 'error'));
    pairStatus.textContent = pairFailure || (pending ? 'Vinculando… Mantén el dispositivo encendido. Este proceso puede tardar.'
      : isSelected ? snapshot.pairing.message ?? '' : '');
  }

  function closeDialog() {
    if (pairPending()) return;
    code.value = '';
    dialog.close();
    if (pairTrigger?.isConnected) pairTrigger.focus();
    else document.querySelector<HTMLButtonElement>('.lan-search')?.focus();
    selected = undefined;
  }
  closePair.addEventListener('click', closeDialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
  pairForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selected || pairPending() || !pairForm.reportValidity()) return;
    const candidateId = selected.id;
    const submittedCode = code.value.trim();
    code.value = '';
    submittingPair = true;
    pairFailure = '';
    renderPair();
    void request('matter', '/pair', { candidateId, code: submittedCode }).then((next) => receive('matter', next)).catch(() => {
      // The request may have reached the server; the event stream reports its actual outcome.
      pairFailure = 'No se pudo confirmar la solicitud. Comprueba el estado de la conexión antes de volver a intentar.';
    }).finally(() => { submittingPair = false; renderPair(); });
  });

  function addEntity(initial: PulseEntity) {
    let entity = initial;
    let pending = false;
    const row = node('article', 'entity');
    row.setAttribute('aria-label', initial.name);
    const top = node('div', 'entity-heading');
    const identity = node('div', 'identity');
    const name = node('h3', '', initial.name);
    identity.append(name, node('p', 'entity-meta', initial.domain === 'media' ? 'TV · conexión local' : 'Dispositivo local'));
    const state = node('p', 'entity-state');
    top.append(identity, state);
    const controls = node('fieldset', 'controls');
    controls.append(node('legend', 'sr-only', `Controles de ${initial.name}`));
    const feedback = node('p', 'entity-feedback');
    feedback.setAttribute('role', 'status');
    const updates: ((state: State) => void)[] = [];
    const update = (next: PulseEntity) => {
      entity = next;
      name.textContent = next.name;
      const current = next.state;
      state.textContent = current.online === false ? 'Sin conexión'
        : next.capabilities.includes('temperature') ? valueText('temperature', current.temperature)
        : next.capabilities.includes('onOff') ? (current.on === true ? 'Encendida' : current.on === false ? 'Apagada' : 'Sin lectura')
        : next.capabilities.includes('position') ? `${valueText('position', current.position)} abierta`
        : next.capabilities.includes('volume') ? current.muted ? 'En silencio' : `Volumen ${valueText('volume', current.volume)}` : 'Agregado';
      row.dataset.active = String(current.online !== false && current.on === true);
      const source = entitySource(next);
      controls.disabled = pending || !connections[source].connected || (source === 'matter' ? snapshot : mediaSnapshot).status !== 'ready' || current.online === false;
      for (const updateControl of updates) updateControl(current);
    };
    const execute = async (action: Action, accepted?: () => void) => {
      if (pending || controls.disabled) return;
      pending = true;
      const focused = document.activeElement;
      feedback.textContent = 'Enviando solicitud…';
      feedback.classList.remove('error');
      update(entity);
      try {
        const source = entitySource(entity);
        receive(source, await request(source, '/action', { entityId: entity.id, action }));
        feedback.textContent = '';
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : 'No se pudo enviar la acción.';
        feedback.classList.add('error');
      } finally {
        accepted?.();
        pending = false;
        update(entity);
        if (focused instanceof HTMLElement && controls.contains(focused) && document.activeElement === document.body) focused.focus();
      }
    };
    if (initial.capabilities.includes('onOff')) {
      const power = node('button', 'power');
      power.type = 'button';
      power.addEventListener('click', () => { void execute({ type: entity.state.on ? 'turnOff' : 'turnOn' }); });
      updates.push((current) => {
        power.textContent = current.on ? 'Apagar' : 'Encender';
        power.setAttribute('aria-label', `${power.textContent} ${entity.name}`);
      });
      controls.append(power);
    }
    for (const capability of ['brightness', 'position', 'volume'] as const) {
      if (!initial.capabilities.includes(capability)) continue;
      let dirty = false;
      const label = node('label', 'control range-control');
      const caption = node('span', 'control-label');
      const output = node('output');
      caption.append(node('span', '', capability === 'brightness' ? 'Brillo' : capability === 'volume' ? 'Volumen' : 'Apertura'), output);
      const input = node('input');
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
      input.setAttribute('aria-label', `${capability === 'brightness' ? 'Brillo' : capability === 'volume' ? 'Volumen' : 'Apertura'} de ${initial.name}`);
      const show = () => { output.value = `${input.value} %`; input.setAttribute('aria-valuetext', `${input.value} por ciento`); };
      input.addEventListener('input', () => { dirty = true; show(); });
      input.addEventListener('change', () => {
        void execute({ type: capability === 'brightness' ? 'setBrightness' : capability === 'volume' ? 'setVolume' : 'setPosition', value: Number(input.value) }, () => { dirty = false; });
      });
      updates.push((current) => { if (!dirty) input.value = String(current[capability] ?? 0); show(); });
      label.append(caption, input); controls.append(label);
    }
    if (initial.capabilities.includes('mute')) {
      const mute = node('button', 'power');
      mute.type = 'button';
      mute.addEventListener('click', () => { void execute({ type: 'setMute', value: !entity.state.muted }); });
      updates.push((current) => {
        mute.textContent = current.muted ? 'Activar sonido' : 'Silenciar';
        mute.setAttribute('aria-label', `${mute.textContent} ${entity.name}`);
        mute.setAttribute('aria-pressed', String(current.muted === true));
      });
      controls.append(mute);
    }
    if (initial.capabilities.includes('targetTemperature')) {
      let dirty = false;
      const form = node('form', 'control temperature-control');
      const label = node('label', 'control-label', 'Temperatura objetivo');
      const input = node('input');
      input.type = 'number'; input.step = '0.5'; input.required = true;
      input.setAttribute('aria-label', `Temperatura objetivo de ${initial.name} en grados Celsius`);
      input.addEventListener('input', () => { dirty = true; });
      const submit = node('button', 'apply', 'Aplicar');
      submit.type = 'submit'; submit.setAttribute('aria-label', `Aplicar temperatura de ${initial.name}`);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (entity.state.targetTemperatureWritable === false) return;
        if (form.reportValidity()) void execute({ type: 'setTargetTemperature', value: Number(input.value) }, () => { dirty = false; });
      });
      updates.push((current) => {
        input.disabled = current.targetTemperatureWritable === false;
        submit.disabled = current.targetTemperatureWritable === false;
        input.min = String(typeof current.minTargetTemperature === 'number' ? current.minTargetTemperature : 5);
        input.max = String(typeof current.maxTargetTemperature === 'number' ? current.maxTargetTemperature : 35);
        if (!dirty && document.activeElement !== input) input.value = typeof current.targetTemperature === 'number' ? String(current.targetTemperature) : '';
      });
      label.append(input); form.append(label, node('span', 'temperature-unit', '°C'), submit); controls.append(form);
    }
    if (initial.capabilities.includes('hvacMode')) {
      let dirty = false;
      let optionsKey = '';
      const label = node('label', 'control');
      label.append(node('span', 'control-label', 'Modo'));
      const select = node('select');
      select.setAttribute('aria-label', `Modo de ${initial.name}`);
      select.addEventListener('change', () => {
        dirty = true;
        void execute({ type: 'setHvacMode', value: select.value as 'off' | 'heat' | 'cool' | 'auto' }, () => { dirty = false; });
      });
      updates.push((current) => {
        const allowed = Array.isArray(current.hvacModes) ? current.hvacModes.filter((mode): mode is string => typeof mode === 'string' && mode in modes) : Object.keys(modes);
        const nextKey = allowed.join(',');
        if (nextKey !== optionsKey) {
          optionsKey = nextKey;
          select.replaceChildren(...allowed.map((mode) => { const option = node('option', '', modes[mode]); option.value = mode; return option; }));
        }
        select.disabled = allowed.length === 0;
        if (!dirty) select.value = typeof current.hvacMode === 'string' ? current.hvacMode : '';
      });
      label.append(select); controls.append(label);
    }
    if (controls.children.length === 1) controls.hidden = true;
    row.append(top, controls, feedback);
    entities.append(row);
    views.set(initial.id, { row, update });
    update(initial);
  }

  function renderEvents() {
    const deviceEvents = allEvents();
    const prefixUnchanged = shownEvents.length <= deviceEvents.length && shownEvents.every((event, index) => JSON.stringify(event) === JSON.stringify(deviceEvents[index]));
    const followLatest = events.scrollHeight - events.scrollTop - events.clientHeight < 24;
    if (!prefixUnchanged) { events.replaceChildren(); shownEvents = []; }
    for (const event of deviceEvents.slice(shownEvents.length)) {
      const item = node('li', 'event');
      const time = node('time', 'event-time', new Date(event.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      time.dateTime = new Date(event.timestamp).toISOString();
      const body = node('div', 'event-body');
      const name = allEntities().find((entity) => entity.id === event.entityId)?.name ?? event.entityId;
      body.append(node('strong', '', name), node('p', '', event.type === 'discovered' ? 'Dispositivo agregado' : stateText(event.value)));
      item.append(time, body); events.append(item);
    }
    shownEvents = deviceEvents;
    eventCount.textContent = `${shownEvents.length} eventos`;
    activityEmpty.hidden = shownEvents.length > 0;
    if (followLatest) events.scrollTop = events.scrollHeight;
  }

  function render() {
    if (disposed) return;
    const devices = allEntities();
    const sources = ['matter', 'media'] as const;
    const ready = sources.filter((source) => connections[source].connected && (source === 'matter' ? snapshot : mediaSnapshot).status === 'ready');
    count.textContent = `${devices.length} agregados`;
    status.classList.toggle('error', ready.length === 0 && (snapshot.status === 'error' || mediaSnapshot.status === 'error'));
    status.textContent = snapshot.pairing.status === 'pairing' ? 'Agregando un dispositivo…'
      : ready.length === 2 ? 'Conexión local disponible.'
      : ready.length === 1 ? 'Algunas conexiones se están recuperando. Los dispositivos disponibles siguen funcionando.'
      : snapshot.status === 'error' || mediaSnapshot.status === 'error' ? 'No pudimos conectar. Vuelve a intentar.' : 'Conectando con tus dispositivos…';
    retry.hidden = ready.length === 2;
    empty.hidden = devices.length > 0;
    for (const entity of devices) {
      if (!views.has(entity.id)) addEntity(entity);
      else views.get(entity.id)!.update(entity);
    }
    for (const [id, view] of views) {
      if (!devices.some((entity) => entity.id === id)) { view.row.remove(); views.delete(id); }
    }
    renderEvents(); renderPair();
  }

  async function connect(source: Source) {
    const connection = connections[source];
    const generation = ++connection.generation;
    connection.stream?.close();
    connection.connected = false;
    render();
    try {
      const initial = await request(source, '');
      if (disposed || generation !== connection.generation) return;
      connection.connected = true;
      receive(source, initial, true);
    } catch {
      if (disposed || generation !== connection.generation) return;
      const previous = source === 'matter' ? snapshot : mediaSnapshot;
      receive(source, { ...previous, status: 'error', error: 'No se pudo conectar. Puedes volver a intentar.' }, true);
    }
    if (disposed || generation !== connection.generation) return;
    const stream = new EventSource(`/api/${source}/events`);
    connection.stream = stream;
    stream.addEventListener('snapshot', (event) => {
      if (disposed || generation !== connection.generation) return;
      try {
        const next = JSON.parse((event as MessageEvent<string>).data) as DeviceSnapshot;
        connection.connected = true;
        receive(source, next, true);
      } catch { connection.connected = false; render(); }
    });
    stream.onerror = () => { if (generation === connection.generation) { connection.connected = false; render(); } };
  }
  retry.addEventListener('click', () => { void connect('matter'); void connect('media'); });
  void connect('matter');
  void connect('media');

  return {
    async selectCandidate(candidate: DiscoveredDevice, trigger: HTMLElement) {
      if (disposed || dialog.open) return;
      if (candidate.upnp) {
        receive('media', await request('media', '/add', { candidateId: candidate.id }));
        return;
      }
      selected = candidate; pairTrigger = trigger; pairFailure = ''; code.value = '';
      pairTitle.textContent = `Vincular ${candidate.name}`;
      pairDescription.textContent = 'Este dispositivo necesita un código para permitir la conexión.';
      dialog.showModal(); renderPair();
      if (!code.disabled) code.focus();
    },
    dispose() { disposed = true; abort.abort(); connections.matter.stream?.close(); connections.media.stream?.close(); dialog.close(); dialog.remove(); },
  };
}
