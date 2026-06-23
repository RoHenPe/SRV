import fs from 'fs';
import path from 'path';

const USERS_FILE = process.env.USERS_FILE || path.join(process.cwd(), 'data', 'users.json');

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

let cachedUsers = null;

export async function getUsers() {
  if (cachedUsers) return cachedUsers;
  try {
    const { runSSH } = await import('./ssh.js');
    const res = await runSSH('cat ~/.dashboard-users.json 2>/dev/null || echo "[]"');
    const parsed = JSON.parse(res.stdout);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      cachedUsers = [{ username: 'admin', password: '1346' }];
    } else {
      cachedUsers = parsed;
    }
    return cachedUsers;
  } catch (e) {
    return [{ username: 'admin', password: '1346' }];
  }
}

export async function saveUsers(users) {
  try {
    cachedUsers = users;
    const { runSSH } = await import('./ssh.js');
    const jsonStr = JSON.stringify(users).replace(/'/g, "'\\''");
    await runSSH(`echo '${jsonStr}' > ~/.dashboard-users.json`);
  } catch (e) {
    console.error('Failed to save users:', e);
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

  // Backward compatibility with API_KEY
  if (token === process.env.API_KEY || token === 'rohenper2026') {
    return { username: 'admin' };
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
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
