import assert from 'node:assert/strict';
import test from 'node:test';
import type { Answer, Packet } from 'dns-packet';
import { DiscoveryCollector } from '../adapters/lan/collector.ts';

const network = { name: 'en0', address: '192.168.1.10', netmask: '255.255.255.0' };
const sender = '192.168.1.20';
const service = '_googlecast._tcp.local';
const instance = `Speaker.${service}`;
const host = 'speaker.local';
const pointer: Answer = { type: 'PTR', name: service, data: instance, ttl: 120 };
const srv: Answer = { type: 'SRV', name: instance, data: { target: host, port: 8009 }, ttl: 120 };
const address: Answer = { type: 'A', name: host, data: sender, ttl: 120 };
const txt: Answer = {
  type: 'TXT', name: instance, ttl: 120,
  data: [Buffer.from('fn=Living Nest'), Buffer.from('md=Nest Audio'), Buffer.from('secret=do-not-export')],
};
const packet = (answers: Answer[]): Packet => ({ type: 'response', answers });
const ssdp = (st = 'upnp:rootdevice', extra = '', id = 'device-123') => Buffer.from(
  `HTTP/1.1 200 OK\r\nST: ${st}\r\nUSN: uuid:${id}::${st}\r\nCACHE-CONTROL: max-age=120\r\n${extra}\r\n`,
);

test('mDNS follows DNS-SD enumeration and resolves records arriving in any section or order', () => {
  const collector = new DiscoveryCollector(network);
  const questions = collector.ingestMdns(packet([
    { type: 'PTR', name: '_services._dns-sd._udp.local.', data: `${service}.`, ttl: 120 },
  ]), sender, 1000);
  assert.deepEqual(questions, [{ name: service, type: 'PTR' }]);
  collector.ingestMdns({ type: 'response', authorities: [address], additionals: [txt, srv] }, sender, 1100);
  assert.deepEqual(collector.devices(1100), []);
  collector.ingestMdns(packet([pointer]), sender, 1200);
  const [device] = collector.devices(1200);
  assert.equal(device?.name, 'Living Nest');
  assert.equal(device.model, 'Nest Audio');
  assert.equal(device.host, host);
  assert.deepEqual(device.addresses, [sender]);
  assert.deepEqual(device.protocols, ['Bonjour/mDNS', 'Google Cast']);
  assert.deepEqual(device.services, [service]);
  assert.equal(device.lastSeen, 1200);
  assert.ok(!JSON.stringify(device).includes('do-not-export'));
  assert.deepEqual(collector.ingestMdns(packet([pointer, srv]), sender, 1300), []);
});

test('mDNS preserves unresolved targets without pretending the responder owns the service', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestMdns(packet([pointer, srv]), '192.168.1.50', 1000);
  const [device] = collector.devices(1000);
  assert.equal(device?.host, host);
  assert.deepEqual(device.addresses, []);
  collector.ingestMdns(packet([address]), '192.168.1.50', 1100);
  assert.deepEqual(collector.devices(1100)[0]?.addresses, [sender]);
});

test('normalizes DNS names, combines shared-host services and leaves separate unresolved hosts apart', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestMdns(packet([pointer, srv, address, txt]), sender, 1000);
  collector.ingestMdns(packet([
    { type: 'PTR', name: service.toUpperCase() + '.', data: instance.toUpperCase() + '.', ttl: 120 },
    { type: 'PTR', name: '_airplay._tcp.local', data: 'Air._airplay._tcp.local', ttl: 120 },
    { type: 'SRV', name: 'Air._airplay._tcp.local', data: { target: host, port: 7000 }, ttl: 120 },
    { type: 'PTR', name: service, data: `Other.${service}`, ttl: 120 },
    { type: 'SRV', name: `Other.${service}`, data: { target: 'other.local', port: 8009 }, ttl: 120 },
  ]), sender, 1100);
  const devices = collector.devices(1100);
  assert.equal(devices.length, 2);
  const speaker = devices.find((device) => device.host === host);
  assert.ok(speaker);
  assert.deepEqual(speaker.services, ['_airplay._tcp.local', service]);
  assert.ok(speaker.protocols.includes('AirPlay'));
  assert.ok(speaker.protocols.includes('Google Cast'));
});

