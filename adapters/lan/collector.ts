import { isIPv4 } from 'node:net';
import type { Packet, Question } from 'dns-packet';
import { canonicalIPv6, isOnNetwork, isOwnAddress, scopedIPv6Address } from './network.ts';
import type { DiscoveredDevice, NetworkInfo } from './types.ts';

const ENUMERATION = '_services._dns-sd._udp.local';
const MAX_RECORDS = 1000;
const MAX_QUERIES = 256;
const serviceType = /^_[a-z0-9-]+\._(?:tcp|udp)\.local$/i;

interface RecordEntry {
  type: 'PTR' | 'SRV' | 'TXT' | 'A' | 'AAAA';
  name: string;
  display: string;
  value: string;
  metadata: Record<string, string>;
  port?: number;
  lastSeen: number;
  expires: number;
}

interface SsdpEntry {
  id: string;
  address: string;
  service: string;
  upnp?: DiscoveredDevice['upnp'];
  lastSeen: number;
  expires: number;
}

function clean(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 && character !== '<' && character !== '>';
  }).join('').trim().slice(0, 200);
}

function unsafeText(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) < 32 ||
    character.charCodeAt(0) === 127 || character === '<' || character === '>');
}

function dnsName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 254 || unsafeText(value)) return;
  const name = value.replace(/\.$/, '').toLowerCase();
  return name.endsWith('.local') ? name : undefined;
}

function protocols(service: string): string[] {
  const result = ['Bonjour/mDNS'];
  if (service === '_googlecast._tcp.local') result.push('Google Cast');
  if (['_airplay._tcp.local', '_raop._tcp.local'].includes(service)) result.push('AirPlay');
  if (service === '_hap._tcp.local') result.push('HomeKit');
  if (['_matter._tcp.local', '_matterc._udp.local', '_matterd._udp.local'].includes(service)) result.push('Matter');
  return result;
}

function ssdpLabel(service: string): string {
  if (service === 'roku:ecp') return 'Roku';
  if (service.includes(':MediaRenderer:')) return 'Reproductor multimedia UPnP';
  if (service.includes(':MediaServer:')) return 'Servidor multimedia UPnP';
  if (service.includes(':InternetGatewayDevice:')) return 'Router UPnP';
  return 'Dispositivo UPnP';
}

function rendererDescription(service: string, location: string | undefined, sender: string): DiscoveredDevice['upnp'] {
  if (!/^urn:schemas-upnp-org:device:MediaRenderer:[1-9]\d*$/i.test(service) || !location) return;
  try {
    const url = new URL(location);
    // A renderer may advertise its own HTTP endpoint, never another host or credentials.
    if (url.protocol !== 'http:' || !isIPv4(url.hostname) || url.hostname !== sender ||
      url.username || url.password || url.hash || (url.port && Number(url.port) === 0)) return;
    return { descriptionUrl: url.href, deviceType: service };
  } catch { return; }
}

function matterInfo(service: string, metadata: Record<string, string>, port?: number): DiscoveredDevice['matter'] {
  if (service === '_matter._tcp.local') return { operational: true };
  if (service === '_matterd._udp.local') return { commissioner: true };
  if (service === '_matterc._udp.local') {
    const discriminator = /^(0|[1-9]\d{0,3})$/.test(metadata.d ?? '') && Number(metadata.d) <= 4095 ? Number(metadata.d) : undefined;
    return {
      commissioning: metadata.cm === '1' || metadata.cm === '2' ? 'open' : metadata.cm === '0' ? 'closed' : 'unknown',
      ...(port && { pairing: { port, ...(discriminator !== undefined && { discriminator }) } }),
    };
  }
}

function mergeMatter(left: DiscoveredDevice['matter'], right: DiscoveredDevice['matter']): DiscoveredDevice['matter'] {
  if (!left) return right;
  if (!right) return left;
  const commissioning = (['open', 'closed', 'unknown'] as const)
    .find((mode) => left.commissioning === mode || right.commissioning === mode);
  const result = { ...left, ...right, ...(commissioning && { commissioning }) };
  delete result.pairing;
  const pairing = [left, right].find((entry) => entry.commissioning === commissioning && entry.pairing)?.pairing;
  if (pairing) result.pairing = pairing;
  return result;
}

/** A scan-local inventory of advertisements, never a registry of controllable entities. */
export class DiscoveryCollector {
  private readonly network: NetworkInfo;
  private readonly records = new Map<string, RecordEntry>();
  private readonly ssdp = new Map<string, SsdpEntry>();
  private readonly asked = new Set<string>();

  constructor(network: NetworkInfo) {
    this.network = network;
  }

  private accepts(sender: string): boolean {
    return !isOwnAddress(sender, this.network) && isOnNetwork(sender, this.network);
  }

  private expire(now: number): void {
    for (const [key, record] of this.records) if (record.expires <= now) this.records.delete(key);
    for (const [key, record] of this.ssdp) if (record.expires <= now) this.ssdp.delete(key);
  }

