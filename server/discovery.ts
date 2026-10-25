import type { IncomingMessage, ServerResponse } from 'node:http';
import { scanNetwork } from '../adapters/lan/scan.ts';
import type { DiscoveryResult } from '../adapters/lan/types.ts';

/** Loopback-only API; scans never accept addresses, URLs or commands from clients. */
export function createDiscoveryMiddleware(scan: () => Promise<DiscoveryResult> = scanNetwork) {
  let state: DiscoveryResult = { status: 'idle', devices: [], warnings: [] };
  let pending: Promise<void> | undefined;
  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/discovery') return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status: number, data: unknown) => {
      response.statusCode = status;
      response.end(JSON.stringify(data));
    };
    const host = request.headers.host ?? '';
    const remote = request.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '')
      || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
      || (request.headers.origin && request.headers.origin !== `http://${host}`)
      || request.headers['sec-fetch-site'] === 'cross-site') {
      return reply(403, { error: 'La búsqueda solo está disponible desde Pulse en esta máquina.' });
    }
    if (request.method === 'GET') return reply(200, state);
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return reply(405, { error: 'Método no permitido.' });
    }
    if (request.headers['x-pulse-discovery'] !== '1') return reply(403, { error: 'Solicitud de descubrimiento inválida.' });
    if (!pending) {
      state = { ...state, status: 'scanning', startedAt: Date.now(), warnings: [], error: undefined };
      pending = Promise.resolve().then(scan).then((result) => { state = result; }).catch((error: unknown) => {
        state = {
          ...state, status: 'error', completedAt: Date.now(),
          error: error instanceof Error ? error.message : 'No se pudo buscar en la red local.',
        };
      }).finally(() => { pending = undefined; });
    }
    await pending;
    return reply(200, state);
  };
  return Object.assign(middleware, { snapshot: () => structuredClone(state) });
}