test('mDNS removes goodbye and expired records without retaining old names or addresses', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestMdns(packet([pointer, srv, address, { ...txt, ttl: 1 }]), sender, 1000);
  assert.equal(collector.devices(1999)[0]?.name, 'Living Nest');
  assert.equal(collector.devices(2000)[0]?.name, 'Speaker');
  collector.ingestMdns(packet([{ ...pointer, ttl: 0 }]), sender, 2100);
  assert.deepEqual(collector.devices(2100), []);
  collector.ingestMdns(packet([{ ...pointer, ttl: 1 }]), sender, 3000);
  assert.equal(collector.devices(3999).length, 1);
  assert.deepEqual(collector.devices(4000), []);
});

test('rejects off-subnet and own-machine advertisements, including resolved own or routed targets', () => {
  const collector = new DiscoveryCollector(network);
  for (const ip of ['10.0.0.2', network.address, '192.168.1.0', '192.168.1.255', 'invalid']) {
    assert.deepEqual(collector.ingestMdns(packet([pointer, srv, address]), ip, 1000), []);
    collector.ingestSsdp(ssdp(), ip, 1000);
  }
  assert.deepEqual(collector.devices(1000), []);
  collector.ingestMdns(packet([pointer, srv, { ...address, data: network.address }]), sender, 1000);
  assert.deepEqual(collector.devices(1000), []);
  const routed = new DiscoveryCollector(network);
  routed.ingestMdns(packet([pointer, srv, { ...address, data: '10.0.0.2' }]), sender, 1000);
  assert.deepEqual(routed.devices(1000), []);
});

test('SSDP groups service variants by UUID, accepts mixed-case headers and expires advertisements', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestSsdp(ssdp(), sender, 1000);
  collector.ingestSsdp(Buffer.from(ssdp('urn:schemas-upnp-org:device:MediaRenderer:1').toString()
    .replace('ST:', 'st:').replace('USN:', 'Usn:')), sender, 1100);
  const [device] = collector.devices(1100);
  assert.equal(collector.devices(1100).length, 1);
  assert.equal(device?.id, `lan:${sender}`);
  assert.equal(device.services.length, 2);
  assert.deepEqual(device.addresses, [sender]);
  assert.deepEqual(device.protocols, ['SSDP/UPnP']);
  assert.equal(device.model, undefined);
  assert.equal(device.name, `Reproductor multimedia UPnP · ${sender}`);
  assert.deepEqual(collector.devices(121100), []);
});

test('prefers advertised friendly names over grouped opaque instances and keeps identity independent of record order', () => {
  const zone: Answer[] = [
    { type: 'PTR', name: '_googlezone._tcp.local', data: '0000-zone._googlezone._tcp.local', ttl: 120 },
    { type: 'SRV', name: '0000-zone._googlezone._tcp.local', data: { target: host, port: 10001 }, ttl: 120 },
  ];
  const normal = new DiscoveryCollector(network);
  const reversed = new DiscoveryCollector(network);
  const records = [...zone, pointer, srv, address, txt];
  normal.ingestMdns(packet(records), sender, 1000);
  reversed.ingestMdns(packet([...records].reverse()), sender, 1000);
  assert.deepEqual(normal.devices(1000), reversed.devices(1000));
  assert.equal(normal.devices(1000)[0]?.name, 'Living Nest');
  assert.equal(normal.devices(1000)[0]?.id, `lan:${sender}`);
});

test('prefers the SSDP device type label over generic root-device advertisements', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestSsdp(ssdp(), sender, 1000);
  collector.ingestSsdp(ssdp('urn:schemas-upnp-org:device:InternetGatewayDevice:1'), sender, 1000);
  assert.equal(collector.devices(1000)[0]?.name, `Router UPnP · ${sender}`);
});

test('renderer descriptions use only the responding device HTTP address and survive mDNS grouping', () => {
  const collector = new DiscoveryCollector(network);
  const renderer = 'urn:schemas-upnp-org:device:MediaRenderer:1';
  const descriptionUrl = `http://${sender}:9197/dmr/description.xml`;
  collector.ingestSsdp(ssdp(renderer, `LOCATION: ${descriptionUrl}\r\n`), sender, 1000);
  collector.ingestSsdp(ssdp(), sender, 1000);
  collector.ingestMdns(packet([pointer, srv, address, txt]), sender, 1000);
  const [device] = collector.devices(1000);
  assert.equal(collector.devices(1000).length, 1);
  assert.equal(device?.name, 'Living Nest');
  assert.deepEqual(device.upnp, { descriptionUrl, deviceType: renderer });
  collector.ingestSsdp(Buffer.from(ssdp(renderer).toString().replace('max-age=120', 'max-age=0')), sender, 1100);
  assert.equal(collector.devices(1100)[0]?.upnp, undefined);
});

