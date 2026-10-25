import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { DiscoveredDevice } from '../lan/types.ts';
import type { Capability } from '../../core/capability.ts';
import type { State } from '../../core/entity.ts';

const LIMIT = 262_144;
const RENDERER = /^urn:schemas-upnp-org:device:MediaRenderer:\d+$/;
const CONTROL = /^urn:schemas-upnp-org:service:RenderingControl:\d+$/;
type Xml = Record<string, unknown>;
export interface Renderer {
  id: string; name: string; candidate: DiscoveredDevice; controlUrl: string; serviceType: string;
  capabilities: Capability[]; volumeRange?: { minimum: number; maximum: number; step: number }; state: State;
}
const record = (value: unknown): Xml => value && typeof value === 'object' && !Array.isArray(value) ? value as Xml : {};
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const label = (value: string) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_match, key: string) => ({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
})[key]!);

/** Pin every fetch to the numeric address advertised by this scan, including relative service URLs. */
export function pinnedUrl(value: string, candidate: DiscoveredDevice, base?: string): URL {
  const url = new URL(value, base);
  const original = candidate.upnp ? new URL(candidate.upnp.descriptionUrl) : undefined;
  if (url.protocol !== 'http:' || url.username || url.password || url.hash || isIP(url.hostname) !== 4
    || !candidate.addresses.includes(url.hostname) || !original || url.hostname !== original.hostname) {
    throw new Error('La dirección local del televisor no es válida.');
  }
  return url;
}
function xml(body: string): Xml {
  if (body.length > LIMIT || /<!\s*(?:DOCTYPE|ENTITY)/i.test(body) || XMLValidator.validate(body) !== true) {
    throw new Error('Respuesta XML no válida.');
  }
  // Bound nesting before parsing, then bound the resulting tree. External/custom entities are forbidden.
  let depth = 0;
  for (const tag of body.matchAll(/<([^>]+)>/g)) {
    if (/^[?!]/.test(tag[1])) continue;
    if (tag[1].startsWith('/')) depth--;
    else if (!tag[1].endsWith('/')) depth++;
    if (depth > 24) throw new Error('Respuesta XML demasiado compleja.');
  }
  const parsed: unknown = new XMLParser({ removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(body);
  const pending: unknown[] = [parsed];
  let count = 0;
  while (pending.length) {
    const next = pending.pop();
    if (++count > 5_000) throw new Error('Respuesta XML demasiado compleja.');
    if (next && typeof next === 'object') pending.push(...Object.values(next));
  }
  return record(parsed);
}
async function request(url: URL, options: RequestInit = {}): Promise<Xml> {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(3_000) });
  if (!response.ok || Number(response.headers.get('content-length')) > LIMIT || !response.body) {
    throw new Error('El televisor no respondió correctamente.');
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) throw new Error('Respuesta del televisor demasiado grande.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return xml(Buffer.concat(chunks).toString('utf8'));
}
function findRenderer(device: unknown): Xml | undefined {
  const current = record(device);
  if (RENDERER.test(text(current.deviceType))) return current;
  for (const child of list(record(current.deviceList).device)) {
    const found = findRenderer(child);
    if (found) return found;
  }
}
function actionArguments(action: unknown, name: string, expected: string[]): boolean {
  const value = record(action);
  if (text(value.name) !== name) return false;
  const args = list(record(value.argumentList).argument).map(record);
  return args.length === expected.length && expected.every((arg) => args.some((item) => text(item.name) === arg
    && text(item.direction) === (arg.startsWith('Current') ? 'out' : 'in')));
}
export async function inspectRenderer(candidate: DiscoveredDevice): Promise<Renderer> {
  if (!candidate.upnp || !RENDERER.test(candidate.upnp.deviceType)) throw new Error('Este dispositivo no anuncia controles de TV compatibles.');
  const descriptionUrl = pinnedUrl(candidate.upnp.descriptionUrl, candidate);
  const root = record((await request(descriptionUrl)).root);
  const device = findRenderer(root.device);
  if (!device) throw new Error('El dispositivo no anuncia un televisor compatible.');
  const udn = text(device.UDN);
  if (!udn || udn.length > 256) throw new Error('El televisor no tiene una identidad válida.');
  const service = list(record(device.serviceList).service).map(record).find((item) => CONTROL.test(text(item.serviceType)));
  if (!service) throw new Error('Este televisor no anuncia controles de sonido compatibles.');
  const base = root.URLBase ? pinnedUrl(text(root.URLBase), candidate).href : descriptionUrl.href;
  const controlUrl = pinnedUrl(text(service.controlURL), candidate, base).href;
  const scpdUrl = pinnedUrl(text(service.SCPDURL), candidate, base);
  if (!text(service.controlURL) || !text(service.SCPDURL)) throw new Error('Los controles del televisor están incompletos.');
  const scpd = record((await request(scpdUrl)).scpd);
  const actions = list(record(scpd.actionList).action);
  const variables = list(record(scpd.serviceStateTable).stateVariable).map(record);
  const supports = (suffix: string) => actions.some((action) => actionArguments(action, `Get${suffix}`, ['InstanceID', 'Channel', `Current${suffix}`]))
    && actions.some((action) => actionArguments(action, `Set${suffix}`, ['InstanceID', 'Channel', `Desired${suffix}`]));
  const channels = variables.find((variable) => text(variable.name) === 'A_ARG_TYPE_Channel');
  if (!list(record(channels?.allowedValueList).allowedValue).some((value) => text(value) === 'Master')) {
    throw new Error('El televisor no anuncia un canal de sonido compatible.');
  }
  const volume = variables.find((variable) => text(variable.name) === 'Volume');
  const range = record(volume?.allowedValueRange);
  const minimum = Number(text(range.minimum));
  const maximum = Number(text(range.maximum));
  const step = range.step === undefined ? 1 : Number(text(range.step));
  const capabilities: Capability[] = [];
  if (supports('Volume') && range.minimum !== undefined && range.maximum !== undefined
    && Number.isInteger(minimum) && Number.isInteger(maximum) && minimum >= 0 && maximum > minimum && maximum <= 65_535
    && Number.isInteger(step) && step > 0 && step <= maximum - minimum) capabilities.push('volume');
  if (supports('Mute') && text(variables.find((variable) => text(variable.name) === 'Mute')?.dataType) === 'boolean') capabilities.push('mute');
  const renderer: Renderer = {
    id: `upnp:${createHash('sha256').update(udn).digest('hex').slice(0, 24)}`,
    name: label(text(device.friendlyName) || candidate.name).slice(0, 160), candidate: structuredClone(candidate),
    controlUrl, serviceType: text(service.serviceType), capabilities, state: { online: true },
    ...(capabilities.includes('volume') ? { volumeRange: { minimum, maximum, step } } : {}),
  };
  // A named action alone is not enough: expose only controls with valid hardware readings.
  for (const capability of [...capabilities]) {
    try { Object.assign(renderer.state, await readControl(renderer, capability)); }
    catch { renderer.capabilities = renderer.capabilities.filter((item) => item !== capability); }
  }
  if (!renderer.capabilities.length) throw new Error('El televisor no ofrece controles de sonido que Pulse pueda leer y cambiar.');
  return renderer;
}
async function soap(renderer: Renderer, action: string, value?: number | boolean): Promise<Xml> {
  const extra = value === undefined ? '' : `<Desired${action.slice(3)}>${typeof value === 'boolean' ? Number(value) : value}</Desired${action.slice(3)}>`;
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${renderer.serviceType}"><InstanceID>0</InstanceID><Channel>Master</Channel>${extra}</u:${action}></s:Body></s:Envelope>`;
  const parsed = await request(pinnedUrl(renderer.controlUrl, renderer.candidate), { method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${renderer.serviceType}#${action}"` }, body });
  const result = record(record(parsed.Envelope).Body);
  if (result.Fault || result[`${action}Response`] === undefined) throw new Error('El televisor rechazó la acción.');
  return record(result[`${action}Response`]);
}
async function readControl(renderer: Renderer, capability: Capability): Promise<State> {
  if (capability === 'volume') {
    const response = await soap(renderer, 'GetVolume');
    const raw = text(response.CurrentVolume);
    const value = Number(raw);
    const range = renderer.volumeRange!;
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < range.minimum || value > range.maximum) throw new Error('Volumen no válido.');
    return { volume: Math.round((value - range.minimum) * 100 / (range.maximum - range.minimum)) };
  }
  const response = await soap(renderer, 'GetMute');
  const raw = text(response.CurrentMute).toLowerCase();
  if (!['0', '1', 'true', 'false'].includes(raw)) throw new Error('Estado de silencio no válido.');
  return { muted: raw === '1' || raw === 'true' };
}
export async function readRenderer(renderer: Renderer): Promise<State> {
  const states = await Promise.all(renderer.capabilities.map((capability) => readControl(renderer, capability)));
  return Object.assign({ online: true }, ...states) as State;
}
export async function writeRenderer(renderer: Renderer, capability: 'volume' | 'mute', value: number | boolean): Promise<State> {
  if (capability === 'volume') {
    const range = renderer.volumeRange!;
    const native = range.minimum + Math.round((Number(value) / 100) * (range.maximum - range.minimum) / range.step) * range.step;
    await soap(renderer, 'SetVolume', Math.max(range.minimum, Math.min(range.maximum, native)));
  } else await soap(renderer, 'SetMute', Boolean(value));
  return readRenderer(renderer);
}
