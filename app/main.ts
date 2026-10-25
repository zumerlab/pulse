import { Registry } from '../core/registry.ts';
import { MockAdapter } from '../adapters/mock/index.ts';
import type { Action } from '../core/action.ts';
import type { PulseEntity, State } from '../core/entity.ts';
import type { PulseEvent } from '../core/event.ts';
import { mountLanDiscovery } from './lan.ts';
import { mountDevices } from './matter.ts';
import './style.css';

const registry = new Registry([new MockAdapter()]);
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');

app.innerHTML = `
  <header class="masthead">
    <div class="brand"><span class="brand-mark" aria-hidden="true">p</span><span>Pulse</span></div>
    <span class="demo-label"><span aria-hidden="true"></span>Conexión local</span>
  </header>
  <main>
    <div class="page-heading">
      <div><p class="eyebrow">CONTROL LOCAL</p><h1>Todo a mano.</h1></div>
      <p class="intro">Descubre dispositivos en tu red.<br>Vincula los compatibles y contrólalos desde aquí.</p>
    </div>
    <section id="lan" class="lan"></section>
    <section id="matter"></section>
    <div class="workspace">
      <section aria-labelledby="entities-heading">
        <div class="section-heading"><h2 id="entities-heading">Demo · entidades simuladas</h2><span id="entity-count">Cargando…</span></div>
        <div id="discovery" role="status">Cargando la simulación…</div>
        <button id="retry" class="retry" type="button" hidden>Volver a descubrir</button>
        <div id="entities" class="entities"></div>
      </section>
      <aside class="activity" aria-labelledby="activity-heading">
        <div class="section-heading"><h2 id="activity-heading">Actividad de la demo</h2><span id="event-count">0 eventos</span></div>
        <p class="activity-intro">Eventos simulados, en orden de llegada.</p>
        <p id="event-empty" class="empty">Esperando eventos…</p>
        <ol id="events" aria-label="Eventos de esta sesión"></ol>
        <p class="session-note">Esta sesión es temporal. Al recargar, la demo comienza de nuevo.</p>
      </aside>
    </div>
    <p class="footer-note">Los controles de la demo solo actúan sobre entidades simuladas.</p>
    <p id="announcement" class="sr-only" role="status" aria-live="polite"></p>
  </main>`;

const matter = mountDevices(document.getElementById('matter')!);
const disposeLan = mountLanDiscovery(document.getElementById('lan')!, matter.selectCandidate);

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const entities = required('entities');
const discovery = required('discovery');
const retry = required<HTMLButtonElement>('retry');
const eventList = required<HTMLOListElement>('events');
const views = new Map<string, { update: () => void }>();
const domainLabels = { lighting: 'Iluminación', openings: 'Aperturas', climate: 'Clima', security: 'Seguridad', cameras: 'Cámaras', media: 'TV y audio' };
const modeLabels: Record<string, string> = {
  off: 'Apagado', heat: 'Calor', cool: 'Frío', auto: 'Automático',
  disarmed: 'Desarmada', armedHome: 'Armada en casa', armedAway: 'Armada fuera',
};
const stateLabels: Record<string, string> = {
  on: 'Luz', brightness: 'Brillo', position: 'Apertura', temperature: 'Temperatura',
  targetTemperature: 'Objetivo', hvacMode: 'Modo', alarmMode: 'Alarma',
};

function formatValue(key: string, value: unknown): string {
  if (key === 'on') return value ? 'encendida' : 'apagada';
  if (key === 'brightness' || key === 'position') return `${String(value)} %`;
  if (key === 'temperature' || key === 'targetTemperature') return `${String(value)} °C`;
  return modeLabels[String(value)] ?? String(value);
}

function stateDescription(state: State): string {
  return Object.entries(state).map(([key, value]) => `${stateLabels[key] ?? key}: ${formatValue(key, value)}`).join(' · ');
}

