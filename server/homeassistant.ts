import type { IncomingMessage, ServerResponse } from 'node:http';
import { localRequest } from './local-http.ts';

export interface HomeAssistantEnv {
  HA_URL?: string;
  HA_TOKEN?: string;      // token de larga duración; si está, no hace falta usuario
  HA_USERNAME?: string;
  HA_PASSWORD?: string;
}

type Token = { access: string; refresh?: string; until: number };

// El navegador nunca ve usuario ni contraseña: el servidor local hace el login
// de Home Assistant, guarda el refresh token en memoria y entrega solo un
// access token de corta duración. El WebSocket pasa por el proxy de Vite
// (/api/ha/websocket), así el navegador habla con su mismo origen.
export function createHomeAssistantMiddleware(env: HomeAssistantEnv) {
  const base = (env.HA_URL ?? 'http://localhost:8123').replace(/\/$/, '');
  const clientId = 'http://127.0.0.1/';
  let token: Token | null = null;
  let inflight: Promise<Token> | null = null;

  const post = async (path: string, body: Record<string, unknown>, form = false) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
      body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Home Assistant respondió ${response.status} en ${path}.`);
    return await response.json() as Record<string, unknown>;
  };

  const issue = (data: Record<string, unknown>, refresh?: string): Token => ({
    access: String(data.access_token),
    refresh: typeof data.refresh_token === 'string' ? data.refresh_token : refresh,
    until: Date.now() + Number(data.expires_in ?? 1800) * 1000,
  });

  const login = async (): Promise<Token> => {
    if (env.HA_TOKEN) return { access: env.HA_TOKEN, until: Infinity };
    if (token?.refresh) {
      try {
        return issue(await post('/auth/token',
          { grant_type: 'refresh_token', refresh_token: token.refresh, client_id: clientId }, true), token.refresh);
      } catch { /* el refresh venció o lo revocaron: login completo */ }
    }
    if (!env.HA_USERNAME || !env.HA_PASSWORD) {
      throw new Error('Falta HA_TOKEN, o HA_USERNAME y HA_PASSWORD, en .env.local.');
    }
    const flow = await post('/auth/login_flow',
      { client_id: clientId, handler: ['homeassistant', null], redirect_uri: clientId });
    const done = await post(`/auth/login_flow/${String(flow.flow_id)}`,
      { client_id: clientId, username: env.HA_USERNAME, password: env.HA_PASSWORD });
    if (done.type !== 'create_entry') throw new Error('Home Assistant rechazó el usuario o la contraseña.');
    return issue(await post('/auth/token',
      { grant_type: 'authorization_code', code: String(done.result), client_id: clientId }, true));
  };

  const session = async () => {
    if (token && token.until - Date.now() > 60_000) return token;
    inflight ??= login().finally(() => { inflight = null; });
    token = await inflight;
    return token;
  };

  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split('?')[0] !== '/api/ha/session') return next();
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    const reply = (status: number, data: unknown) => {
      response.statusCode = status;
      response.end(JSON.stringify(data));
    };
    if (!localRequest(request)) return reply(403, { error: 'Abre Pulse en esta máquina.' });
    if (request.method !== 'GET') return reply(405, { error: 'Método no permitido.' });
    try {
      const t = await session();
      reply(200, { accessToken: t.access, expiresIn: Math.round((t.until - Date.now()) / 1000) || null });
    } catch (error) {
      token = null;
      reply(502, { error: error instanceof Error ? error.message : 'No se pudo entrar a Home Assistant.' });
    }
  };
}
