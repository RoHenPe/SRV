const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MIN || '240', 10);
const ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';

export function getClientIp(request) {
  if (!request?.headers) return '127.0.0.1';
  const vercelIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
  if (vercelIp) return vercelIp;
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1'
  );
}

export function getClientDeviceId(request) {
  if (!request?.headers) return 'default-device';
  return (request.headers.get('x-device-id') || 'default-device').slice(0, 64);
}

export function getClientDeviceName(request) {
  if (!request?.headers) return 'Navegador Web';
  return (request.headers.get('x-device-name') || 'Navegador Web').slice(0, 80);
}

function getKey(ip, deviceId, route, perIpOnly = false) {
  return perIpOnly ? `${ip}::${route}` : `${ip}:${deviceId}:${route}`;
}

export function checkRateLimit(request, route, options = {}) {
  if (!ENABLED) return true;

  const limit = Number.isFinite(options?.max) ? options.max : MAX_REQUESTS;
  const windowMs = Number.isFinite(options?.windowMs) ? options.windowMs : WINDOW_MS;
  const perIpOnly = Boolean(options?.perIpOnly);

  const ip = getClientIp(request);
  const deviceId = getClientDeviceId(request);
  const key = getKey(ip, deviceId, route, perIpOnly);
  const now = Date.now();

  if (!requestCounts.has(key)) {
    requestCounts.set(key, []);
  }

  const timestamps = requestCounts.get(key);
  const recent = timestamps.filter((ts) => now - ts < windowMs);

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);
  requestCounts.set(key, recent);

  if (requestCounts.size > 500) {
    for (const [k, tsList] of requestCounts.entries()) {
      if (!tsList.length || now - tsList[tsList.length - 1] >= WINDOW_MS) {
        requestCounts.delete(k);
      }
    }
    if (requestCounts.size > 2000) {
      const allKeys = Array.from(requestCounts.keys());
      allKeys.slice(0, 250).forEach((k) => requestCounts.delete(k));
    }
  }

  return true;
}

export class RateLimitError extends Error {
  constructor() {
    super('Limite de requisições excedido para este dispositivo. Aguarde alguns segundos.');
    this.status = 429;
  }
}