  ingestMdns(packet: Packet, sender: string, now = Date.now()): Question[] {
    if (!this.accepts(sender) || !packet || packet.type === 'query') return [];
    this.expire(now);
    const questions: Question[] = [];
    const ask = (name: string, type: Question['type']) => {
      const key = `${type}:${name}`;
      if (this.asked.size >= MAX_QUERIES || this.asked.has(key)) return;
      this.asked.add(key);
      questions.push({ name, type });
    };
    const sections = [packet.answers, packet.additionals, packet.authorities];
    let processed = 0;
    for (const section of sections) {
      if (!Array.isArray(section)) continue;
      for (const raw of section) {
        if (++processed > MAX_RECORDS) break;
        if (!raw || typeof raw !== 'object' || !('data' in raw)) continue;
        const name = dnsName(raw.name);
        if (!name || typeof raw.ttl !== 'number' || !Number.isFinite(raw.ttl) || raw.ttl < 0) continue;
        const record: RecordEntry = {
          type: 'PTR', name, display: clean(raw.name.replace(/\.$/, '')), value: '', metadata: {},
          lastSeen: now, expires: now + Math.min(raw.ttl, 86400) * 1000,
        };
        if (raw.type === 'PTR') {
          const target = dnsName(raw.data);
          if (!target || (name !== ENUMERATION && !serviceType.test(name))) continue;
          record.value = target;
          record.display = clean(String(raw.data).replace(/\.$/, ''));
        } else if (raw.type === 'SRV') {
          const target = raw.data && typeof raw.data === 'object' && dnsName(raw.data.target);
          if (!target) continue;
          record.type = 'SRV';
          record.value = target;
          if (Number.isInteger(raw.data.port) && raw.data.port > 0 && raw.data.port <= 65535) record.port = raw.data.port;
        } else if (raw.type === 'TXT') {
          if (!Array.isArray(raw.data)) continue;
          record.type = 'TXT';
          for (const field of raw.data.slice(0, 64)) {
            if (!Buffer.isBuffer(field) || field.length > 1024) continue;
            const text = field.toString('utf8');
            const split = text.indexOf('=');
            const key = text.slice(0, split).toLowerCase();
            if (split > 0 && ['fn', 'md', 'model', 'am', 'ty', 'dn', 'cm', 'd'].includes(key)) {
              // Protocol numbers must match exactly, not become valid after sanitizing.
              record.metadata[key] = key === 'cm' || key === 'd' ? text.slice(split + 1) : clean(text.slice(split + 1));
            }
          }
        } else if (raw.type === 'A' && typeof raw.data === 'string' && isIPv4(raw.data)) {
          record.type = 'A';
          record.value = raw.data;
        } else if (raw.type === 'AAAA' && typeof raw.data === 'string') {
          const address = canonicalIPv6(raw.data);
          if (!address) continue;
          record.type = 'AAAA';
          record.value = address;
        } else continue;
        const key = `${record.type}:${name}:${['PTR', 'A', 'AAAA'].includes(record.type) ? record.value : ''}`;
        if (raw.ttl === 0) {
          this.records.delete(key);
          continue;
        }
        if (this.records.size + this.ssdp.size >= MAX_RECORDS && !this.records.has(key)) continue;
        this.records.set(key, record);
        if (record.type === 'PTR' && name === ENUMERATION && serviceType.test(record.value)) {
          ask(record.value, 'PTR');
        } else if (record.type === 'PTR' && serviceType.test(name) && record.value.endsWith(`.${name}`)) {
          ask(record.value, 'SRV');
          ask(record.value, 'TXT');
        } else if (record.type === 'SRV') {
          ask(record.value, 'A');
          ask(record.value, 'AAAA');
        }
      }
    }
    return questions;
  }

  ingestSsdp(message: Buffer, sender: string, now = Date.now()): void {
    if (!this.accepts(sender) || message.length > 8192) return;
    this.expire(now);
    const lines = message.toString('utf8').split(/\r?\n/);
    if (lines.length > 64 || !/^HTTP\/1\.[01] 200(?: |$)/i.test(lines.shift() ?? '')) return;
    const headers = new Map<string, string>();
    for (const line of lines) {
      if (!line) break;
      const colon = line.indexOf(':');
      if (colon <= 0) return;
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (headers.has(key) || value.length > 1024 || unsafeText(value)) return;
      headers.set(key, value);
    }
    const usn = headers.get('usn');
    const service = headers.get('st');
    const uuid = usn?.split('::')[0]?.toLowerCase();
    if (!uuid || !/^uuid:[a-z0-9_.:-]{1,200}$/i.test(uuid) || !service ||
      !/^[a-z0-9_.-]+:[a-z0-9_.:-]+$/i.test(service)) return;
    const maxAge = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(headers.get('cache-control') ?? '');
    const ttl = maxAge ? Math.min(Number(maxAge[1]), 86400) : 1800;
    const key = `${uuid}:${service.toLowerCase()}`;
    if (ttl === 0) {
      this.ssdp.delete(key);
      return;
    }
    if (this.records.size + this.ssdp.size >= MAX_RECORDS && !this.ssdp.has(key)) return;
    const upnp = rendererDescription(service, headers.get('location'), sender);
    this.ssdp.set(key, { id: uuid, address: sender, service, ...(upnp && { upnp }), lastSeen: now, expires: now + ttl * 1000 });
  }

