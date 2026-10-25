import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import test, { type TestContext } from 'node:test';
import type { Action } from '../core/action.ts';
import type { State } from '../core/entity.ts';
import { projectEvents } from '../core/event.ts';
import type { MatterDriver, MatterEndpoint, PairingTarget } from '../adapters/matter/types.ts';
import type { DiscoveryResult } from '../adapters/lan/types.ts';
import { MatterService } from '../server/matter-service.ts';
import { createMatterMiddleware } from '../server/matter.ts';

const endpoint: MatterEndpoint = {
  id: 'matter:test:1', name: 'Test light', domain: 'lighting', capabilities: ['onOff'], state: { on: false, online: true },
};
const candidate = () => ({
  status: 'complete', completedAt: Date.now(), warnings: [], devices: [{
    id: 'lan:test', name: 'Test', addresses: ['fe80::20%test0'], services: ['_matterc._udp.local'],
    protocols: ['Matter'], lastSeen: Date.now(), matter: { commissioning: 'open', pairing: { port: 5540, discriminator: 1234 } },
  }],
} satisfies DiscoveryResult);
class Driver implements MatterDriver {
  report?: (id: string, state: State) => void;
  targets: PairingTarget[] = [];
  commands: Action[] = [];
  closeCount = 0;
  paired = false;
  failPair = false;
  async start(report: (id: string, state: State) => void) { this.report = report; return this.paired ? [structuredClone(endpoint)] : []; }
  async commission(target: PairingTarget, code: string) {
    this.targets.push(target);
    if (this.failPair) throw new Error(`INTERNAL secret ${code}`);
    this.paired = true;
    return [structuredClone(endpoint)];
  }
  async execute(_id: string, action: Action) { this.commands.push(action); }
  async close() { this.closeCount++; }
}
async function ready(t: TestContext, driver = new Driver()) {
  const service = new MatterService(async () => driver);
  await service.start();
  t.after(() => service.close());
  return { service, driver };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }
async function serve(t: TestContext, discovery: () => DiscoveryResult = candidate) {
  const { service, driver } = await ready(t);
  const middleware = createMatterMiddleware(service, discovery);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404).end(); }); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { middleware.close(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pulse-Matter': '1', ...headers }, body: JSON.stringify(body),
  });
  return { service, driver, base, post };
}

test('pairing discovers a real entity after bootstrap and only driver reports change the event projection', async (t) => {
  const { service, driver } = await ready(t);
  assert.equal(service.snapshot().entities.length, 0);
  service.pair('lan:test', { addresses: ['fe80::20%test0'], port: 5540 }, 'secret-code');
  assert.equal(service.snapshot().pairing.status, 'pairing');
  assert.throws(() => service.pair('other', { addresses: [], port: 5540 }, 'other'), /curso/);
  await settle();
  assert.equal(service.snapshot().pairing.status, 'success');
  await service.execute(endpoint.id, { type: 'turnOn' });
  assert.equal(service.snapshot().entities[0].state.on, false);
  driver.report!(endpoint.id, { on: true });
  const snapshot = service.snapshot();
  assert.equal(snapshot.entities[0].state.on, true);
  assert.deepEqual(projectEvents(snapshot.events), snapshot.entities);
  driver.report!(endpoint.id, { on: true });
  assert.equal(service.snapshot().events.length, snapshot.events.length);
  driver.report!(endpoint.id, { online: false });
  await assert.rejects(service.execute(endpoint.id, { type: 'turnOff' }), /disponible/);
  assert.ok(!JSON.stringify(service.snapshot()).includes('secret-code'));
  await service.close(); await service.close();
  assert.equal(driver.closeCount, 1);
});

test('pairing failures redact driver errors and do not manufacture entities', async (t) => {
  const { service, driver } = await ready(t);
  driver.failPair = true;
  service.pair('lan:test', { addresses: [], port: 5540 }, 'secret-code');
  await settle();
  const snapshot = service.snapshot();
  assert.equal(snapshot.pairing.status, 'error');
  assert.deepEqual(snapshot.entities, []);
  assert.ok(!JSON.stringify(snapshot).includes('secret-code'));
  assert.ok(!JSON.stringify(snapshot).includes('INTERNAL'));
});

test('pair API uses only fresh server-side candidates and never accepts client-supplied targets', async (t) => {
  const api = await serve(t);
  const body = { candidateId: 'lan:test', code: 'secret-code' };
  assert.equal((await api.post('/api/matter/pair', { ...body, addresses: ['8.8.8.8'] })).status, 400);
  assert.equal((await api.post('/api/matter/pair', { ...body, candidateId: 'unknown' })).status, 409);
  assert.equal((await api.post('/api/matter/pair', body)).status, 202);
  await settle();
  assert.deepEqual(api.driver.targets, [{ addresses: ['fe80::20%test0'], port: 5540, discriminator: 1234 }]);
  const response = await fetch(api.base + '/api/matter');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('secret-code'));
});

test('stale and closed commissioning advertisements cannot start pairing', async (t) => {
  for (const result of [
    { ...candidate(), completedAt: Date.now() - 601_000 },
    { ...candidate(), devices: [{ ...candidate().devices[0], matter: { commissioning: 'closed' as const, pairing: { port: 5540 } } }] },
  ]) {
    const api = await serve(t, () => result);
    assert.equal((await api.post('/api/matter/pair', { candidateId: 'lan:test', code: 'secret' })).status, 409);
    assert.equal(api.driver.targets.length, 0);
  }
});

test('local Matter API rejects cross-origin requests, missing intent headers and oversized inputs', async (t) => {
  const api = await serve(t);
  const invalidHeaders: Record<string, string>[] = [{ Origin: 'https://example.com' }, { Host: 'evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }];
  for (const headers of invalidHeaders) {
    for (const method of ['GET', 'POST']) {
      // Fetch may replace Host; use raw HTTP to exercise exactly the supplied headers.
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(api.base + (method === 'GET' ? '/api/matter' : '/api/matter/pair'), {
          method, headers: { 'Content-Type': 'application/json', 'X-Pulse-Matter': '1', ...headers },
        }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
        req.on('error', reject); req.end(method === 'POST' ? '{}' : undefined);
      });
      assert.equal(status, 403, `${method} ${JSON.stringify(headers)}`);
    }
  }
  assert.equal((await api.post('/api/matter/pair', {}, { 'X-Pulse-Matter': '0' })).status, 403);
  assert.equal((await api.post('/api/matter/pair', { code: 'x'.repeat(3000) })).status, 400);
  assert.equal(api.driver.targets.length, 0);
});

test('SSE delivers initial state and confirmed updates and releases its stream on disconnect', async (t) => {
  const api = await serve(t);
  api.service.pair('lan:test', { addresses: [], port: 5540 }, 'secret-code');
  await settle();
  const abort = new AbortController();
  const response = await fetch(api.base + '/api/matter/events', { signal: abort.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: snapshot/);
  assert.match(first, /"on":false/);
  api.driver.report!(endpoint.id, { on: true });
  const second = new TextDecoder().decode((await reader.read()).value);
  assert.match(second, /"on":true/);
  assert.ok(!second.includes('secret-code'));
  abort.abort();
  await reader.cancel().catch(() => {});
});
