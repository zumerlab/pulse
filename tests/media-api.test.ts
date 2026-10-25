import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import test, { type TestContext } from 'node:test';
import type { DiscoveredDevice, DiscoveryResult } from '../adapters/lan/types.ts';
import type { Action } from '../core/action.ts';
import type { PulseEntity } from '../core/entity.ts';
import type { PulseEvent } from '../core/event.ts';
import { createMediaMiddleware } from '../server/media.ts';

const candidate = (): DiscoveredDevice => ({
  id: 'lan:192.168.1.20', name: 'Samsung TV', addresses: ['192.168.1.20'],
  services: ['urn:schemas-upnp-org:device:MediaRenderer:1'], protocols: ['SSDP/UPnP'], lastSeen: Date.now(),
  upnp: { descriptionUrl: 'http://192.168.1.20:9197/dmr/description.xml', deviceType: 'urn:schemas-upnp-org:device:MediaRenderer:1' },
});
const discovery = (): DiscoveryResult => ({
  status: 'complete', completedAt: Date.now(), warnings: [], devices: [candidate()],
});
const entity: PulseEntity = {
  id: 'upnp:test', name: 'Samsung TV', kind: 'device', domain: 'media',
  source: { adapter: 'upnp', protocol: 'UPnP', local: true }, capabilities: ['volume', 'mute'],
  state: { volume: 20, muted: false, online: true },
};
interface Snapshot {
  status: 'starting' | 'ready' | 'error';
  entities: PulseEntity[];
  events: PulseEvent[];
  error?: string;
}
class Service {
  candidates: DiscoveredDevice[] = [];
  commands: Array<{ id: string; action: Action }> = [];
  listeners = new Set<(snapshot: Snapshot) => void>();
  current: Snapshot = { status: 'ready', entities: [], events: [] };
  fail = false;
  async start() {}
  snapshot() { return structuredClone(this.current); }
  async add(device: DiscoveredDevice) {
    this.candidates.push(structuredClone(device));
    if (this.fail) throw new Error('INTERNAL http://private-endpoint/token');
    this.current.entities = [structuredClone(entity)];
  }
  async execute(id: string, action: Action) {
    this.commands.push({ id, action });
    if (this.fail) throw new Error('INTERNAL http://private-endpoint/token');
  }
  subscribe(handler: (snapshot: Snapshot) => void) {
    this.listeners.add(handler);
    return () => { this.listeners.delete(handler); };
  }
  report() { for (const handler of this.listeners) handler(this.snapshot()); }
}
async function serve(t: TestContext, scan: () => DiscoveryResult = discovery) {
  const service = new Service();
  const middleware = createMediaMiddleware(service, scan);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404).end(); }); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    middleware.close(); server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pulse-Media': '1', ...headers }, body: JSON.stringify(body),
  });
  return { service, middleware, base, post };
}

test('media add takes the fresh server candidate and rejects client-selected destinations', async (t) => {
  const scan = discovery();
  const api = await serve(t, () => scan);
  for (const extra of [
    { descriptionUrl: 'http://127.0.0.1/private' }, { addresses: ['8.8.8.8'] }, { upnp: candidate().upnp },
  ]) {
    assert.equal((await api.post('/api/media/add', { candidateId: candidate().id, ...extra })).status, 400);
  }
  assert.equal((await api.post('/api/media/add', { candidateId: 'unknown' })).status, 409);
  assert.deepEqual(api.service.candidates, []);
  const added = await api.post('/api/media/add', { candidateId: candidate().id });
  assert.equal(added.status, 200);
  assert.deepEqual(api.service.candidates, scan.devices);
  assert.deepEqual((await added.json() as Snapshot).entities, [entity]);
  const response = await fetch(api.base + '/api/media');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('media add rejects stale, unfinished and non-renderer discoveries', async (t) => {
  for (const result of [
    { ...discovery(), completedAt: Date.now() - 601_000 },
    { ...discovery(), status: 'scanning' as const },
    { ...discovery(), completedAt: undefined },
    { ...discovery(), devices: [{ ...candidate(), upnp: undefined }] },
  ]) {
    const api = await serve(t, () => result);
    assert.equal((await api.post('/api/media/add', { candidateId: candidate().id })).status, 409);
    assert.deepEqual(api.service.candidates, []);
  }
});

test('media add checks advertised description address again before service access', async (t) => {
  for (const descriptionUrl of [
    'http://127.0.0.1/private', 'http://192.168.1.30/description.xml', 'http://example.test/description.xml',
    'https://192.168.1.20/description.xml', 'http://user:password@192.168.1.20/description.xml',
    'http://192.168.1.20/description.xml#fragment', 'file:///description.xml', 'invalid',
  ]) {
    const device = candidate();
    device.upnp!.descriptionUrl = descriptionUrl;
    const api = await serve(t, () => ({ ...discovery(), devices: [device] }));
    assert.equal((await api.post('/api/media/add', { candidateId: device.id })).status, 409, descriptionUrl);
    assert.deepEqual(api.service.candidates, []);
  }
});

test('media actions route to the service with exact request shape and redact failures', async (t) => {
  const api = await serve(t);
  const body = { entityId: entity.id, action: { type: 'setVolume', value: 25 } };
  for (const invalid of [
    {}, { ...body, endpoint: 'http://127.0.0.1/private' }, { entityId: 4, action: body.action },
    { entityId: entity.id, action: [] }, { entityId: entity.id, action: null },
  ]) assert.equal((await api.post('/api/media/action', invalid)).status, 400);
  assert.deepEqual(api.service.commands, []);
  assert.equal((await api.post('/api/media/action', body)).status, 200);
  assert.deepEqual(api.service.commands, [{ id: entity.id, action: body.action }]);
  api.service.fail = true;
  const response = await api.post('/api/media/action', body);
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /INTERNAL|private-endpoint|token/);
});

test('local media API rejects foreign hosts and origins, missing intent, and oversized bodies', async (t) => {
  const api = await serve(t);
  const invalidHeaders: Record<string, string>[] = [
    { Origin: 'https://example.com' }, { Host: 'evil.test' }, { 'Sec-Fetch-Site': 'cross-site' },
  ];
  for (const headers of invalidHeaders) {
    for (const method of ['GET', 'POST']) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(api.base + (method === 'GET' ? '/api/media' : '/api/media/add'), {
          method, headers: { 'Content-Type': 'application/json', 'X-Pulse-Media': '1', ...headers },
        }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
        req.on('error', reject); req.end(method === 'POST' ? '{}' : undefined);
      });
      assert.equal(status, 403, `${method} ${JSON.stringify(headers)}`);
    }
  }
  assert.equal((await api.post('/api/media/add', {}, { 'X-Pulse-Media': '0' })).status, 403);
  assert.equal((await api.post('/api/media/add', {}, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await api.post('/api/media/add', { candidateId: 'x'.repeat(3000) })).status, 400);
  assert.deepEqual(api.service.candidates, []);
});

test('media SSE sends initial and updated snapshots and close releases subscriptions', async (t) => {
  const api = await serve(t);
  const response = await fetch(api.base + '/api/media/events');
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: snapshot/);
  assert.equal(api.service.listeners.size, 1);
  api.service.current.entities = [structuredClone(entity)];
  api.service.report();
  const updated = new TextDecoder().decode((await reader.read()).value);
  assert.match(updated, /"volume":20/);
  api.middleware.close();
  assert.equal(api.service.listeners.size, 0);
  assert.equal((await reader.read()).done, true);
});
