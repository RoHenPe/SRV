import crypto from 'crypto';
import { promises as fs } from 'fs';
import { getClientIp, getClientDeviceId, getClientDeviceName } from './rateLimit.js';
import { describeNetworkScope } from './sanitize.js';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let cachedUsers = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 120 * 1000;
const LOCAL_SESSIONS_FILE = '/tmp/dashboard-sessions.json';
const SESSION_COOKIE_NAME = 'srv_auth';

const sessionsMap = new Map();
const revokedSessions = new Set();
let sessionsLoaded = false;
let sessionSyncTimer = null;
let lastRemoteSyncAt = 0;
const MIN_REMOTE_SYNC_INTERVAL_MS = 30 * 1000;

function getSigningSecret() {
  return (
    process.env.AUTH_SESSION_SECRET ||
    process.env.API_KEY ||
    process.env.SSH_PASSWORD ||
    ''
  );
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(candidate, userRecord) {
  if (!candidate || !userRecord) return false;
  if (typeof userRecord.passwordHash === 'string' && userRecord.passwordHash.startsWith('scrypt$')) {
    const parts = userRecord.passwordHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    try {
      const actual = crypto.scryptSync(String(candidate), salt, 64);
      const expected = Buffer.from(expectedHex, 'hex');
      if (actual.length !== expected.length) return false;
      return crypto.timingSafeEqual(actual, expected);
    } catch (_) {
      return false;
    }
  }
  if (typeof userRecord.password === 'string' && userRecord.password.length > 0) {
    const a = Buffer.from(String(candidate), 'utf-8');
    const b = Buffer.from(userRecord.password, 'utf-8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  return false;
}

export function createSessionCookieValue(username, role = 'admin') {
  const secret = getSigningSecret();
  if (!secret) return null;
  const payload = Buffer.from(
    JSON.stringify({ u: username, r: role, exp: Date.now() + 7 * 24 * 3600 * 1000 }),
    'utf-8'
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionCookieValue(cookieVal) {
  const secret = getSigningSecret();
  if (!secret || !cookieVal || !cookieVal.includes('.')) return null;
  const [payload, sig] = cookieVal.split('.');
  if (!payload || !sig) return null;
  try {
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'utf-8');
    const b = Buffer.from(expectedSig, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!decoded?.u || !decoded?.exp || Date.now() > decoded.exp) return null;
    return { username: decoded.u, role: decoded.r || 'admin' };
  } catch (_) {
    return null;
  }
}

export function buildAuthCookieHeader(value, isHttps = true, clear = false) {
  const parts = [`${SESSION_COOKIE_NAME}=${clear ? '' : value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isHttps) parts.push('Secure');
  parts.push(clear ? 'Max-Age=0' : 'Max-Age=604800');
  return parts.join('; ');
}

function parseCookies(cookieHeader) {
  const map = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) map[k] = decodeURIComponent(v);
  }
  return map;
}

async function loadLocalSessions() {
  if (sessionsLoaded) return;
  sessionsLoaded = true;
  try {
    const raw = await fs.readFile(LOCAL_SESSIONS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data?.sessions)) {
      for (const s of data.sessions) {
        if (s?.deviceId) sessionsMap.set(s.deviceId, s);
      }
    }
    if (Array.isArray(data?.revoked)) {
      for (const id of data.revoked) revokedSessions.add(id);
    }
  } catch (_) {}

  try {
    const { runSSH } = await import('./ssh.js');
    const rawRemote = await runSSH('cat ~/.dashboard-sessions.json 2>/dev/null || echo "{}"', 6000);
    const text = typeof rawRemote === 'string' ? rawRemote : rawRemote?.stdout || '{}';
    const data = JSON.parse(text);
    if (Array.isArray(data?.sessions)) {
      for (const s of data.sessions) {
        if (s?.deviceId && !sessionsMap.has(s.deviceId)) {
          sessionsMap.set(s.deviceId, s);
        }
      }
    }
    if (Array.isArray(data?.revoked)) {
      for (const id of data.revoked) revokedSessions.add(id);
    }
  } catch (_) {}
}

function scheduleSessionPersist(forceRemote = false) {
  if (sessionSyncTimer && !forceRemote) return;
  if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
  sessionSyncTimer = setTimeout(async () => {
    sessionSyncTimer = null;
    const sanitizedSessions = Array.from(sessionsMap.values())
      .slice(-100)
      .map(({ ip: rawIp, userAgent: _ua, ...rest }) => ({
        ...rest,
        networkScope: rest.networkScope || describeNetworkScope(rawIp),
      }));
    const payload = {
      sessions: sanitizedSessions,
      revoked: Array.from(revokedSessions).slice(-200),
    };
    const json = JSON.stringify(payload);
    try {
      await fs.writeFile(LOCAL_SESSIONS_FILE, json, 'utf-8');
    } catch (_) {}
    const now = Date.now();
    if (forceRemote || now - lastRemoteSyncAt >= MIN_REMOTE_SYNC_INTERVAL_MS) {
      lastRemoteSyncAt = now;
      try {
        const { runSSH } = await import('./ssh.js');
        const b64 = Buffer.from(json, 'utf-8').toString('base64');
        await runSSH(`echo '${b64}' | base64 -d > ~/.dashboard-sessions.json`, 6000);
      } catch (_) {}
    }
  }, forceRemote ? 100 : 2500);
}

export async function touchDeviceSession({
  deviceId,
  deviceName,
  username,
  ip,
  route,
  activeView,
  activeApp,
  resetRevoked = false,
  forcePersist = false,
}) {
  if (!deviceId || deviceId === 'default-device') return null;
  await loadLocalSessions();

  if (resetRevoked) {
    revokedSessions.delete(deviceId);
  } else if (revokedSessions.has(deviceId)) {
    throw new AuthError('Sessão deste dispositivo foi encerrada remotamente. Faça login novamente.', 401);
  }

  const now = new Date().toISOString();
  const prev = sessionsMap.get(deviceId) || {};
  const scope = describeNetworkScope(ip);
  const meaningfulChange =
    resetRevoked ||
    prev.deviceName !== (deviceName || prev.deviceName) ||
    prev.activeApp !== (activeApp !== undefined ? activeApp : prev.activeApp) ||
    !prev.createdAt;

  const updated = {
    deviceId,
    deviceName: deviceName || prev.deviceName || 'Dispositivo Web',
    username: username || prev.username || 'admin',
    networkScope: scope,
    createdAt: prev.createdAt || now,
    lastSeen: now,
    lastRoute: route || prev.lastRoute || '/',
    activeView: activeView !== undefined ? activeView : (prev.activeView || 'home'),
    activeApp: activeApp !== undefined ? activeApp : (prev.activeApp || null),
  };

  sessionsMap.set(deviceId, updated);
  scheduleSessionPersist(forcePersist || meaningfulChange);
  return updated;
}

export async function getActiveSessions() {
  await loadLocalSessions();
  const nowMs = Date.now();
  return Array.from(sessionsMap.values())
    .filter((s) => !revokedSessions.has(s.deviceId))
    .map(({ ip: rawIp, userAgent: _ua, ...s }) => {
      const lastMs = Date.parse(s.lastSeen || s.createdAt || 0) || 0;
      const ageSec = Math.max(0, Math.round((nowMs - lastMs) / 1000));
      return {
        ...s,
        networkScope: s.networkScope || describeNetworkScope(rawIp),
        online: ageSec < 120,
        idleSeconds: ageSec,
      };
    })
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
}

export async function revokeDeviceSession(deviceId) {
  await loadLocalSessions();
  if (!deviceId) return false;
  revokedSessions.add(deviceId);
  sessionsMap.delete(deviceId);
  scheduleSessionPersist(true);
  return true;
}

function getEnvBootstrapUsers() {
  const pass = process.env.DASHBOARD_ADMIN_PASS || process.env.API_KEY;
  if (!pass) return [];
  return [{ username: 'admin', passwordHash: hashPassword(pass), role: 'admin' }];
}

export async function getUsers() {
  const now = Date.now();
  if (cachedUsers && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedUsers;
  }

  try {
    const { runSSH } = await import('./ssh.js');
    const res = await runSSH('cat ~/.dashboard-users.json 2>/dev/null || echo "[]"', 8000);
    const rawText = typeof res === 'string' ? res : res?.stdout || '[]';
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedUsers = parsed.map((u) => ({
        username: u.username,
        ...(u.passwordHash ? { passwordHash: u.passwordHash } : { password: u.password }),
        role: u.role || (u.username === 'admin' ? 'admin' : 'operator'),
        createdAt: u.createdAt || null,
      }));
    } else {
      cachedUsers = getEnvBootstrapUsers();
    }
    lastFetchTime = now;
    return cachedUsers;
  } catch (_) {
    if (!cachedUsers) {
      cachedUsers = getEnvBootstrapUsers();
    }
    lastFetchTime = now - CACHE_TTL_MS + 15000;
    return cachedUsers;
  }
}

export async function saveUsers(users) {
  const hashedList = users.map((u) => ({
    username: u.username,
    passwordHash: u.passwordHash || hashPassword(u.password),
    role: u.role || 'operator',
    createdAt: u.createdAt || new Date().toISOString(),
  }));
  try {
    cachedUsers = hashedList;
    lastFetchTime = Date.now();
    const { runSSH } = await import('./ssh.js');
    const b64 = Buffer.from(JSON.stringify(hashedList, null, 2), 'utf-8').toString('base64');
    await runSSH(`echo '${b64}' | base64 -d > ~/.dashboard-users.json && chmod 600 ~/.dashboard-users.json`, 8000);
  } catch (e) {
    console.error('[Auth] Failed to save users');
    throw e;
  }
}

export function extractToken(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookies = parseCookies(request.headers.get('cookie'));
  if (cookies[SESSION_COOKIE_NAME]) {
    return { _cookie: cookies[SESSION_COOKIE_NAME] };
  }
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    if (queryToken) return queryToken;
  } catch (_) {}
  return null;
}

export async function validateToken(token) {
  if (!token) {
    throw new AuthError('Sessão inválida', 401);
  }

  if (typeof token === 'object' && token._cookie) {
    const verified = verifySessionCookieValue(token._cookie);
    if (!verified) {
      throw new AuthError('Sessão expirada ou inválida', 401);
    }
    return verified;
  }

  if (process.env.API_KEY && token.length === process.env.API_KEY.length) {
    const a = Buffer.from(token, 'utf-8');
    const b = Buffer.from(process.env.API_KEY, 'utf-8');
    if (crypto.timingSafeEqual(a, b)) {
      return { username: 'admin', role: 'admin' };
    }
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) {
      throw new AuthError('Token inválido', 401);
    }
    const username = decoded.slice(0, colonIndex);
    const password = decoded.slice(colonIndex + 1);

    if (!username || !password) {
      throw new AuthError('Token inválido', 401);
    }
    const users = await getUsers();
    const matchedUser = users.find((u) => u.username === username && verifyPassword(password, u));
    if (!matchedUser) {
      throw new AuthError('Credenciais inválidas ou expiradas', 401);
    }
    return { username: matchedUser.username, role: matchedUser.role || 'admin' };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('Sessão inválida', 401);
  }
}

export async function requireAuth(request) {
  const token = extractToken(request);
  if (!token) {
    throw new AuthError('Cabeçalho de autorização ausente', 401);
  }
  const user = await validateToken(token);
  const deviceId = getClientDeviceId(request);
  const deviceName = getClientDeviceName(request);
  const ip = getClientIp(request);
  let pathname = '/';
  try {
    pathname = new URL(request.url).pathname;
  } catch (_) {}

  await touchDeviceSession({
    deviceId,
    deviceName,
    username: user.username,
    ip,
    route: pathname,
  });

  return {
    ...user,
    deviceId,
    deviceName,
    ip,
  };
}