  devices(now = Date.now()): DiscoveredDevice[] {
    this.expire(now);
    const result: DiscoveredDevice[] = [];
    const namePriority = new Map<DiscoveredDevice, number>();
    const records = [...this.records.values()];
    for (const pointer of records) {
      if (pointer.type !== 'PTR' || !serviceType.test(pointer.name) || !pointer.value.endsWith(`.${pointer.name}`)) continue;
      const srv = this.records.get(`SRV:${pointer.value}:`);
      const txt = this.records.get(`TXT:${pointer.value}:`);
      const hostAddresses = records.filter((record) => ['A', 'AAAA'].includes(record.type) && record.name === srv?.value);
      if (hostAddresses.some((record) => isOwnAddress(record.value, this.network))) continue;
      const addresses = hostAddresses.flatMap((record) => {
        const address = record.type === 'AAAA' ? scopedIPv6Address(record.value, this.network) : record.value;
        return address && this.accepts(address) ? [address] : [];
      });
      if (hostAddresses.length && !addresses.length) continue;
      const metadata = txt?.metadata ?? {};
      const matter = matterInfo(pointer.name, metadata, srv?.port);
      const friendlyName = (matter && metadata.dn) || metadata.fn;
      const device: DiscoveredDevice = {
        id: `mdns:${pointer.value}`, name: friendlyName || pointer.display.slice(0, -(pointer.name.length + 1)),
        ...(srv && { host: srv.value }), addresses,
        protocols: protocols(pointer.name), services: [pointer.name],
        ...(matter && { matter }),
        ...(metadata.md || metadata.model || metadata.am || metadata.ty
          ? { model: metadata.md || metadata.model || metadata.am || metadata.ty } : {}),
        lastSeen: Math.max(pointer.lastSeen, srv?.lastSeen ?? 0, txt?.lastSeen ?? 0, ...hostAddresses.map((record) => record.lastSeen)),
      };
      result.push(device);
      namePriority.set(device, friendlyName ? 3 : /^[a-f0-9-]{16,}$/i.test(device.name) ? 0 : 2);
    }
    for (const record of this.ssdp.values()) {
      const device: DiscoveredDevice = {
        id: `ssdp:${record.id}`, name: `${ssdpLabel(record.service)} · ${record.address}`,
        addresses: [record.address], protocols: ['SSDP/UPnP'], services: [record.service], lastSeen: record.lastSeen,
        ...(record.upnp && { upnp: record.upnp }),
      };
      result.push(device);
      namePriority.set(device, ssdpLabel(record.service) === 'Dispositivo UPnP' ? 0 : 1);
    }
    const grouped: DiscoveredDevice[] = [];
    const identities = new Map<DiscoveredDevice, Set<string>>();
    for (const device of result.sort((a, b) => a.id.localeCompare(b.id))) {
      const keys = [device.id, ...(device.host ? [`host:${device.host}`] : []),
        ...device.addresses.map((address) => `address:${address}`)];
      const matches = grouped.filter((other) => keys.some((key) => identities.get(other)!.has(key)));
      const match = matches[0];
      if (!match) {
        grouped.push(device);
        identities.set(device, new Set(keys));
        continue;
      }
      // One dual-stack advertisement can connect several formerly separate groups.
      for (const source of [...matches.slice(1), device]) {
        if (namePriority.get(source)! > namePriority.get(match)!) {
          match.name = source.name;
          namePriority.set(match, namePriority.get(source)!);
        }
        match.host ??= source.host;
        match.model ??= source.model;
        match.upnp ??= source.upnp;
        const matter = mergeMatter(match.matter, source.matter);
        if (matter) match.matter = matter;
        match.addresses = [...new Set([...match.addresses, ...source.addresses])].sort();
        match.protocols = [...new Set([...match.protocols, ...source.protocols])].sort();
        match.services = [...new Set([...match.services, ...source.services])].sort();
        match.lastSeen = Math.max(match.lastSeen, source.lastSeen);
        for (const key of identities.get(source) ?? keys) identities.get(match)!.add(key);
        if (source !== device) {
          grouped.splice(grouped.indexOf(source), 1);
          identities.delete(source);
        }
      }
    }
    for (const device of grouped) {
      device.addresses.sort();
      device.id = `lan:${device.addresses[0] || device.host || device.id}`;
    }
    return grouped.sort((a, b) => a.name.localeCompare(b.name));
  }
}