test('rejects unrelated or unsafe renderer description endpoints without hiding the device', () => {
  const renderer = 'urn:schemas-upnp-org:device:MediaRenderer:1';
  for (const location of [
    'http://127.0.0.1/private', 'http://192.168.1.30/description.xml', 'http://192.168.1.10/description.xml',
    'http://example.test/description.xml', `https://${sender}/description.xml`,
    `http://user:password@${sender}/description.xml`, `http://${sender}:0/description.xml`,
    `http://${sender}/description.xml#fragment`, 'file:///description.xml', 'invalid',
  ]) {
    const collector = new DiscoveryCollector(network);
    collector.ingestSsdp(ssdp(renderer, `LOCATION: ${location}\r\n`), sender, 1000);
    assert.equal(collector.devices(1000).length, 1, location);
    assert.equal(collector.devices(1000)[0]?.upnp, undefined, location);
  }
  const collector = new DiscoveryCollector(network);
  collector.ingestSsdp(ssdp('upnp:rootdevice', `LOCATION: http://${sender}/description.xml\r\n`), sender, 1000);
  assert.equal(collector.devices(1000)[0]?.upnp, undefined);
});

test('prefers a readable AirPlay name over a grouped Spotify instance hash', () => {
  const collector = new DiscoveryCollector(network);
  const opaque = 'b432092fdeb42d5540473ab13c9dff1c885c4b85._spotify-connect._tcp.local';
  const airplay = 'Samsung TV._airplay._tcp.local';
  collector.ingestMdns(packet([
    { type: 'PTR', name: '_spotify-connect._tcp.local', data: opaque, ttl: 120 },
    { type: 'SRV', name: opaque, data: { target: host, port: 8009 }, ttl: 120 },
    { type: 'PTR', name: '_airplay._tcp.local', data: airplay, ttl: 120 },
    { type: 'SRV', name: airplay, data: { target: host, port: 7000 }, ttl: 120 },
    address,
  ]), sender, 1000);
  assert.equal(collector.devices(1000)[0]?.name, 'Samsung TV');
});

test('SSDP requires valid response identity and does not fetch advertised locations', () => {
  const collector = new DiscoveryCollector(network);
  for (const malformed of [
    Buffer.from('HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\n\r\n'),
    Buffer.from(ssdp().toString().replace('200 OK', '404 Nope')),
    Buffer.from(ssdp().toString().replace('uuid:device-123', 'https://example.test')),
    ssdp('upnp:rootdevice', 'ST: duplicate\r\n'),
    ssdp('upnp:<script>'), Buffer.alloc(8193),
  ]) collector.ingestSsdp(malformed, sender, 1000);
  assert.deepEqual(collector.devices(1000), []);
  collector.ingestSsdp(ssdp('upnp:rootdevice', 'LOCATION: http://127.0.0.1/private\r\n'), sender, 1000);
  assert.equal(collector.devices(1000).length, 1);
  assert.ok(!JSON.stringify(collector.devices(1000)).includes('LOCATION'));
  collector.ingestSsdp(Buffer.from(ssdp().toString().replace('max-age=120', 'max-age=0')), sender, 1100);
  assert.deepEqual(collector.devices(1100), []);
});

test('malformed DNS records are ignored and display text strips control characters and markup brackets', () => {
  const collector = new DiscoveryCollector(network);
  const malformed = packet([
    { type: 'PTR', name: service, data: null, ttl: 120 },
    { type: 'SRV', name: instance, data: null, ttl: 120 },
    { type: 'TXT', name: instance, data: 'invalid', ttl: 120 },
    { type: 'PTR', name: service, data: instance, ttl: Number.NaN },
  ] as unknown as Answer[]);
  assert.doesNotThrow(() => collector.ingestMdns(malformed, sender, 1000));
  assert.deepEqual(collector.devices(1000), []);
  collector.ingestMdns(packet([pointer, srv, address, { ...txt, data: [Buffer.from('fn=<b>Hi</b>\u0000')] }]), sender, 1000);
  assert.equal(collector.devices(1000)[0]?.name, 'bHi/b');
});

