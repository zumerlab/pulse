import type { IncomingMessage, ServerResponse } from 'node:http';
import { localRequest } from './local-http.ts';

export interface HomeAssistantEnv {
  HA_URL?: string;
  HA_TOKEN?: string;      // long-lived access token; with it, no username is needed
  HA_USERNAME?: string;
  HA_PASSWORD?: string;
}

type Token = { access: string; refresh?: string; until: number };

// The browser never sees the username or the password: the local server logs
// into Home Assistant, keeps the refresh token in memory and hands out only a
// short-lived access token. The WebSocket goes through Vite's proxy
// (/api/ha/websocket), so the browser talks to its own origin.
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
    if (!response.ok) throw new Error(`Home Assistant answered ${response.status} at ${path}.`);
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
      } catch { /* the refresh token expired or was revoked: full login */ }
    }
    if (!env.HA_USERNAME || !env.HA_PASSWORD) {
      throw new Error('HA_TOKEN, or HA_USERNAME and HA_PASSWORD, are missing in .env.local.');
    }
    const flow = await post('/auth/login_flow',
      { client_id: clientId, handler: ['homeassistant', null], redirect_uri: clientId });
    const done = await post(`/auth/login_flow/${String(flow.flow_id)}`,
      { client_id: clientId, username: env.HA_USERNAME, password: env.HA_PASSWORD });
    if (done.type !== 'create_entry') throw new Error('Home Assistant rejected the username or the password.');
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
    if (!localRequest(request)) return reply(403, { error: 'Open Pulse on this machine.' });
    if (request.method !== 'GET') return reply(405, { error: 'Method not allowed.' });
    try {
      const t = await session();
      reply(200, { accessToken: t.access, expiresIn: Math.round((t.until - Date.now()) / 1000) || null });
    } catch (error) {
      token = null;
      reply(502, { error: error instanceof Error ? error.message : 'Could not log into Home Assistant.' });
    }
  };
}
