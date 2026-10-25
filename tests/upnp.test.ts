import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { DiscoveredDevice } from '../adapters/lan/types.ts';
import { inspectRenderer, pinnedUrl } from '../adapters/upnp/client.ts';
import { MediaService } from '../server/media-service.ts';
import { projectEvents } from '../core/event.ts';

const serviceType = 'urn:schemas-upnp-org:service:RenderingControl:1';
const deviceType = 'urn:schemas-upnp-org:device:MediaRenderer:1';
async function fixture(t: TestContext) {
  const config = { volume: '24', muted: '0', acceptWrites: false, allowVolumeSet: true, controlUrl: '/control', scpdUrl: '/scpd',
    descriptor: '', udn: 'uuid:pulse-fixture', rejectReads: false };
  const calls: string[] = [];
  const argumentsFor = (name: string) => ['InstanceID', 'Channel', `${name.startsWith('Get') ? 'Current' : 'Desired'}${name.slice(3)}`]
    .map((value) => `<argument><name>${value}</name><direction>${value.startsWith('Current') ? 'out' : 'in'}</direction></argument>`).join('');
  const server = createServer(async (req, res) => {
    if (req.url === '/description') {
      res.end(config.descriptor || `<root><device><deviceType>${deviceType}</deviceType><friendlyName>Living TV</friendlyName><UDN>${config.udn}</UDN><serviceList><service><serviceType>${serviceType}</serviceType><controlURL>${config.controlUrl}</controlURL><SCPDURL>${config.scpdUrl}</SCPDURL></service></serviceList></device></root>`);
    } else if (req.url === '/scpd') {
      const actions = ['GetVolume', ...(config.allowVolumeSet ? ['SetVolume'] : []), 'GetMute', 'SetMute'];
      res.end(`<scpd><actionList>${actions.map((action) => `<action><name>${action}</name><argumentList>${argumentsFor(action)}</argumentList></action>`).join('')}</actionList><serviceStateTable>
        <stateVariable><name>A_ARG_TYPE_Channel</name><dataType>string</dataType><allowedValueList><allowedValue>Master</allowedValue></allowedValueList></stateVariable>
        <stateVariable><name>Volume</name><dataType>ui2</dataType><allowedValueRange><minimum>0</minimum><maximum>100</maximum><step>1</step></allowedValueRange></stateVariable>
        <stateVariable><name>Mute</name><dataType>boolean</dataType></stateVariable></serviceStateTable></scpd>`);
    } else if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/scpd' }).end();
    } else if (req.url === '/control') {
      const action = String(req.headers.soapaction).split('#')[1]?.replace('"', '') ?? '';
      calls.push(action);
      let body = ''; for await (const chunk of req) body += String(chunk);
      if (config.rejectReads && action.startsWith('Get')) { res.writeHead(500).end(); return; }
      if (config.acceptWrites && action === 'SetVolume') config.volume = body.match(/<DesiredVolume>(\d+)<\/DesiredVolume>/)![1];
      if (config.acceptWrites && action === 'SetMute') config.muted = body.match(/<DesiredMute>([01])<\/DesiredMute>/)![1];
      const value = action === 'GetVolume' ? `<CurrentVolume>${config.volume}</CurrentVolume>` : action === 'GetMute' ? `<CurrentMute>${config.muted}</CurrentMute>` : '';
      res.setHeader('Content-Type', 'text/xml');
      res.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="${serviceType}">${value}</u:${action}Response></s:Body></s:Envelope>`);
    } else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const candidate: DiscoveredDevice = { id: 'lan:fixture', name: 'TV', addresses: ['127.0.0.1'], protocols: ['SSDP'],
    services: [deviceType], lastSeen: Date.now(), upnp: { descriptionUrl: `${url}/description`, deviceType } };
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  t.after(close);
  return { candidate, config, calls, close, url };
}
async function storage(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'pulse-upnp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'private', 'media.json');
}
async function ready(t: TestContext, path: string) {
  const service = new MediaService(path); await service.start(); t.after(() => service.close()); return service;
}

test('renderer reads actual volume and mute and exposes only advertised read/write controls', async (t) => {
  const { candidate, calls, config } = await fixture(t);
  const renderer = await inspectRenderer(candidate);
  assert.deepEqual(renderer.capabilities, ['volume', 'mute']);
  assert.deepEqual(renderer.state, { online: true, volume: 24, muted: false });
  assert.deepEqual(calls, ['GetVolume', 'GetMute']);
  config.allowVolumeSet = false;
  assert.deepEqual((await inspectRenderer(candidate)).capabilities, ['mute']);
  config.allowVolumeSet = true; config.volume = '999';
  assert.deepEqual((await inspectRenderer(candidate)).capabilities, ['mute']);
  config.muted = 'perhaps';
  await assert.rejects(inspectRenderer(candidate), /controles de sonido/);
});

test('actions emit confirmed readback, never the requested value, and preserve event projection', async (t) => {
  const { candidate, config, calls } = await fixture(t);
  const service = await ready(t, await storage(t));
  await service.add(candidate);
  const id = service.snapshot().entities[0].id;
  const baseline = service.snapshot().events.length;
  await service.execute(id, { type: 'setVolume', value: 77 });
  assert.equal(service.snapshot().entities[0].state.volume, 24);
  assert.equal(service.snapshot().events.length, baseline);
  assert.deepEqual(calls.slice(-3), ['SetVolume', 'GetVolume', 'GetMute']);
  config.acceptWrites = true;
  await service.execute(id, { type: 'setMute', value: true });
  assert.equal(service.snapshot().entities[0].state.muted, true);
  assert.deepEqual(projectEvents(service.snapshot().events), service.snapshot().entities);
  await assert.rejects(service.execute(id, { type: 'setVolume', value: 101 }), /between 0 and 100/);
  config.rejectReads = true;
  await assert.rejects(service.execute(id, { type: 'setVolume', value: 55 }), /confirmar/);
  assert.equal(service.snapshot().entities[0].state.volume, 24);
  assert.equal(service.snapshot().entities[0].state.online, false);
});

test('metadata saves privately, deduplicates identities, restores offline and rejects reused addresses', async (t) => {
  const { candidate, config, close } = await fixture(t);
  const path = await storage(t);
  const service = await ready(t, path);
  await service.add(candidate); await service.add({ ...candidate, id: 'lan:other' });
  assert.equal(service.snapshot().entities.length, 1);
  assert.equal(service.snapshot().events.length, 1);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(path, '..'))).mode & 0o777, 0o700);
  const persisted = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(persisted.devices[0].candidate.id, 'lan:other');
  const id = service.snapshot().entities[0].id;
  await service.close();
  const restored = await ready(t, path);
  assert.equal(restored.snapshot().entities[0].id, id);
  assert.equal(restored.snapshot().entities[0].state.online, true);
  await restored.close();
  config.udn = 'uuid:some-other-TV';
  const replacement = await ready(t, path);
  assert.equal(replacement.snapshot().entities[0].state.online, false);
  await assert.rejects(replacement.execute(id, { type: 'setMute', value: true }), /disponible/);
  await replacement.close(); await close();
  const offline = await ready(t, path);
  assert.deepEqual(offline.snapshot().entities[0].state, { online: false });
});

test('URLs stay pinned to a numeric advertised host; redirects, DTDs and remote service URLs fail', async (t) => {
  const { candidate, config } = await fixture(t);
  for (const address of ['https://127.0.0.1/device', 'http://localhost/device', 'http://192.0.2.1/device', 'http://user:pass@127.0.0.1/device']) {
    assert.throws(() => pinnedUrl(address, candidate));
  }
  config.controlUrl = 'http://192.0.2.1/control';
  await assert.rejects(inspectRenderer(candidate), /dirección local/);
  config.controlUrl = '/control'; config.scpdUrl = '/redirect';
  await assert.rejects(inspectRenderer(candidate));
  config.scpdUrl = '/scpd'; config.descriptor = '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>';
  await assert.rejects(inspectRenderer(candidate), /XML/);
});

test('polling reports external changes through confirmed state events and stops cleanly', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { candidate, config, calls } = await fixture(t);
  const service = await ready(t, await storage(t)); await service.add(candidate);
  const changed = new Promise<void>((resolve) => service.subscribe((snapshot) => {
    if (snapshot.entities[0]?.state.volume === 36) resolve();
  }));
  config.volume = '36'; t.mock.timers.tick(10_000); await changed;
  assert.equal(service.snapshot().entities[0].state.volume, 36);
  await service.close(); const count = calls.length; t.mock.timers.tick(30_000);
  assert.equal(calls.length, count);
});