test('bounds discovery queries and inventory under a stream of new advertisements', () => {
  const collector = new DiscoveryCollector(network);
  let questions = 0;
  for (let index = 0; index < 1200; index++) {
    const name = `device-${index}.${service}`;
    questions += collector.ingestMdns(packet([{ ...pointer, data: name }]), sender, 1000).length;
  }
  assert.equal(questions, 256);
  assert.equal(collector.devices(1000).length, 1000);
});

const dualNetwork = {
  ...network,
  ipv6: [
    { address: 'fe80::10', prefixLength: 64, scopeId: 12 },
    { address: 'fd12:3456::10', prefixLength: 64 },
  ],
};
const ipv6Address: Answer = { type: 'AAAA', name: host, data: 'FE80:0:0:0:0:0:0:20', ttl: 120 };

test('IPv6 responses are confined to the selected interface and its prefixes', () => {
  for (const ip of ['fe80::20%en0', 'fe80::20%12', 'fd12:3456::20']) {
    const collector = new DiscoveryCollector(dualNetwork);
    collector.ingestMdns(packet([pointer, srv, ipv6Address]), ip, 1000);
    assert.deepEqual(collector.devices(1000)[0]?.addresses, ['fe80::20%en0'], ip);
  }
  for (const ip of ['fe80::20', 'fe80::20%en1', 'fe80::20%13', 'fe80::20%', 'fe80::20%en0%en1',
    'fd12:3457::20', 'ff02::fb%en0', '::1', '::', '::ffff:192.168.1.20', 'fe80:::20%en0']) {
    const collector = new DiscoveryCollector(dualNetwork);
    collector.ingestMdns(packet([pointer, srv, ipv6Address]), ip, 1000);
    assert.deepEqual(collector.devices(1000), [], ip);
  }
});

test('own IPv6 senders and resolved targets are excluded despite alternate IPv6 notation', () => {
  for (const ip of ['fe80::10%en0', 'FE80:0:0:0:0:0:0:10%12', 'fd12:3456:0:0:0:0:0:10']) {
    const collector = new DiscoveryCollector(dualNetwork);
    collector.ingestMdns(packet([pointer, srv, ipv6Address]), ip, 1000);
    assert.deepEqual(collector.devices(1000), [], ip);
  }
  for (const ip of ['FE80:0:0:0:0:0:0:10', 'fd12:3456:0:0:0:0:0:10']) {
    const collector = new DiscoveryCollector(dualNetwork);
    collector.ingestMdns(packet([pointer, srv, address, { ...ipv6Address, data: ip }]), sender, 1000);
    assert.deepEqual(collector.devices(1000), [], ip);
  }
});

test('out-of-order AAAA over IPv4 joins dual-stack services without assigning responder addresses to targets', () => {
  const collector = new DiscoveryCollector(dualNetwork);
  collector.ingestMdns({ type: 'response', additionals: [ipv6Address] }, sender, 1000);
  collector.ingestMdns(packet([pointer, srv]), 'fe80::99%12', 1100);
  assert.deepEqual(collector.devices(1100)[0]?.addresses, ['fe80::20%en0']);
  collector.ingestMdns(packet([
    address,
    { ...ipv6Address, data: 'fd12:3456:0:0::20' },
    { type: 'PTR', name: '_airplay._tcp.local', data: 'Air._airplay._tcp.local', ttl: 120 },
    { type: 'SRV', name: 'Air._airplay._tcp.local', data: { target: host, port: 7000 }, ttl: 120 },
  ]), sender, 1200);
  const devices = collector.devices(1200);
  assert.equal(devices.length, 1);
  assert.deepEqual(devices[0].addresses, [sender, 'fd12:3456::20', 'fe80::20%en0']);
  assert.deepEqual(devices[0].services, ['_airplay._tcp.local', service]);
  assert.equal(devices[0].lastSeen, 1200);
});

test('AAAA goodbye and expiry remove canonical addresses while remaining IPv4 services survive', () => {
  const collector = new DiscoveryCollector(dualNetwork);
  collector.ingestMdns(packet([pointer, srv, address, ipv6Address]), sender, 1000);
  collector.ingestMdns(packet([{ ...ipv6Address, data: 'fe80::20', ttl: 0 }]), sender, 1100);
  assert.deepEqual(collector.devices(1100)[0]?.addresses, [sender]);
  collector.ingestMdns(packet([{ ...ipv6Address, ttl: 1 }]), sender, 1200);
  assert.deepEqual(collector.devices(2199)[0]?.addresses, [sender, 'fe80::20%en0']);
  assert.deepEqual(collector.devices(2200)[0]?.addresses, [sender]);
});