function addEntity(entity: PulseEntity): void {
  if (views.has(entity.id)) return;
  const capabilities = registry.getCapabilities(entity.id);
  const row = element('article', 'entity');
  row.setAttribute('aria-label', entity.name);
  const heading = element('div', 'entity-heading');
  const identity = element('div', 'identity');
  const title = element('h3', '', entity.name);
  const metadata = element('p', 'entity-meta', `${domainLabels[entity.domain]} · ${entity.kind === 'system' ? 'Sistema' : 'Dispositivo'}`);
  identity.append(title, metadata);
  const status = element('p', 'entity-state');
  heading.append(identity, status);
  const controls = element('fieldset', 'controls');
  const legend = element('legend', 'sr-only', `Controles de ${entity.name}`);
  controls.append(legend);
  const feedback = element('p', 'entity-feedback');
  feedback.setAttribute('role', 'status');
  const updates: ((state: State) => void)[] = [];
  let pending = false;

  function update() {
    const state = registry.getState(entity.id);
    status.textContent = capabilities.includes('onOff') ? (state.on ? 'Encendida' : 'Apagada')
      : capabilities.includes('position') ? `${String(state.position)} % abierta`
      : capabilities.includes('temperature') ? `${String(state.temperature)} °C`
      : formatValue('alarmMode', state.alarmMode);
    row.dataset.active = String(state.on === true || (typeof state.alarmMode === 'string' && state.alarmMode !== 'disarmed'));
    for (const updateControl of updates) updateControl(state);
  }

  async function execute(action: Action) {
    if (pending) return;
    pending = true;
    const focused = document.activeElement;
    controls.disabled = true;
    row.setAttribute('aria-busy', 'true');
    feedback.textContent = 'Aplicando…';
    feedback.classList.remove('error');
    try {
      await registry.execute(entity.id, action);
      feedback.textContent = '';
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : 'No se pudo ejecutar la acción. Inténtalo de nuevo.';
      feedback.classList.add('error');
    } finally {
      pending = false;
      controls.disabled = false;
      row.removeAttribute('aria-busy');
      update();
      if (focused instanceof HTMLElement && controls.contains(focused) && document.activeElement === document.body) focused.focus();
    }
  }

  function selectControl(label: string, key: string, options: [string, string][], action: (value: string) => Action) {
    const field = element('label', 'control');
    field.append(element('span', 'control-label', label));
    const select = element('select');
    select.setAttribute('aria-label', `${label} de ${entity.name}`);
    for (const [value, text] of options) {
      const option = element('option', '', text);
      option.value = value;
      select.append(option);
    }
    select.addEventListener('change', () => { void execute(action(select.value)); });
    updates.push((state) => { select.value = String(state[key]); });
    field.append(select);
    controls.append(field);
  }

  function rangeControl(label: string, key: 'brightness' | 'position', actionType: 'setBrightness' | 'setPosition') {
    const field = element('label', 'control range-control');
    const caption = element('span', 'control-label');
    const output = element('output');
    caption.append(element('span', '', label), output);
    const input = element('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.setAttribute('aria-label', `${label} de ${entity.name}`);
    const showValue = () => {
      output.value = `${input.value} %`;
      input.setAttribute('aria-valuetext', `${input.value} por ciento`);
    };
    input.addEventListener('input', showValue);
    input.addEventListener('change', () => { void execute({ type: actionType, value: Number(input.value) }); });
    updates.push((state) => { input.value = String(state[key]); showValue(); });
    field.append(caption, input);
    controls.append(field);
  }

  if (capabilities.includes('onOff')) {
    const power = element('button', 'power');
    power.type = 'button';
    power.addEventListener('click', () => { void execute({ type: registry.getState(entity.id).on ? 'turnOff' : 'turnOn' }); });
    updates.push((state) => {
      power.textContent = state.on ? 'Apagar' : 'Encender';
      power.setAttribute('aria-label', `${state.on ? 'Apagar' : 'Encender'} ${entity.name}`);
    });
    controls.append(power);
  }
  if (capabilities.includes('brightness')) rangeControl('Brillo', 'brightness', 'setBrightness');
  if (capabilities.includes('position')) rangeControl('Apertura', 'position', 'setPosition');
  if (capabilities.includes('targetTemperature')) {
    const form = element('form', 'control temperature-control');
    const label = element('label', 'control-label', 'Temperatura objetivo');
    const input = element('input');
    input.type = 'number';
    input.min = '5';
    input.max = '35';
    input.step = '0.5';
    input.required = true;
    input.setAttribute('aria-label', `Temperatura objetivo de ${entity.name} en grados Celsius`);
    label.append(input);
    const submit = element('button', 'apply', 'Aplicar');
    submit.type = 'submit';
    submit.setAttribute('aria-label', `Aplicar temperatura de ${entity.name}`);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (form.reportValidity()) void execute({ type: 'setTargetTemperature', value: Number(input.value) });
    });
    updates.push((state) => {
      if (document.activeElement !== input) input.value = String(state.targetTemperature);
    });
    const unit = element('span', 'temperature-unit', '°C');
    form.append(label, unit, submit);
    controls.append(form);
  }
  if (capabilities.includes('hvacMode')) {
    selectControl('Modo', 'hvacMode', [['off', 'Apagado'], ['heat', 'Calor'], ['cool', 'Frío'], ['auto', 'Automático']],
      (value) => ({ type: 'setHvacMode', value: value as 'off' | 'heat' | 'cool' | 'auto' }));
  }
  if (capabilities.includes('alarmMode')) {
    selectControl('Modo de alarma', 'alarmMode', [['disarmed', 'Desarmada'], ['armedHome', 'Armada en casa'], ['armedAway', 'Armada fuera']],
      (value) => ({ type: value === 'armedHome' ? 'armHome' : value === 'armedAway' ? 'armAway' : 'disarm' }));
  }
  row.append(heading, controls, feedback);
  entities.append(row);
  views.set(entity.id, { update });
  update();
  required('entity-count').textContent = `${views.size} simuladas`;
}

