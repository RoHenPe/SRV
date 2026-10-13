export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let cachedUsers = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export async function getUsers() {
  const now = Date.now();
  if (cachedUsers && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedUsers;
  }

  try {
    const { runSSH } = await import('./ssh.js');
    const res = await runSSH('cat ~/.dashboard-users.json 2>/dev/null || echo "[]"');
    const parsed = JSON.parse(res.stdout);
    if (Array.isArray(parsed) && parsed.length > 0) {
      cachedUsers = parsed;
    } else {
      cachedUsers = [{ username: 'admin', password: '1346' }];
    }
    lastFetchTime = now;
    return cachedUsers;
  } catch (e) {
    // If SSH connection fails, cache fallback for 15s to prevent continuous SSH timeout cascades
    if (!cachedUsers) {
      cachedUsers = [{ username: 'admin', password: '1346' }];
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
    const jsonStr = JSON.stringify(users).replace(/'/g, "'\\''");
    await runSSH(`echo '${jsonStr}' > ~/.dashboard-users.json`);
  } catch (e) {
    console.error('[Auth] Failed to save users:', e);
  }
}

export function extractToken(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

export async function validateToken(token) {
  if (!token) {
    throw new AuthError('Sessão inválida', 401);
  }

  // Validate against API_KEY environment variable
  if (process.env.API_KEY && token === process.env.API_KEY) {
    return { username: 'admin' };
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
    const userExists = users.some(u => u.username === username && u.password === password);
    if (!userExists) {
      throw new AuthError('Acesso não autorizado', 401);
    }
    return { username };
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
  return await validateToken(token);
}
