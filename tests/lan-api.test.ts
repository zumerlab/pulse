import assert from 'node:assert/strict';
import { createServer, request, type IncomingMessage } from 'node:http';
import test, { type TestContext } from 'node:test';
import { isOnNetwork } from '../adapters/lan/network.ts';
import type { DiscoveryResult } from '../adapters/lan/types.ts';
import { createDiscoveryMiddleware } from '../server/discovery.ts';

const result: DiscoveryResult = {
  status: 'complete',
  network: { name: 'test0', address: '192.168.10.12', netmask: '255.255.255.0' },
  devices: [{
    id: 'test:nest', name: 'Test Nest', addresses: ['192.168.10.24'],
    protocols: ['mDNS'], services: ['_googlecast._tcp.local'], lastSeen: 1234,
  }],
  warnings: [], startedAt: 1000, completedAt: 2000,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function serve(
  context: TestContext,
  scan: () => Promise<DiscoveryResult>,
  observeRequest?: (incoming: IncomingMessage) => void,
) {
  const middleware = createDiscoveryMiddleware(scan);
  const server = createServer((incoming, response) => {
    observeRequest?.(incoming);
    void middleware(incoming, response, () => {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const host = `127.0.0.1:${address.port}`;
  return {
    host,
    send(method = 'GET', headers: Record<string, string> = {}, path = '/api/discovery', body?: string) {
      return new Promise<{ status: number; headers: IncomingMessage['headers']; data: DiscoveryResult }>((resolve, reject) => {
        const outgoing = request({
          host: '127.0.0.1', port: address.port, method, path,
          headers: { Host: host, ...headers }, timeout: 3000,
        }, (response) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => { text += chunk; });
          response.on('end', () => {
            try {
              resolve({ status: response.statusCode!, headers: response.headers, data: JSON.parse(text) as DiscoveryResult });
            } catch (error) { reject(error); }
          });
          response.on('error', reject);
        });
        outgoing.on('error', reject);
        outgoing.on('timeout', () => outgoing.destroy(new Error('Local API request timed out')));
        outgoing.end(body);
      });
    },
  };
}

test('discovery GET is an idle snapshot and unrelated routes pass through without scanning', async (context) => {
  let calls = 0;
  const api = await serve(context, async () => { calls += 1; return result; });
  const response = await api.send();
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { status: 'idle', devices: [], warnings: [] });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal((await api.send('GET', {}, '/api/discovery-other')).status, 404);
  assert.equal(calls, 0);
});

test('discovery POST requires the application header and accepts a same-origin loopback request', async (context) => {
  let calls = 0;
  const api = await serve(context, async () => { calls += 1; return result; });
  const invalidHeaders: Record<string, string>[] = [{}, { 'X-Pulse-Discovery': '0' }];
  for (const headers of invalidHeaders) {
    assert.equal((await api.send('POST', headers)).status, 403);
  }
  assert.equal(calls, 0);
  const response = await api.send('POST', { 'X-Pulse-Discovery': '1', Origin: `http://${api.host}` });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, result);
  assert.deepEqual((await api.send()).data, result);
  assert.equal(calls, 1);
});

test('foreign origins, hosts and cross-site requests cannot read results or initiate discovery', async (context) => {
  let calls = 0;
  const api = await serve(context, async () => { calls += 1; return result; });
  const headers: Record<string, string>[] = [
    { Origin: 'https://example.com' },
    { Origin: 'null' },
    { Origin: 'http://127.0.0.1:1' },
    { Host: 'example.com' },
    { Host: '127.0.0.1.example.com' },
    { Host: '192.168.10.12' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ];
  for (const candidate of headers) {
    for (const method of ['GET', 'POST']) {
      const response = await api.send(method, { 'X-Pulse-Discovery': '1', ...candidate });
      assert.equal(response.status, 403, `${method}: ${JSON.stringify(candidate)}`);
    }
  }
  assert.equal(calls, 0);
});

test('discovery rejects unsupported methods with an Allow header', async (context) => {
  let calls = 0;
  const api = await serve(context, async () => { calls += 1; return result; });
  for (const method of ['PUT', 'DELETE', 'OPTIONS']) {
    const response = await api.send(method, { 'X-Pulse-Discovery': '1' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, POST');
  }
  assert.equal(calls, 0);
});

test('concurrent discovery requests share one scan and GET exposes its in-flight state', { timeout: 5000 }, async (context) => {
  const started = deferred<void>();
  const complete = deferred<DiscoveryResult>();
  const bothArrived = deferred<void>();
  let posts = 0;
  let calls = 0;
  const api = await serve(context, async () => {
    calls += 1;
    started.resolve();
    return complete.promise;
  }, (incoming) => {
    if (incoming.method === 'POST' && ++posts === 2) bothArrived.resolve();
  });
  const first = api.send('POST', { 'X-Pulse-Discovery': '1' });
  await started.promise;
  const second = api.send('POST', { 'X-Pulse-Discovery': '1' });
  await bothArrived.promise;
  const snapshot = await api.send();
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.data.status, 'scanning');
  assert.equal(typeof snapshot.data.startedAt, 'number');
  assert.deepEqual(snapshot.data.devices, []);
  assert.equal(calls, 1);
  complete.resolve(result);
  for (const response of await Promise.all([first, second])) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, result);
  }
  assert.equal(calls, 1);
});

test('a failed discovery is observable and the next request can retry', async (context) => {
  let calls = 0;
  const api = await serve(context, async () => {
    calls += 1;
    if (calls === 1) throw new Error('Test interface unavailable');
    return result;
  });
  const failed = await api.send('POST', { 'X-Pulse-Discovery': '1' });
  assert.equal(failed.status, 200);
  assert.equal(failed.data.status, 'error');
  assert.equal(failed.data.error, 'Test interface unavailable');
  assert.equal(typeof failed.data.completedAt, 'number');
  assert.deepEqual((await api.send()).data, failed.data);
  assert.deepEqual((await api.send('POST', { 'X-Pulse-Discovery': '1' })).data, result);
  assert.equal(calls, 2);
});

test('client addresses, URLs, interface names and durations are never passed to the scanner', async (context) => {
  const calls: unknown[][] = [];
  const api = await serve(context, async (...args: unknown[]) => { calls.push(args); return result; });
  const response = await api.send(
    'POST', { 'X-Pulse-Discovery': '1', 'Content-Type': 'application/json' },
    '/api/discovery?address=203.0.113.1&interface=other0&duration=999999',
    JSON.stringify({ url: 'http://203.0.113.1', address: '203.0.113.1', interface: 'other0', duration: 999999 }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.network, result.network);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.every((argument) => argument === undefined));
});

test('local subnet checks honor IPv4 netmasks and exclude malformed, network and broadcast addresses', () => {
  const network = { name: 'test0', address: '192.168.10.12', netmask: '255.255.255.0' };
  for (const address of ['192.168.10.1', '192.168.10.12', '192.168.10.254']) {
    assert.equal(isOnNetwork(address, network), true, address);
  }
  for (const address of ['192.168.11.1', '192.168.10.0', '192.168.10.255', '192.168.10.256', '192.168.10', '::1', 'device.local', '']) {
    assert.equal(isOnNetwork(address, network), false, address);
  }
  assert.equal(isOnNetwork('192.168.10.1', { ...network, address: 'invalid' }), false);
  assert.equal(isOnNetwork('192.168.10.1', { ...network, netmask: 'invalid' }), false);
  const widerNetwork = { ...network, netmask: '255.255.240.0' };
  for (const address of ['192.168.0.1', '192.168.8.0', '192.168.8.255', '192.168.15.254']) {
    assert.equal(isOnNetwork(address, widerNetwork), true, address);
  }
  for (const address of ['192.168.0.0', '192.168.15.255', '192.168.16.1']) {
    assert.equal(isOnNetwork(address, widerNetwork), false, address);
  }
});
