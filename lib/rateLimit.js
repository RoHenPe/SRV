const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MIN || '240', 10);
const ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';

export function getClientIp(request) {
  if (!request?.headers) return '127.0.0.1';
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
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

function getKey(ip, deviceId, route) {
  return `${ip}:${deviceId}:${route}`;
}

export function checkRateLimit(request, route) {
  if (!ENABLED) return true;

  const ip = getClientIp(request);
  const deviceId = getClientDeviceId(request);
  const key = getKey(ip, deviceId, route);
  const now = Date.now();

  if (!requestCounts.has(key)) {
    requestCounts.set(key, []);
  }

  const timestamps = requestCounts.get(key);
  const recent = timestamps.filter((ts) => now - ts < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    return false;
  }

  recent.push(now);
  requestCounts.set(key, recent);

  if (requestCounts.size > 2000) {
    const allKeys = Array.from(requestCounts.keys());
    allKeys.slice(0, 250).forEach((k) => requestCounts.delete(k));
  }

  return true;
}

export class RateLimitError extends Error {
  constructor() {
    super('Limite de requisições excedido para este dispositivo. Aguarde alguns segundos.');
    this.status = 429;
  }
}
