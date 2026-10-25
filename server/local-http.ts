import type { IncomingMessage } from 'node:http';

export function localRequest(request: IncomingMessage): boolean {
  const host = request.headers.host ?? '';
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '')
    && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)
    && (!request.headers.origin || request.headers.origin === `http://${host}`)
    && request.headers['sec-fetch-site'] !== 'cross-site';
}

export function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onError);
      if (error) { request.resume(); reject(error); return; }
      try {
        const value: unknown = JSON.parse(body);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
        resolve(value as Record<string, unknown>);
      } catch { reject(new Error('Solicitud inválida.')); }
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 2048) { finish(new Error('Solicitud demasiado grande.')); return; }
      body += chunk.toString('utf8');
    };
    const onEnd = () => finish();
    const onError = () => finish(new Error('Solicitud interrumpida.'));
    const timer = setTimeout(() => finish(new Error('Solicitud incompleta.')), 5000);
    request.on('data', onData).once('end', onEnd).once('error', onError).once('aborted', onError);
  });
}

