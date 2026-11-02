import { promises as fs } from 'fs';
import { getClientIp, getClientDeviceId, getClientDeviceName } from './rateLimit.js';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let cachedUsers = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000;
const LOCAL_SESSIONS_FILE = '/tmp/dashboard-sessions.json';

// Mapa de sessões por deviceId
const sessionsMap = new Map();
const revokedSessions = new Set();
let sessionsLoaded = false;
let sessionSyncTimer = null;

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

function scheduleSessionPersist() {
  if (sessionSyncTimer) return;
  sessionSyncTimer = setTimeout(async () => {
    sessionSyncTimer = null;
    const payload = {
      sessions: Array.from(sessionsMap.values()).slice(-100),
      revoked: Array.from(revokedSessions).slice(-200),
    };
    const json = JSON.stringify(payload);
    try {
      await fs.writeFile(LOCAL_SESSIONS_FILE, json, 'utf-8');
    } catch (_) {}
    try {
      const { runSSH } = await import('./ssh.js');
      const b64 = Buffer.from(json, 'utf-8').toString('base64');
      await runSSH(`echo '${b64}' | base64 -d > ~/.dashboard-sessions.json`, 6000);
    } catch (_) {}
  }, 2500);
}

export async function touchDeviceSession({
  deviceId,
  deviceName,
  username,
  ip,
  userAgent,
  route,
  activeView,
  activeApp,
  resetRevoked = false,
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
  const updated = {
    deviceId,
    deviceName: deviceName || prev.deviceName || 'Dispositivo Web',
    username: username || prev.username || 'admin',
    ip: ip || prev.ip || 'unknown',
    userAgent: userAgent || prev.userAgent || '',
    createdAt: prev.createdAt || now,
    lastSeen: now,
    lastRoute: route || prev.lastRoute || '/',
    activeView: activeView !== undefined ? activeView : (prev.activeView || 'home'),
    activeApp: activeApp !== undefined ? activeApp : (prev.activeApp || null),
  };

  sessionsMap.set(deviceId, updated);
  scheduleSessionPersist();
  return updated;
}

export async function getActiveSessions() {
  await loadLocalSessions();
  const nowMs = Date.now();
  const list = Array.from(sessionsMap.values())
    .filter((s) => !revokedSessions.has(s.deviceId))
    .map((s) => {
      const lastMs = Date.parse(s.lastSeen || s.createdAt || 0) || 0;
      const ageSec = Math.max(0, Math.round((nowMs - lastMs) / 1000));
      return {
        ...s,
        online: ageSec < 120,
        idleSeconds: ageSec,
      };
    })
    .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));
  return list;
}

export async function revokeDeviceSession(deviceId) {
  await loadLocalSessions();
  if (!deviceId) return false;
  revokedSessions.add(deviceId);
  sessionsMap.delete(deviceId);
  scheduleSessionPersist();
  return true;
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
        password: u.password,
        role: u.role || (u.username === 'admin' ? 'admin' : 'operator'),
        createdAt: u.createdAt || null,
      }));
    } else {
      cachedUsers = [{ username: 'admin', password: '1346', role: 'admin' }];
    }
    lastFetchTime = now;
    return cachedUsers;
  } catch (e) {
    if (!cachedUsers) {
      cachedUsers = [{ username: 'admin', password: '1346', role: 'admin' }];
    }
    lastFetchTime = now - CACHE_TTL_MS + 15000;
    return cachedUsers;
  }
}

export async function saveUsers(users) {
  try {
    cachedUsers = users;
    lastFetchTime = Date.now();
    const { runSSH } = await import('./ssh.js');
    const b64 = Buffer.from(JSON.stringify(users, null, 2), 'utf-8').toString('base64');
    await runSSH(`echo '${b64}' | base64 -d > ~/.dashboard-users.json`, 8000);
  } catch (e) {
    console.error('[Auth] Failed to save users:', e);
    throw e;
  }
}

export function extractToken(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
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

  if (process.env.API_KEY && token === process.env.API_KEY) {
    return { username: 'admin', role: 'admin' };
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
    const matchedUser = users.find((u) => u.username === username && u.password === password);
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
  const userAgent = request.headers?.get?.('user-agent') || '';
  let pathname = '/';
  try {
    pathname = new URL(request.url).pathname;
  } catch (_) {}

  await touchDeviceSession({
    deviceId,
    deviceName,
    username: user.username,
    ip,
    userAgent,
    route: pathname,
  });

  return {
    ...user,
    deviceId,
    deviceName,
    ip,
  };
}
