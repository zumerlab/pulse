import { execFile } from 'node:child_process';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { networkInterfaces, platform } from 'node:os';
import { promisify } from 'node:util';
import type { NetworkInfo } from './types.ts';

const run = promisify(execFile);
const numericAddress = (address: string) => address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
const excludedIPv6 = new BlockList();
for (const [address, prefix] of [['::', 128], ['::1', 128], ['ff00::', 8], ['::ffff:0:0', 96]] as const) {
  excludedIPv6.addSubnet(address, prefix, 'ipv6');
}
const linkLocal = new BlockList();
linkLocal.addSubnet('fe80::', 10, 'ipv6');

/** Canonical bare IPv6, with no interface suffix or non-unicast special addresses. */
export function canonicalIPv6(address: string): string | undefined {
  if (address.includes('%') || !isIPv6(address) || excludedIPv6.check(address, 'ipv6')) return;
  return new URL(`http://[${address}]/`).hostname.slice(1, -1);
}

function ipv6Parts(address: string): { bare: string; scope?: string } | undefined {
  const parts = address.split('%');
  const bare = canonicalIPv6(parts[0]);
  if (!bare || parts.length > 2 || (parts.length === 2 && !parts[1])) return;
  return { bare, ...(parts[1] && { scope: parts[1] }) };
}

function matchesScope(scope: string, network: NetworkInfo): boolean {
  return scope === network.name || (/^\d+$/.test(scope) && Number(scope) > 0 &&
    network.ipv6?.some((item) => item.scopeId === Number(scope)) === true);
}

export function isOwnAddress(address: string, network: NetworkInfo): boolean {
  if (isIPv4(address)) return address === network.address;
  const parsed = ipv6Parts(address);
  return !!parsed && network.ipv6?.some((item) => canonicalIPv6(item.address) === parsed.bare) === true;
}

export function isOnNetwork(address: string, network: NetworkInfo): boolean {
  const parsed = ipv6Parts(address);
  if (parsed) {
    if (parsed.scope && !matchesScope(parsed.scope, network)) return false;
    if (linkLocal.check(parsed.bare, 'ipv6')) return !!parsed.scope && !!network.ipv6?.length;
    return network.ipv6?.some((item) => {
      const base = canonicalIPv6(item.address);
      if (!base || !Number.isInteger(item.prefixLength) || item.prefixLength < 1 || item.prefixLength > 128) return false;
      const subnet = new BlockList();
      subnet.addSubnet(base, item.prefixLength, 'ipv6');
      return subnet.check(parsed.bare, 'ipv6');
    }) === true;
  }
  if (!isIPv4(address) || !isIPv4(network.address) || !isIPv4(network.netmask)) return false;
  const mask = numericAddress(network.netmask);
  const value = numericAddress(address);
  const local = numericAddress(network.address);
  return (value & mask) === (local & mask) && value !== ((local & mask) >>> 0)
    && value !== (((local & mask) | ~mask) >>> 0);
}

/** AAAA records carry no scope; their accepted mDNS packet supplies the interface. */
export function scopedIPv6Address(address: string, network: NetworkInfo): string | undefined {
  const bare = canonicalIPv6(address);
  if (!bare) return;
  const scoped = linkLocal.check(bare, 'ipv6') ? `${bare}%${network.name}` : bare;
  return isOnNetwork(scoped, network) ? scoped : undefined;
}

/** Select one interface; never probe every subnet or change Wi-Fi settings. */
export async function currentNetwork(): Promise<NetworkInfo> {
  const interfaces = networkInterfaces();
  let name = process.env.PULSE_INTERFACE;
  if (!name && platform() === 'darwin') {
    const { stdout } = await run('/sbin/route', ['-n', 'get', 'default'], { timeout: 1500 });
    name = stdout.match(/^\s*interface:\s*(\S+)/m)?.[1];
  }
  if (!name) {
    const available = Object.entries(interfaces).filter(([, values]) => values?.some((item) => item.family === 'IPv4' && !item.internal));
    if (available.length === 1) name = available[0][0];
  }
  const info = name && interfaces[name]?.find((item) => item.family === 'IPv4' && !item.internal);
  if (!name || !info) throw new Error('No se encontró una interfaz IPv4 activa. Conecta Wi-Fi o indica PULSE_INTERFACE al iniciar Pulse.');
  const ipv6 = interfaces[name]?.flatMap((item) => {
    if (item.family !== 'IPv6' || item.internal) return [];
    const address = canonicalIPv6(item.address.split('%')[0]);
    const prefixLength = Number(item.cidr?.split('/')[1]);
    if (!address || !Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 128) return [];
    return [{ address, prefixLength, ...(item.scopeid > 0 && { scopeId: item.scopeid }) }];
  }) ?? [];
  return { name, address: info.address, netmask: info.netmask, ...(ipv6.length && { ipv6 }) };
}