function addEvent(event: PulseEvent): void {
  const followLatest = eventList.scrollHeight - eventList.scrollTop - eventList.clientHeight < 24;
  if (event.type === 'discovered') addEntity(event.value);
  else views.get(event.entityId)?.update();
  const entity = registry.list().find((item) => item.id === event.entityId);
  const item = element('li', 'event');
  const time = element('time', 'event-time', new Date(event.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  time.dateTime = new Date(event.timestamp).toISOString();
  const body = element('div', 'event-body');
  body.append(element('strong', '', entity?.name ?? event.entityId));
  const description = event.type === 'discovered' ? 'Entidad descubierta' : stateDescription(event.value);
  body.append(element('p', '', description));
  item.append(time, body);
  eventList.append(item);
  if (followLatest) eventList.scrollTop = eventList.scrollHeight;
  required('event-empty').hidden = true;
  required('event-count').textContent = `${registry.getEvents().length} eventos`;
  if (event.type === 'stateChanged') required('announcement').textContent = `${entity?.name ?? event.entityId}. ${description}`;
}

const unsubscribe = registry.subscribe(addEvent);

async function discover() {
  discovery.hidden = false;
  discovery.textContent = 'Cargando la simulación…';
  discovery.classList.remove('error');
  retry.hidden = true;
  retry.disabled = true;
  try {
    await registry.discover();
    for (const entity of registry.list()) addEntity(entity);
    discovery.hidden = views.size > 0;
    if (!views.size) {
      discovery.textContent = 'No se cargaron entidades simuladas.';
      required('entity-count').textContent = '0 simuladas';
    }
  } catch (error) {
    discovery.textContent = `No se pudo completar el descubrimiento. ${error instanceof Error ? error.message : 'Inténtalo de nuevo.'}`;
    discovery.classList.add('error');
    retry.hidden = false;
    required('entity-count').textContent = `${views.size} simuladas`;
  } finally {
    retry.disabled = false;
  }
}

retry.addEventListener('click', () => { void discover(); });
void discover();

if (import.meta.hot) import.meta.hot.dispose(() => { disposeLan(); matter.dispose(); unsubscribe(); registry.dispose(); });
