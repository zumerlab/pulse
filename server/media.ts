import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIPv4 } from 'node:net';
import type { Action } from '../core/action.ts';
import type { PulseEntity } from '../core/entity.ts';
import type { PulseEvent } from '../core/event.ts';
import type { DiscoveredDevice, DiscoveryResult } from '../adapters/lan/types.ts';
import { localRequest, readBody } from './local-http.ts';

interface MediaSnapshot {
  status: 'starting' | 'ready' | 'error';
  entities: PulseEntity[];
  events: PulseEvent[];
  error?: string;
}

interface MediaApiService {
  start(): Promise<void>;
  snapshot(): MediaSnapshot;
  add(candidate: DiscoveredDevice): Promise<void>;
  execute(entityId: string, action: Action): Promise<void>;
  subscribe(handler: (snapshot: MediaSnapshot) => void): () => void;
}

function available(candidate: DiscoveredDevice | undefined): candidate is DiscoveredDevice {
  if (!candidate?.upnp || !/^urn:schemas-upnp-org:device:MediaRenderer:\d+$/.test(candidate.upnp.deviceType)) return false;
  try {
    const url = new URL(candidate.upnp.descriptionUrl);
    return url.protocol === 'http:' && isIPv4(url.hostname) && candidate.addresses.includes(url.hostname)
      && !url.username && !url.password && !url.hash && url.port !== '0';
  } catch { return false; }
}

/** Only add devices from the server's recent discovery; callers never supply a network target. */
export function createMediaMiddleware(service: MediaApiService, discovery: () => DiscoveryResult) {
  const streams = new Set<() => void>();
  const middleware = async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const path = request.url?.split('?')[0];
    if (!path?.startsWith('/api/media')) return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (status: number, data: unknown) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(data));
    };
    if (!localRequest(request)) return reply(403, { error: 'Abre Pulse en esta máquina para conectar tus dispositivos.' });
    if (request.method === 'GET' && (path === '/api/media' || path === '/api/media/events')) {
      void service.start().catch(() => {});
      if (path === '/api/media') return reply(200, service.snapshot());
      response.setHeader('Content-Type', 'text/event-stream');
      response.setHeader('Connection', 'keep-alive');
      response.flushHeaders();
      let blocked = false;
      let queued = false;
      const send = (snapshot: MediaSnapshot) => {
        if (response.destroyed) return;
        if (blocked) { queued = true; return; }
        blocked = !response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
      };
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
    if (!['/api/media/add', '/api/media/action'].includes(path)) return reply(404, { error: 'Ruta no disponible.' });
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return reply(405, { error: 'Método no permitido.' }); }
    if (request.headers['x-pulse-media'] !== '1' || !request.headers['content-type']?.startsWith('application/json')) {
      return reply(403, { error: 'Solicitud inválida.' });
    }
    let body: Record<string, unknown>;
    try { body = await readBody(request); }
    catch { return reply(400, { error: 'Solicitud inválida o demasiado grande.' }); }
    if (path === '/api/media/add') {
      if (typeof body.candidateId !== 'string' || body.candidateId.length > 600 || Object.keys(body).some((key) => key !== 'candidateId')) {
        return reply(400, { error: 'Selecciona un dispositivo de la lista.' });
      }
      const result = discovery();
      const candidate = result.devices.find((device) => device.id === body.candidateId);
      if (result.status !== 'complete' || !result.completedAt || Date.now() - result.completedAt > 10 * 60_000 || !available(candidate)) {
        return reply(409, { error: 'Este dispositivo no está disponible para agregar. Enciéndelo y vuelve a buscar.' });
      }
      try {
        await service.start();
        await service.add(candidate);
        return reply(200, service.snapshot());
      } catch { return reply(502, { error: 'No pudimos leer los controles de la TV. Comprueba que esté encendida y conectada a esta red, y vuelve a intentar.' }); }
    }
    if (typeof body.entityId !== 'string' || body.entityId.length > 600 || !body.action || typeof body.action !== 'object'
      || Array.isArray(body.action) || Object.keys(body).some((key) => !['entityId', 'action'].includes(key))) {
      return reply(400, { error: 'Acción inválida.' });
    }
    try {
      await service.execute(body.entityId, body.action as Action);
      return reply(200, service.snapshot());
    } catch { return reply(400, { error: 'No se pudo confirmar el cambio en la TV. Revisa su conexión y vuelve a intentar.' }); }
  };
  return Object.assign(middleware, { close: () => { for (const close of [...streams]) close(); } });
}
