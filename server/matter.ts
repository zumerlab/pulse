import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Action } from '../core/action.ts';
import type { DiscoveryResult } from '../adapters/lan/types.ts';
import type { MatterService } from './matter-service.ts';
import { localRequest, readBody } from './local-http.ts';

/** Code and scan targets never appear in URLs, snapshots, events or error messages. */
export function createMatterMiddleware(service: MatterService, discovery: () => DiscoveryResult) {
  const streams = new Set<() => void>();
  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0];
    if (!path?.startsWith('/api/matter')) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status: number, data: unknown) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(data));
    };
    if (!localRequest(request)) return reply(403, { error: 'Matter solo está disponible desde Pulse en esta máquina.' });
    if (request.method === 'GET' && (path === '/api/matter' || path === '/api/matter/events')) {
      void service.start();
      if (path === '/api/matter') return reply(200, service.snapshot());
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      let blocked = false;
      let queued = false;
      const send = (snapshot: ReturnType<MatterService['snapshot']>) => {
        if (response.destroyed) return;
        if (blocked) { queued = true; return; }
        blocked = !response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      };
      // Coalesce while the browser is slow; the next snapshot includes the complete log.
      response.on('drain', () => { blocked = false; if (queued) { queued = false; send(service.snapshot()); } });
      const unsubscribe = service.subscribe(send);
      const heartbeat = setInterval(() => { if (!blocked) blocked = !response.write(': pulse\n\n'); }, 15_000);
      heartbeat.unref();
      const cleanup = () => { clearInterval(heartbeat); unsubscribe(); streams.delete(close); };
      const close = () => { cleanup(); response.end(); };
      streams.add(close);
      response.once('close', cleanup);
      send(service.snapshot());
      return;
    }
    if (!['/api/matter/pair', '/api/matter/action'].includes(path)) return reply(404, { error: 'Ruta no disponible.' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return reply(405, { error: 'Método no permitido.' }); }
    if (request.headers['x-pulse-matter'] !== '1'
      || !request.headers['content-type']?.startsWith('application/json')) return reply(403, { error: 'Solicitud Matter inválida.' });
    let body: Record<string, unknown>;
    try { body = await readBody(request); }
    catch { return reply(400, { error: 'Solicitud inválida o demasiado grande.' }); }
    if (path === '/api/matter/pair') {
      const { candidateId, code } = body;
      if (typeof candidateId !== 'string' || candidateId.length > 600 || typeof code !== 'string'
        || code.length > 512 || !code.trim() || Object.keys(body).some((key) => !['candidateId', 'code'].includes(key))) {
        return reply(400, { error: 'Selecciona un dispositivo e introduce su código Matter.' });
      }
      const result = discovery();
      const candidate = result.devices.find((device) => device.id === candidateId);
      const pairing = candidate?.matter?.pairing;
      if (result.status !== 'complete' || !result.completedAt || Date.now() - result.completedAt > 10 * 60_000
        || candidate?.matter?.commissioning !== 'open' || !candidate.addresses.length || !pairing) {
        return reply(409, { error: 'El dispositivo no está disponible para vincular. Vuelve a buscar en tu red.' });
      }
      try {
        service.pair(candidateId, { addresses: [...candidate.addresses], ...pairing }, code);
        return reply(202, service.snapshot());
      } catch { return reply(409, { error: 'Matter no está listo o ya hay una vinculación en curso.' }); }
    }
    if (typeof body.entityId !== 'string' || !body.action || typeof body.action !== 'object' || Array.isArray(body.action)) {
      return reply(400, { error: 'Acción inválida.' });
    }
    try {
      await service.execute(body.entityId, body.action as Action);
      return reply(200, service.snapshot());
    } catch { return reply(400, { error: 'No se pudo confirmar la acción. Revisa la conexión y los límites del dispositivo.' }); }
  };
  return Object.assign(middleware, { close: () => { for (const close of [...streams]) close(); } });
}
