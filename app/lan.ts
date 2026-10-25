import type { DiscoveredDevice, DiscoveryResult } from '../adapters/lan/types.ts';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function mountLanDiscovery(root: HTMLElement, onPair?: (device: DiscoveredDevice, trigger: HTMLElement) => void | Promise<void>): () => void {
  const heading = node('div', 'section-heading');
  const title = node('h2', '', 'En tu red');
  title.id = 'lan-heading';
  root.setAttribute('aria-labelledby', title.id);
  const count = node('span');
  const headingActions = node('div', 'lan-heading-actions');
  const add = node('button', 'lan-add', 'Agregar dispositivo');
  add.type = 'button';
  add.setAttribute('aria-expanded', 'false');
  add.setAttribute('aria-controls', 'lan-add-guide');
  headingActions.append(count, add);
  heading.append(title, headingActions);
  const body = node('div', 'lan-body');
  const guide = node('section', 'lan-add-guide');
  guide.id = 'lan-add-guide';
  guide.hidden = true;
  guide.setAttribute('aria-labelledby', 'lan-add-title');
  const guideTitle = node('h3', '', 'Agrega desde tu red');
  guideTitle.id = 'lan-add-title';
  const instructions = node('p', '', 'Enciende el dispositivo y conéctalo al mismo Wi-Fi. Elige Agregar cuando aparezca abajo. Pulse te pedirá un código solo si hace falta.');
  const availability = node('p', 'lan-add-status');
  availability.setAttribute('role', 'status');
  const closeGuide = node('button', 'lan-guide-close', 'Listo');
  closeGuide.type = 'button';
  guide.append(guideTitle, instructions, availability, closeGuide);
  const toolbar = node('div', 'lan-toolbar');
  const info = node('div', 'lan-info');
  const network = node('p', 'lan-network', 'Consultando la conexión de esta máquina…');
  const status = node('p', 'lan-status');
  status.setAttribute('role', 'status');
  info.append(network, status);
  const search = node('button', 'lan-search', 'Buscar en mi red');
  search.type = 'button';
  search.disabled = true;
  toolbar.append(info, search);
  const warnings = node('ul', 'lan-warnings');
  const list = node('ul', 'lan-devices');
  list.setAttribute('aria-label', 'Dispositivos y servicios encontrados en la red');
  const note = node('p', 'lan-note', 'Los dispositivos compatibles muestran Agregar. Encontrar un dispositivo no significa que Pulse ya pueda controlarlo.');
  body.append(guide, toolbar, warnings, list, note);
  root.append(heading, body);

  let result: DiscoveryResult = { status: 'idle', devices: [], warnings: [] };
  let busy = false;
  let disposed = false;
  const added = new Set<string>();
  const adding = new Set<string>();
  const failures = new Map<string, string>();
  const controller = new AbortController();

  function render() {
    if (disposed) return;
    const scanning = busy || result.status === 'scanning';
    search.disabled = scanning;
    const canAdd = (device: DiscoveredDevice) => Boolean(device.upnp || (device.matter?.commissioning === 'open' && device.matter.pairing && device.addresses.length));
    const available = result.devices.filter(canAdd);
    availability.textContent = scanning ? 'Buscando dispositivos…'
      : result.status === 'error' ? 'No pudimos completar la búsqueda. Vuelve a intentar.'
      : result.status !== 'complete' ? 'Busca en tu red para continuar.'
      : available.length ? 'Elige Agregar en el dispositivo que quieras usar.'
      : result.devices.length ? 'Encontramos estos dispositivos, pero todavía no hay uno que Pulse pueda agregar.' : 'No encontramos dispositivos. Comprueba que estén encendidos y vuelve a buscar.';
    search.textContent = scanning ? 'Buscando…' : result.status === 'error' ? 'Volver a buscar' : 'Buscar en mi red';
    network.textContent = 'Red local de esta máquina';
    count.textContent = result.devices.length || result.status === 'complete' ? `${result.devices.length} encontrados${scanning ? ' · búsqueda anterior' : ''}` : '';
    status.classList.toggle('error', !scanning && result.status === 'error');
    status.textContent = scanning ? 'Buscando dispositivos… tarda unos 10 segundos.'
      : result.status === 'error' ? result.error ?? 'No se pudo completar la búsqueda. Vuelve a intentar.'
      : result.status === 'idle' ? 'Lista para buscar dispositivos.'
      : result.devices.length ? `Última búsqueda: ${new Date(result.completedAt ?? Date.now()).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.`
      : 'No se recibieron anuncios en esta búsqueda. Puede haber dispositivos que no se anuncian; puedes volver a buscar.';
    warnings.replaceChildren(...result.warnings.map((warning) => node('li', '', warning)));
    warnings.hidden = result.warnings.length === 0;
    list.hidden = result.devices.length === 0;
    list.replaceChildren(...result.devices.map((device) => {
      const item = node('li', 'lan-device');
      const identity = node('div', 'lan-device-identity');
      identity.append(node('h3', '', device.name));
      if (device.model) identity.append(node('p', 'lan-model', device.model));
      const details = node('details', 'lan-device-details');
      details.append(node('summary', '', 'Detalles técnicos'));
      details.append(node('p', 'lan-address', device.addresses.join(' · ') || device.host || 'Dirección no anunciada'));
      if (device.protocols.length) details.append(node('p', 'lan-protocols', device.protocols.join(' · ')));
      if (device.services.length) details.append(node('p', 'lan-services', device.services.join(' · ')));
      if (device.matter) {
        const description = device.matter.commissioning === 'open' ? 'Matter: vinculación disponible.'
          : device.matter.commissioning === 'closed' ? 'Matter: activa la vinculación en la app del dispositivo.'
          : 'Se recibió un anuncio Matter.';
        details.append(node('p', 'lan-matter', description));
      }
      const actions = node('div', 'lan-device-actions');
      if (onPair && canAdd(device)) {
        const isAdded = added.has(device.id);
        const isAdding = adding.has(device.id);
        const pair = node('button', 'lan-pair', isAdded ? 'Agregado' : isAdding ? 'Agregando…' : 'Agregar');
        pair.type = 'button';
        pair.disabled = scanning || isAdded || isAdding;
        pair.setAttribute('aria-label', `${isAdded ? 'Agregado' : 'Agregar'} ${device.name} a Pulse`);
        pair.addEventListener('click', () => {
          if (adding.has(device.id)) return;
          adding.add(device.id); failures.delete(device.id);
          pair.disabled = true; pair.textContent = 'Agregando…';
          Promise.resolve(onPair(device, pair)).then(() => {
            if (device.upnp) added.add(device.id);
          }).catch((error: unknown) => {
            failures.set(device.id, error instanceof Error ? error.message : 'No pudimos conectar. Comprueba que esté encendido y vuelve a intentar.');
          }).finally(() => { adding.delete(device.id); render(); });
        });
        actions.append(pair);
      } else {
        actions.append(node('span', 'lan-found', 'Control aún no disponible'));
        identity.append(node('p', 'lan-compatibility', device.services.some((service) => service.includes('_googlecast'))
          ? 'Pulse lo encuentra, pero todavía no puede controlar Chromecast.'
          : device.matter ? 'Para agregarlo, habilita la vinculación desde su app.' : 'Pulse lo encuentra, pero todavía no tiene controles para este equipo.'));
      }
      const failure = failures.get(device.id);
      if (failure) {
        const feedback = node('p', 'lan-feedback error', failure);
        feedback.setAttribute('role', 'status');
        identity.append(feedback);
      }
      item.append(identity, details, actions);
      return item;
    }));
  }

  async function request(method: 'GET' | 'POST', timeout = 18_000): Promise<DiscoveryResult> {
    const response = await fetch('/api/discovery', {
      method,
      headers: method === 'POST' ? { 'X-Pulse-Discovery': '1' } : undefined,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('No se pudo consultar el servicio local. Vuelve a intentar.');
    }
    return response.json() as Promise<DiscoveryResult>;
  }

  async function refresh(method: 'GET' | 'POST') {
    if (busy) return;
    busy = true;
    if (method === 'POST') render();
    try {
      result = await request(method);
      // Another tab may already be scanning. Read its shared result for at most 15 seconds.
      const deadline = Date.now() + 15_000;
      while (result.status === 'scanning' && Date.now() < deadline && !disposed) {
        render();
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        if (!disposed && Date.now() < deadline) result = await request('GET', Math.max(1, deadline - Date.now()));
      }
      if (result.status === 'scanning' && !disposed) {
        throw new Error('La búsqueda sigue en curso. Vuelve a consultar en unos segundos.');
      }
    } catch (error) {
      if (!disposed) {
        const message = error instanceof Error && error.name === 'TimeoutError'
          ? 'El servicio local tardó demasiado en responder. Vuelve a intentar.'
          : error instanceof TypeError || error instanceof SyntaxError
            ? 'No se pudo consultar el servicio local. Vuelve a intentar.'
            : error instanceof Error ? error.message : 'No se pudo completar la búsqueda. Vuelve a intentar.';
        result = { ...result, status: 'error', error: message };
      }
    } finally {
      busy = false;
      render();
    }
  }

  add.addEventListener('click', () => {
    guide.hidden = false;
    add.setAttribute('aria-expanded', 'true');
    render();
    void initialRefresh.then(() => { if (!disposed) void refresh('POST'); });
  });
  closeGuide.addEventListener('click', () => {
    guide.hidden = true;
    add.setAttribute('aria-expanded', 'false');
    add.focus();
  });
  search.addEventListener('click', () => { void refresh('POST'); });
  const initialRefresh = refresh('GET');
  return () => { disposed = true; controller.abort(); };
}