test('AAAA targets retain valid local addresses and omit routed or special addresses', () => {
  const collector = new DiscoveryCollector(dualNetwork);
  collector.ingestMdns(packet([pointer, srv, ipv6Address, ...[
    'fd12:3457::20', '2001:db8::20', '::', '::1', 'ff02::fb', 'fe80::21%en1', 'not-an-address',
  ].map((data): Answer => ({ ...ipv6Address, data }))]), sender, 1000);
  assert.deepEqual(collector.devices(1000)[0]?.addresses, ['fe80::20%en0']);
  const routed = new DiscoveryCollector(dualNetwork);
  routed.ingestMdns(packet([pointer, srv, { ...ipv6Address, data: 'fd12:3457::20' }]), sender, 1000);
  assert.deepEqual(routed.devices(1000), []);
});

function matterRecords(type: string, fields: string[] = []): Answer[] {
  const name = `0001.${type}`;
  return [
    { type: 'PTR', name: type, data: name, ttl: 120 },
    { type: 'SRV', name, data: { target: host, port: 5540 }, ttl: 120 },
    { type: 'TXT', name, data: fields.map((field) => Buffer.from(field)), ttl: 120 },
    address,
  ];
}

test('Matter commissioning mode follows only exact CM values and missing or invalid modes stay unknown', () => {
  for (const [cm, expected] of [
    ['0', 'closed'], ['1', 'open'], ['2', 'open'], [undefined, 'unknown'], ['3', 'unknown'],
    ['01', 'unknown'], [' 1 ', 'unknown'], ['1\u0000', 'unknown'],
  ] as const) {
    const collector = new DiscoveryCollector(network);
    collector.ingestMdns(packet(matterRecords('_matterc._udp.local', [
      'DN=Living Thermostat', ...(cm === undefined ? [] : [`CM=${cm}`]), 'VP=123+456',
    ])), sender, 1000);
    const [device] = collector.devices(1000);
    assert.equal(device.name, 'Living Thermostat');
    assert.deepEqual(device.matter, { commissioning: expected, pairing: { port: 5540 } }, `CM=${cm}`);
    assert.equal(device.model, undefined);
    assert.ok(device.protocols.includes('Matter'));
    assert.ok(!JSON.stringify(device).includes('123+456'));
  }
});

test('Matter operational and commissioner roles remain distinct and combine only for the same host', () => {
  for (const [type, expected] of [
    ['_matter._tcp.local', { operational: true }], ['_matterd._udp.local', { commissioner: true }],
  ] as const) {
    const collector = new DiscoveryCollector(network);
    collector.ingestMdns(packet(matterRecords(type, ['CM=1'])), sender, 1000);
    assert.deepEqual(collector.devices(1000)[0]?.matter, expected);
  }
  const collector = new DiscoveryCollector(network);
  collector.ingestMdns(packet([
    ...matterRecords('_matter._tcp.local'), ...matterRecords('_matterc._udp.local', ['CM=2']),
    ...matterRecords('_matterd._udp.local'),
  ]), sender, 1000);
  assert.equal(collector.devices(1000).length, 1);
  assert.deepEqual(collector.devices(1000)[0]?.matter, { operational: true, commissioning: 'open', commissioner: true, pairing: { port: 5540 } });
});

test('Matter DN is not used as a friendly name for unrelated services', () => {
  const collector = new DiscoveryCollector(network);
  collector.ingestMdns(packet([pointer, srv, address, { ...txt, data: [Buffer.from('DN=Misleading name')] }]), sender, 1000);
  const [device] = collector.devices(1000);
  assert.equal(device.name, 'Speaker');
  assert.equal(device.matter, undefined);
});

