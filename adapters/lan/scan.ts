import { createSocket } from 'node:dgram';
import multicastDns from 'multicast-dns';
import type { Question } from 'dns-packet';
import { DiscoveryCollector } from './collector.ts';
import { currentNetwork } from './network.ts';
import type { DiscoveryResult } from './types.ts';

const serviceTypes = [
  '_services._dns-sd._udp', '_googlecast._tcp', '_airplay._tcp', '_raop._tcp',
  '_hap._tcp', '_hap._udp', '_matterc._udp', '_matter._tcp', '_matterd._udp',
  '_http._tcp', '_hue._tcp', '_smb._tcp', '_androidtvremote2._tcp',
];
const initialQuestions: Question[] = serviceTypes.map((type) => ({ name: `${type}.local`, type: 'PTR' }));
const ssdpSearch = Buffer.from([
  'M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"',
  'MX: 2', 'ST: ssdp:all', '', '',
].join('\r\n'));

/** A bounded read-only discovery on one interface, over IPv4 and available IPv6. */
export async function scanNetwork(): Promise<DiscoveryResult> {
  const network = await currentNetwork();
  const startedAt = Date.now();
  const collector = new DiscoveryCollector(network);
  const warnings = new Set<string>();
  const warn = (protocol: string, error: Error) => {
    if (warnings.size < 8) warnings.add(`${protocol}: ${error.message.slice(0, 180)}`);
  };
  const browsers: { client: ReturnType<typeof multicastDns>; ready: boolean; label: string; destination?: string }[] = [];
  const ssdp = createSocket('udp4');
  let ssdpReady = false;
  let closing = false;
  const query = (questions: Question[], targets = browsers) => {
    if (closing || !questions.length) return;
    // Keep each multicast packet small even when a response advertises many services.
    for (const browser of targets) {
      if (!browser.ready) continue;
      for (let offset = 0; offset < questions.length; offset += 8) {
        const destination = browser.destination ? { address: browser.destination, port: 5353 } : undefined;
        browser.client.query(questions.slice(offset, offset + 8), destination, (error) => {
          if (error) warn(browser.label, error);
        });
      }
    }
  };
  const searchSsdp = () => {
    if (!closing && ssdpReady) ssdp.send(ssdpSearch, 1900, '239.255.255.250', (error) => { if (error) warn('SSDP', error); });
  };
  const browse = (options: multicastDns.Options, label: string, destination?: string) => {
    try {
      const client = multicastDns(options);
      const browser = { client, ready: false, label, destination };
      browsers.push(browser);
      client.on('error', (error) => { browser.ready = false; warn(label, error); });
      client.on('warning', (error) => warn(label, error));
      client.on('response', (packet, sender) => {
        if (!closing) query(collector.ingestMdns(packet, sender.address));
      });
      client.on('ready', () => { browser.ready = true; query(initialQuestions, [browser]); });
    } catch (error) {
      warn(label, error instanceof Error ? error : new Error(String(error)));
    }
  };
  browse({ interface: network.address, bind: '0.0.0.0', reuseAddr: true }, 'mDNS IPv4');
  if (network.ipv6?.length) {
    // Darwin/Linux expect the interface name here; Windows uses its numeric index.
    const scope = process.platform === 'win32'
      ? network.ipv6.find((address) => address.scopeId)?.scopeId ?? network.name : network.name;
    browse({ type: 'udp6', ip: 'ff02::fb', interface: `::%${scope}`, bind: '::', reuseAddr: true },
      'mDNS IPv6', `ff02::fb%${scope}`);
  }
  ssdp.on('error', (error) => { ssdpReady = false; warn('SSDP', error); });
  ssdp.on('message', (message, sender) => { if (!closing) collector.ingestSsdp(message, sender.address); });
  ssdp.bind(0, network.address, () => {
    if (closing) return;
    try {
      ssdp.setMulticastInterface(network.address);
      ssdp.setMulticastTTL(1);
      ssdpReady = true;
      searchSsdp();
    } catch (error) { warn('SSDP', error instanceof Error ? error : new Error(String(error))); }
  });
  const retry = setTimeout(() => { query(initialQuestions); searchSsdp(); }, 3000);
  try {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const completedAt = Date.now();
    const status = browsers.some((browser) => browser.ready) || ssdpReady ? 'complete' : 'error';
    return {
      status, network, startedAt, completedAt, devices: collector.devices(completedAt), warnings: [...warnings],
      ...(status === 'error' ? { error: 'No se pudo iniciar la búsqueda local. Revisa la conexión y el permiso de red local de la app.' } : {}),
    };
  } finally {
    closing = true;
    clearTimeout(retry);
    for (const browser of browsers) {
      try { browser.client.destroy(); } catch { /* A failed bind may already have closed the socket. */ }
    }
    try { ssdp.close(); } catch { /* A failed bind may already have closed the socket. */ }
  }
}
