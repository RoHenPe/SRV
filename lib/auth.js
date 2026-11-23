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
const revokedUsers = new Map();
let sessionsLoaded = false;
let lastSessionsLoadedAt = 0;
let inFlightSessionsLoad = null;
const SESSIONS_RELOAD_TTL_MS = 15 * 1000;
let sessionSyncTimer = null;
let lastRemoteSyncAt = 0;
const MIN_REMOTE_SYNC_INTERVAL_MS = 30 * 1000;

function normalizeEnvSecret(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\\n|\\r/g, '').trim().replace(/^['"]|['"]$/g, '').trim();
}

function getSigningSecret() {
  return (
    normalizeEnvSecret(process.env.AUTH_SESSION_SECRET) ||
    normalizeEnvSecret(process.env.API_KEY) ||
    normalizeEnvSecret(process.env.SSH_PASSWORD) ||
    ''
  );
}

export function verifyBootstrapAdminCredentials(username, password) {
  if (username !== 'admin' || !password || typeof password !== 'string') return false;
  const adminPass = normalizeEnvSecret(process.env.DASHBOARD_ADMIN_PASS);
  const apiKey = normalizeEnvSecret(process.env.API_KEY);
  for (const candidate of [adminPass, apiKey]) {
    if (!candidate) continue;
    const a = Buffer.from(password, 'utf-8');
    const b = Buffer.from(candidate, 'utf-8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function createSessionToken(username, role = 'admin', deviceId = null) {
  const cookieVal = createSessionCookieValue(username, role, deviceId);
  return cookieVal ? `srv1.${cookieVal}` : null;
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

export function createSessionCookieValue(username, role = 'admin', deviceId = null) {
  const secret = getSigningSecret();
  if (!secret) return null;
  const body = {
    u: username,
    r: role,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 3600 * 1000,
  };
  if (deviceId && deviceId !== 'default-device') {
    body.did = String(deviceId).slice(0, 64);
  }
  const payload = Buffer.from(JSON.stringify(body), 'utf-8').toString('base64url');
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
    return {
      username: decoded.u,
      role: decoded.r || 'admin',
      tokenDeviceId: decoded.did || null,
      tokenIat: decoded.iat || 0,
    };
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

function applyLoadedSessionData(data, overwriteSessions = false) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.revoked)) {
    for (const id of data.revoked) {
      revokedSessions.add(id);
      sessionsMap.delete(id);
    }
  }
  if (data.revokedUsers && typeof data.revokedUsers === 'object') {
    for (const [uname, ts] of Object.entries(data.revokedUsers)) {
      const prevTs = revokedUsers.get(uname) || 0;
      const numTs = Number(ts) || 0;
      if (numTs > prevTs) revokedUsers.set(uname, numTs);
    }
  }
  if (Array.isArray(data.sessions)) {
    for (const s of data.sessions) {
      if (!s?.deviceId || revokedSessions.has(s.deviceId)) continue;
      if (overwriteSessions || !sessionsMap.has(s.deviceId)) {
        sessionsMap.set(s.deviceId, s);
      }
    }
  }
}

function buildSessionsPayloadJson() {
  const sanitizedSessions = Array.from(sessionsMap.values())
    .slice(-100)
    .map(({ ip: rawIp, userAgent: _ua, ...rest }) => ({
      ...rest,
      networkScope: rest.networkScope || describeNetworkScope(rawIp),
    }));
  const payload = {
    sessions: sanitizedSessions,
    revoked: Array.from(revokedSessions).slice(-200),
    revokedUsers: Object.fromEntries(Array.from(revokedUsers.entries()).slice(-100)),
  };
  return JSON.stringify(payload);
}

async function flushSessionsPersist(forceRemote = false) {
  const json = buildSessionsPayloadJson();
  try {
    await fs.writeFile(LOCAL_SESSIONS_FILE, json, 'utf-8');
  } catch (_) {}
  const now = Date.now();
  if (forceRemote || now - lastRemoteSyncAt >= MIN_REMOTE_SYNC_INTERVAL_MS) {
    lastRemoteSyncAt = now;
    try {
      const { runSSH } = await import('./ssh.js');
      const b64 = Buffer.from(json, 'utf-8').toString('base64');
      await runSSH(`echo '${b64}' | base64 -d > ~/.dashboard-sessions.json && chmod 600 ~/.dashboard-sessions.json`, 6000);
    } catch (_) {}
  }
}

async function loadLocalSessions(forceRefresh = false, { skipRemote = false } = {}) {
  const now = Date.now();
  const firstLoad = !sessionsLoaded;
  if (firstLoad) {
    try {
      const raw = await fs.readFile(LOCAL_SESSIONS_FILE, 'utf-8');
      applyLoadedSessionData(JSON.parse(raw), false);
    } catch (_) {}
  }

  if (skipRemote) {
    sessionsLoaded = true;
    return;
  }
  if (sessionsLoaded && !forceRefresh && now - lastSessionsLoadedAt < SESSIONS_RELOAD_TTL_MS) return;

  if (!inFlightSessionsLoad || forceRefresh) {
    inFlightSessionsLoad = (async () => {
      try {
        const { runSSH } = await import('./ssh.js');
        const rawRemote = await runSSH('cat ~/.dashboard-sessions.json 2>/dev/null || echo "{}"', 3500);
        const text = typeof rawRemote === 'string' ? rawRemote : rawRemote?.stdout || '{}';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        applyLoadedSessionData(JSON.parse(jsonMatch ? jsonMatch[0] : text), forceRefresh);
        sessionsLoaded = true;
        lastSessionsLoadedAt = Date.now();
      } catch (_) {
        sessionsLoaded = true;
        lastSessionsLoadedAt = Date.now();
      } finally {
        inFlightSessionsLoad = null;
      }
    })();
  }
  await inFlightSessionsLoad;
}

function scheduleSessionPersist(forceRemote = false) {
  if (sessionSyncTimer && !forceRemote) return;
  if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
  sessionSyncTimer = setTimeout(async () => {
    sessionSyncTimer = null;
    await flushSessionsPersist(forceRemote);
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
  tokenDeviceId = null,
  tokenIat = 0,
}) {
  await loadLocalSessions(false, { skipRemote: resetRevoked });

  const checkId = deviceId && deviceId !== 'default-device' ? deviceId : null;
  if (resetRevoked) {
    if (checkId) revokedSessions.delete(checkId);
  } else {
    if ((checkId && revokedSessions.has(checkId)) || (tokenDeviceId && revokedSessions.has(tokenDeviceId))) {
      throw new AuthError('Sessão deste dispositivo foi encerrada remotamente. Faça login novamente.', 401);
    }
    if (tokenIat && username) {
      const revokedBefore = revokedUsers.get(username) || 0;
      if (tokenIat <= revokedBefore) {
        throw new AuthError('Sessão inválida ou usuário atualizado. Faça login novamente.', 401);
      }
    }
  }

  const targetId = checkId || (tokenDeviceId && tokenDeviceId !== 'default-device' ? tokenDeviceId : null);
  if (!targetId) return null;

  const now = new Date().toISOString();
  const prev = sessionsMap.get(targetId) || {};
  const scope = describeNetworkScope(ip);
  const meaningfulChange =
    resetRevoked ||
    prev.deviceName !== (deviceName || prev.deviceName) ||
    prev.activeApp !== (activeApp !== undefined ? activeApp : prev.activeApp) ||
    !prev.createdAt;

  const updated = {
    deviceId: targetId,
    deviceName: deviceName || prev.deviceName || 'Dispositivo Web',
    username: username || prev.username || 'admin',
    networkScope: scope,
    createdAt: prev.createdAt || now,
    lastSeen: now,
    lastRoute: route || prev.lastRoute || '/',
    activeView: activeView !== undefined ? activeView : (prev.activeView || 'home'),
    activeApp: activeApp !== undefined ? activeApp : (prev.activeApp || null),
  };

  sessionsMap.set(targetId, updated);
  if (forcePersist || resetRevoked) {
    if (sessionSyncTimer) {
      clearTimeout(sessionSyncTimer);
      sessionSyncTimer = null;
    }
    await flushSessionsPersist(true);
  } else {
    scheduleSessionPersist(meaningfulChange);
  }
  return updated;
}

export async function getActiveSessions(forceRefresh = false) {
  await loadLocalSessions(forceRefresh);
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
  await loadLocalSessions(true);
  if (!deviceId) return false;
  revokedSessions.add(deviceId);
  sessionsMap.delete(deviceId);
  if (sessionSyncTimer) {
    clearTimeout(sessionSyncTimer);
    sessionSyncTimer = null;
  }
  await flushSessionsPersist(true);
  return true;
}

export async function revokeUserAccess(username) {
  await loadLocalSessions(true);
  if (!username) return false;
  const nowMs = Date.now();
  revokedUsers.set(username, nowMs);
  for (const [devId, s] of sessionsMap.entries()) {
    if (s?.username === username) {
      revokedSessions.add(devId);
      sessionsMap.delete(devId);
    }
  }
  if (sessionSyncTimer) {
    clearTimeout(sessionSyncTimer);
    sessionSyncTimer = null;
  }
  await flushSessionsPersist(true);
  return true;
}

function getEnvBootstrapUsers() {
  const pass = normalizeEnvSecret(process.env.DASHBOARD_ADMIN_PASS) || normalizeEnvSecret(process.env.API_KEY);
  if (!pass) return [];
  return [{ username: 'admin', passwordHash: hashPassword(pass), role: 'admin' }];
}

export async function getUsers(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedUsers && now - lastFetchTime < CACHE_TTL_MS) {
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

  if (typeof token === 'string' && token.startsWith('srv1.')) {
    const verified = verifySessionCookieValue(token.slice(5));
    if (!verified) {
      throw new AuthError('Sessão expirada ou inválida', 401);
    }
    return verified;
  }

  const apiKey = normalizeEnvSecret(process.env.API_KEY);
  if (apiKey && token.length === apiKey.length) {
    const a = Buffer.from(token, 'utf-8');
    const b = Buffer.from(apiKey, 'utf-8');
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
    if (verifyBootstrapAdminCredentials(username, password)) {
      return { username: 'admin', role: 'admin' };
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
    tokenDeviceId: user.tokenDeviceId || null,
    tokenIat: user.tokenIat || 0,
  });

  let resolvedRole = user.role || 'admin';
  if (user.username !== 'admin') {
    let users = await getUsers(false);
    let liveUser = users.find((u) => u.username === user.username);
    if (!liveUser) {
      users = await getUsers(true);
      liveUser = users.find((u) => u.username === user.username);
    }
    if (!liveUser) {
      throw new AuthError('Usuário removido ou acesso revogado.', 401);
    }
    resolvedRole = liveUser.role || 'operator';
  }

  return {
    ...user,
    role: resolvedRole,
    deviceId: deviceId !== 'default-device' ? deviceId : (user.tokenDeviceId || deviceId),
    deviceName,
    ip,
  };
}