test('a dual-stack advertisement merges all connected groups and expiry rebuilds their identities', () => {
  const recordsFor = (alias: string, type: string, addresses: Answer[], fields: string[] = []): Answer[] => [
    { type: 'PTR', name: type, data: `${alias}.${type}`, ttl: 120 },
    { type: 'SRV', name: `${alias}.${type}`, data: { target: `${alias}.local`, port: 5540 }, ttl: 120 },
    { type: 'TXT', name: `${alias}.${type}`, data: fields.map((field) => Buffer.from(field)), ttl: 120 },
    ...addresses.map((record) => ({ ...record, name: `${alias}.local` })),
  ];
  const collector = new DiscoveryCollector(dualNetwork);
  collector.ingestMdns(packet([
    ...recordsFor('a', '_matter._tcp.local', [address]),
    ...recordsFor('b', '_matterc._udp.local', [ipv6Address], ['DN=Living Thermostat', 'CM=1']),
  ]), sender, 1000);
  assert.equal(collector.devices(1000).length, 2);
  collector.ingestMdns(packet(recordsFor('c', service, [address, ipv6Address], ['model=Announced model'])
    .map((record) => ({ ...record, ttl: 1 }))), sender, 1100);
  const merged = collector.devices(1100);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Living Thermostat');
  assert.equal(merged[0].model, 'Announced model');
  assert.equal(merged[0].lastSeen, 1100);
  assert.deepEqual(merged[0].addresses, [sender, 'fe80::20%en0']);
  assert.deepEqual(merged[0].services, [service, '_matter._tcp.local', '_matterc._udp.local']);
  assert.deepEqual(merged[0].protocols, ['Bonjour/mDNS', 'Google Cast', 'Matter']);
  assert.deepEqual(merged[0].matter, { operational: true, commissioning: 'open', pairing: { port: 5540 } });
  const expired = collector.devices(2100);
  assert.equal(expired.length, 2);
  assert.ok(expired.every((device) => device.model === undefined));
  assert.deepEqual(expired.find((device) => device.host === 'a.local')?.matter, { operational: true });
  assert.deepEqual(expired.find((device) => device.host === 'b.local')?.matter, { commissioning: 'open', pairing: { port: 5540 } });
});

test('Matter pairing target uses a valid commissioning SRV port and exact advertised discriminator only', () => {
  for (const [value, expected] of [
    ['0', 0], ['4095', 4095], ['42', 42], ['4096', undefined], ['-1', undefined], ['1.0', undefined],
    [' 42', undefined], ['42\u0000', undefined], ['42e0', undefined], ['', undefined],
  ] as const) {
    const collector = new DiscoveryCollector(network);
    collector.ingestMdns(packet(matterRecords('_matterc._udp.local', ['CM=1', `D=${value}`])), sender, 1000);
    assert.deepEqual(collector.devices(1000)[0]?.matter?.pairing,
      { port: 5540, ...(expected !== undefined && { discriminator: expected }) }, value);
  }
  for (const port of [0, -1, 65536, 1.5, Number.NaN]) {
    const collector = new DiscoveryCollector(network);
    const records = matterRecords('_matterc._udp.local', ['CM=1', 'D=42']).map((record) =>
      record.type === 'SRV' ? { ...record, data: { ...record.data, port } } : record);
    collector.ingestMdns(packet(records), sender, 1000);
    assert.equal(collector.devices(1000)[0]?.matter?.pairing, undefined);
  }
  const unresolved = new DiscoveryCollector(network);
  unresolved.ingestMdns(packet(matterRecords('_matterc._udp.local', ['CM=1', 'D=42'])
    .filter((record) => record.type !== 'SRV')), sender, 1000);
  assert.equal(unresolved.devices(1000)[0]?.matter?.pairing, undefined);
  for (const type of ['_matter._tcp.local', '_matterd._udp.local', service]) {
    const collector = new DiscoveryCollector(network);
    collector.ingestMdns(packet(matterRecords(type, ['CM=1', 'D=42'])), sender, 1000);
    assert.equal(collector.devices(1000)[0]?.matter?.pairing, undefined, type);
  }
});

test('merged Matter metadata preserves the open advertisement pairing target over a closed one', () => {
  const collector = new DiscoveryCollector(network);
  const closed = matterRecords('_matterc._udp.local', ['CM=0', 'D=9']).map((record): Answer => {
    if (record.type === 'PTR') return { ...record, data: 'zzzz._matterc._udp.local' };
    if (record.type === 'SRV') return { ...record, name: 'zzzz._matterc._udp.local', data: { ...record.data, port: 1234 } };
    if (record.type === 'TXT') return { ...record, name: 'zzzz._matterc._udp.local' };
    return record;
  });
  collector.ingestMdns(packet([...matterRecords('_matterc._udp.local', ['CM=1', 'D=42']), ...closed]), sender, 1000);
  assert.equal(collector.devices(1000).length, 1);
  assert.deepEqual(collector.devices(1000)[0]?.matter, { commissioning: 'open', pairing: { port: 5540, discriminator: 42 } });
});
