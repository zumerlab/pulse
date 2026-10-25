import { chmod, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import {
  ControllerBehavior, Crypto, Entropy, Environment, Filesystem, Logger, Network,
  NetworkClient, Seconds, ServerNode, StorageService,
  type ClientNode, type Endpoint,
} from '@matter/main';
import { FileStorageDriver, FlatFileBlobStorageDriver, NodeJsCrypto, NodeJsFilesystem, NodeJsNetwork } from '@matter/nodejs';
import { ManualPairingCodeCodec, QrPairingCodeCodec, isValidPasscode } from '@matter/main/types';
import { validateAction, type Action } from '../../core/action.ts';
import type { State } from '../../core/entity.ts';
import type { MatterDriver, MatterEndpoint, PairingTarget } from './types.ts';

type ClusterState = Readonly<Record<string, unknown>>;
export interface MatterSnapshot {
  onOff?: ClusterState;
  levelControl?: ClusterState;
  thermostat?: ClusterState;
  windowCovering?: ClusterState;
}

const clusters = ['onOff', 'levelControl', 'thermostat', 'windowCovering'] as const;
const hvacNames: Record<number, string> = { 0: 'off', 1: 'auto', 3: 'cool', 4: 'heat' };
const hvacValues = { off: 0, cool: 3, heat: 4 };
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Decode a single setup payload without retaining it or exposing SDK errors containing it. */
export function decodeMatterCode(code: string, discriminator?: number): { passcode: number; discriminator?: number } {
  try {
    const text = code.trim();
    if (!text || text.length > 258) throw new Error();
    if (text.startsWith('MT:')) {
      const payloads = QrPairingCodeCodec.decode(text);
      if (payloads.length !== 1) throw new Error();
      const payload = payloads[0];
      if (!isValidPasscode(payload.passcode) || (discriminator !== undefined && payload.discriminator !== discriminator)) throw new Error();
      return { passcode: payload.passcode, discriminator: payload.discriminator };
    }
    if (!/^[\d -]+$/.test(text)) throw new Error();
    const payload = ManualPairingCodeCodec.decode(text.replace(/[ -]/g, ''));
    if (!isValidPasscode(payload.passcode) || (discriminator !== undefined && payload.shortDiscriminator !== (discriminator >> 8))) throw new Error();
    return { passcode: payload.passcode, ...(discriminator !== undefined && { discriminator }) };
  } catch {
    throw new Error('El código Matter no es válido o no corresponde al dispositivo seleccionado.');
  }
}

function targetSetpoint(thermostat: ClusterState): 'occupiedHeatingSetpoint' | 'occupiedCoolingSetpoint' | undefined {
  const heat = numeric(thermostat.occupiedHeatingSetpoint);
  const cool = numeric(thermostat.occupiedCoolingSetpoint);
  if (heat && thermostat.systemMode === 4) return 'occupiedHeatingSetpoint';
  if (cool && thermostat.systemMode === 3) return 'occupiedCoolingSetpoint';
  if (heat && !cool) return 'occupiedHeatingSetpoint';
  if (cool && !heat) return 'occupiedCoolingSetpoint';
}

function targetBounds(thermostat: ClusterState, field?: string): [number, number] {
  const mode = field === 'occupiedCoolingSetpoint' ? 'Cool' : 'Heat';
  const minimum = thermostat[`min${mode}SetpointLimit`] ?? thermostat[`absMin${mode}SetpointLimit`];
  const maximum = thermostat[`max${mode}SetpointLimit`] ?? thermostat[`absMax${mode}SetpointLimit`];
  return [numeric(minimum) ? minimum / 100 : 5, numeric(maximum) ? maximum / 100 : 35];
}

/** The only conversion from Matter cluster reports to Pulse state; no requested values enter here. */
export function projectMatterEndpoint(
  id: string, name: string, snapshot: MatterSnapshot, online: boolean,
  supports: (cluster: string, command: number) => boolean,
): MatterEndpoint | undefined {
  const state: State = { online };
  const capabilities: MatterEndpoint['capabilities'] = [];
  let domain: MatterEndpoint['domain'] = 'lighting';
  const thermostat = snapshot.thermostat;
  if (thermostat) {
    domain = 'climate';
    if ('localTemperature' in thermostat) {
      capabilities.push('temperature');
      state.temperature = numeric(thermostat.localTemperature) ? thermostat.localTemperature / 100 : null;
    }
    const heat = numeric(thermostat.occupiedHeatingSetpoint);
    const cool = numeric(thermostat.occupiedCoolingSetpoint);
    if (heat || cool) {
      capabilities.push('targetTemperature');
      const field = targetSetpoint(thermostat);
      state.targetTemperature = field ? Number(thermostat[field]) / 100 : null;
      state.targetTemperatureWritable = field !== undefined;
      [state.minTargetTemperature, state.maxTargetTemperature] = targetBounds(thermostat, field);
    }
    if (numeric(thermostat.systemMode)) {
      capabilities.push('hvacMode');
      state.hvacMode = hvacNames[thermostat.systemMode] ?? 'unknown';
      // Auto uses two setpoints. Pulse's single-target control does not represent that mode yet.
      state.hvacModes = ['off', ...(heat ? ['heat'] : []), ...(cool ? ['cool'] : [])];
    }
  } else if (snapshot.windowCovering && supports('windowCovering', 5)) {
    domain = 'openings';
    const value = snapshot.windowCovering.currentPositionLiftPercent100ths;
    if (value === null || numeric(value)) {
      capabilities.push('position');
      // Matter is percent closed; Pulse is percent open.
      state.position = numeric(value) ? Math.round((10000 - value) / 100) : null;
    }
  } else {
    if (typeof snapshot.onOff?.onOff === 'boolean' && supports('onOff', 0) && supports('onOff', 1)) {
      capabilities.push('onOff');
      state.on = snapshot.onOff.onOff;
    }
    const level = snapshot.levelControl?.currentLevel;
    if ((numeric(level) || level === null) && supports('levelControl', 0)) {
      capabilities.push('brightness');
      state.brightness = numeric(level) ? Math.round(level / 254 * 100) : null;
    }
  }
  return capabilities.length ? { id, name, domain, capabilities, state } : undefined;
}

interface DriverOptions {
  storagePath: string;
  interfaceName: string;
  /** Test environments supply their own isolated network, crypto and storage. */
  environment?: Environment;
}

interface LinkedEndpoint {
  peer: ClientNode;
  endpoint: Endpoint;
  entity: MatterEndpoint;
}

/** A local, persistent Matter controller. It commissions only server-selected on-network targets. */
export class NativeMatterDriver implements MatterDriver {
  private readonly options: DriverOptions;
  private controller?: ServerNode;
  private environment?: Environment;
  private onReport: (entityId: string, state: State) => void = () => {};
  private readonly endpoints = new Map<string, LinkedEndpoint>();
  private readonly observed = new Set<Endpoint>();
  private readonly observedPeers = new Set<ClientNode>();
  private readonly onlinePeers = new Set<ClientNode>();
  private readonly writing = new Set<string>();
  private readonly subscriptions: Disposable[] = [];
  private readonly abort = new AbortController();
  private closed = false;

  constructor(options: DriverOptions) { this.options = options; }

  async start(onReport: (entityId: string, state: State) => void): Promise<MatterEndpoint[]> {
    if (this.closed) throw new Error('El controlador Matter está cerrado.');
    this.onReport = onReport;
    if (this.controller) return this.list();
    // SDK diagnostics may include onboarding payloads. Pulse provides bounded, sanitized errors instead.
    for (const destination of Object.values(Logger.destinations)) destination.write = () => {};
    let environment = this.options.environment;
    if (!environment) {
      await mkdir(this.options.storagePath, { recursive: true, mode: 0o700 });
      await chmod(this.options.storagePath, 0o700);
      environment = new Environment('pulse-matter');
      const crypto = new NodeJsCrypto();
      environment.set(Crypto, crypto);
      environment.set(Entropy, crypto);
      environment.set(Network, new NodeJsNetwork());
      environment.set(Filesystem, new NodeJsFilesystem(this.options.storagePath));
      const storage = new StorageService(environment);
      storage.registerDriver(FileStorageDriver);
      storage.defaultDriver = 'file';
      storage.registerBlobDriver(FlatFileBlobStorageDriver);
      storage.defaultBlobDriver = 'flat';
    }
    this.environment = environment;
    environment.vars.set('mdns.networkInterface', this.options.interfaceName);
    environment.vars.set('runtime.signals', false);
    environment.vars.set('runtime.exitcode', false);
    const controller = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
      id: 'pulse-controller', environment,
      basicInformation: { productName: 'Pulse' },
      controller: { adminFabricLabel: 'Pulse', ble: false },
      commissioning: { enabled: false },
      network: { port: 0, ble: false, tcp: false, clientCacheFlushInterval: Seconds(1) },
      subscriptions: { persistenceEnabled: false },
    });
    this.controller = controller;
    for (const peer of controller.peers) if (peer.lifecycle.isCommissioned) this.instrument(peer);
    await controller.start();
    return this.list();
  }

  async commission(target: PairingTarget, code: string): Promise<MatterEndpoint[]> {
    const controller = this.requireController();
    if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535 ||
      !target.addresses.length || target.addresses.length > 16 ||
      target.addresses.some((address) => !isIP(address.split('%')[0]))) {
      throw new Error('El dispositivo no tiene una dirección Matter válida. Vuelve a buscar.');
    }
    const payload = decodeMatterCode(code, target.discriminator);
    const peer = await controller.peers.forDescriptor({
      addresses: target.addresses.map((ip) => ({ type: 'udp' as const, ip, port: target.port })),
      ...(target.discriminator !== undefined && { D: target.discriminator }),
    });
    try {
      await peer.commission({
        ...payload, timeout: Seconds(30), abort: this.abort.signal,
        discoveryCapabilities: { ble: false, onIpNetwork: true },
        autoSubscribe: true,
        caseConnectionTiming: { defaultConnectionTimeout: Seconds(20), delayBeforeNextAddress: Seconds(3) },
      });
      this.onlinePeers.add(peer);
      this.instrument(peer);
      return this.collect(peer).map((entry) => structuredClone(entry.entity));
    } catch {
      // Never remove a fabric here: a lost final response can leave a successfully commissioned peer.
      if (peer.lifecycle.isCommissioned) this.instrument(peer);
      else await peer.delete().catch(() => {});
      throw new Error('No se pudo completar la vinculación Matter. Comprueba el código, la ventana de vinculación y la conexión.');
    }
  }

  async execute(entityId: string, action: Action): Promise<void> {
    this.requireController();
    const linked = this.endpoints.get(entityId);
    if (!linked) throw new Error('No se encontró el dispositivo Matter vinculado.');
    if (this.writing.has(entityId)) throw new Error('Hay una acción en curso para este dispositivo.');
    validateAction(linked.entity.capabilities, action);
    const { endpoint, peer } = linked;
    this.writing.add(entityId);
    let cluster: typeof clusters[number];
    try {
      switch (action.type) {
        case 'turnOn': case 'turnOff':
          cluster = 'onOff';
          await endpoint.commandsOf(cluster)[action.type === 'turnOn' ? 'on' : 'off'](undefined);
          break;
        case 'setBrightness':
          cluster = 'levelControl';
          await endpoint.commandsOf(cluster).moveToLevel({
            level: Math.round(action.value * 254 / 100), transitionTime: 0,
            optionsMask: { executeIfOff: true }, optionsOverride: { executeIfOff: true },
          });
          break;
        case 'setPosition':
          cluster = 'windowCovering';
          await endpoint.commandsOf(cluster).goToLiftPercentage({ liftPercent100thsValue: Math.round((100 - action.value) * 100) });
          break;
        case 'setHvacMode': {
          cluster = 'thermostat';
          if (!Object.hasOwn(hvacValues, action.value) || !(linked.entity.state.hvacModes as string[]).includes(action.value)) {
            throw new Error('Este modo no está disponible en el termostato.');
          }
          await endpoint.setStateOf(cluster, { systemMode: hvacValues[action.value as keyof typeof hvacValues] });
          break;
        }
        case 'setTargetTemperature': {
          cluster = 'thermostat';
          // Refresh mode and device limits before selecting a writable setpoint.
          const thermostat = await endpoint.getStateOf(cluster);
          const field = targetSetpoint(thermostat);
          if (!field) throw new Error('Selecciona primero Calor o Frío para cambiar la temperatura objetivo.');
          const [minimum, maximum] = targetBounds(thermostat, field);
          if (action.value < minimum || action.value > maximum) throw new Error(`La temperatura debe estar entre ${minimum} y ${maximum} °C.`);
          await endpoint.setStateOf(cluster, { [field]: Math.round(action.value * 100) });
          break;
        }
        default: throw new Error('Esta acción Matter aún no está disponible.');
      }
      // Force a remote read even when subscription data versions are unchanged. No optimistic state.
      await endpoint.getStateOf(cluster, undefined, { includeKnownVersions: true });
      this.onlinePeers.add(peer);
    } finally {
      this.writing.delete(entityId);
      this.publish(peer);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    for (const subscription of this.subscriptions) subscription[Symbol.dispose]();
    this.subscriptions.length = 0;
    try {
      await this.controller?.close();
    } finally {
      this.controller = undefined;
      if (!this.options.environment && this.environment) {
        await this.environment.close(Network);
        this.environment[Symbol.dispose]();
      }
    }
  }

  private requireController(): ServerNode {
    if (this.closed || !this.controller) throw new Error('El controlador Matter no está listo.');
    return this.controller;
  }

  private list(): MatterEndpoint[] { return [...this.endpoints.values()].map(({ entity }) => structuredClone(entity)); }

  private collect(peer: ClientNode): LinkedEndpoint[] {
    const entries: LinkedEndpoint[] = [];
    const walk = (endpoint: Endpoint) => {
      const snapshot: MatterSnapshot = {};
      for (const cluster of clusters) snapshot[cluster] = endpoint.maybeStateOf(cluster);
      const basic = endpoint.maybeStateOf('bridgedDeviceBasicInformation') ?? peer.maybeStateOf('basicInformation');
      const label = String(basic?.nodeLabel || basic?.productName || 'Dispositivo Matter').slice(0, 120);
      const id = `matter:${peer.id}:${endpoint.number}`;
      const entity = projectMatterEndpoint(id, endpoint.number > 1 ? `${label} · ${endpoint.number}` : label,
        snapshot, this.onlinePeers.has(peer),
        (cluster, command) => endpoint.maybeGlobalsOf(cluster)?.acceptedCommandList?.some((id) => Number(id) === command) === true);
      if (entity) entries.push({ peer, endpoint, entity });
      for (const part of endpoint.parts) walk(part);
    };
    walk(peer);
    return entries;
  }

  private instrument(peer: ClientNode): void {
    if (!this.observedPeers.has(peer)) {
      this.observedPeers.add(peer);
      const network = peer.eventsOf(NetworkClient);
      this.subscriptions.push(network.subscriptionStatusChanged.use((online) => {
        if (online) this.onlinePeers.add(peer); else this.onlinePeers.delete(peer);
        this.publish(peer);
      }));
      this.subscriptions.push(network.subscriptionAlive.use(() => { this.onlinePeers.add(peer); this.publish(peer); }));
      this.subscriptions.push(peer.lifecycle.changed.use(() => this.instrument(peer)));
    }
    for (const linked of this.collect(peer)) {
      this.endpoints.set(linked.entity.id, linked);
      if (this.observed.has(linked.endpoint)) continue;
      this.observed.add(linked.endpoint);
      for (const cluster of clusters) {
        if (!linked.endpoint.maybeStateOf(cluster)) continue;
        for (const [name, event] of Object.entries(linked.endpoint.eventsOf(cluster))) {
          if (name.endsWith('$Changed') && event) this.subscriptions.push(event.use(() => {
            if (!this.writing.has(linked.entity.id)) this.publish(peer);
          }));
        }
      }
    }
  }

  private publish(peer: ClientNode): void {
    if (this.closed) return;
    for (const linked of this.collect(peer)) {
      if (this.writing.has(linked.entity.id)) continue;
      const previous = this.endpoints.get(linked.entity.id);
      this.endpoints.set(linked.entity.id, linked);
      if (previous && JSON.stringify(previous.entity.state) !== JSON.stringify(linked.entity.state)) {
        this.onReport(linked.entity.id, structuredClone(linked.entity.state));
      }
    }
  }
}
