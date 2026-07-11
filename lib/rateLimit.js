const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MIN || '120', 10);
const ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
         request.headers.get('x-real-ip') ||
         '127.0.0.1';
}

function getKey(ip, route) {
  return `${ip}:${route}`;
}

export function checkRateLimit(request, route) {
  if (!ENABLED) return true;

  const ip = getClientIp(request);
  const key = getKey(ip, route);
  const now = Date.now();

  if (!requestCounts.has(key)) {
    requestCounts.set(key, []);
  }

  const timestamps = requestCounts.get(key);
  const recent = timestamps.filter(ts => now - ts < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    return false;
  }

  recent.push(now);
  requestCounts.set(key, recent);

  // Cleanup old entries
  if (requestCounts.size > 1000) {
    const allKeys = Array.from(requestCounts.keys());
    allKeys.slice(0, 100).forEach(k => requestCounts.delete(k));
  }

  return true;
}

export class RateLimitError extends Error {
  constructor() {
    super('Too many requests');
    this.status = 429;
  }
}
