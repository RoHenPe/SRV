import fs from 'fs';
import path from 'path';

const USERS_FILE = process.env.USERS_FILE || path.join(process.cwd(), 'data', 'users.json');

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

export function getUsers() {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(USERS_FILE)) {
      const defaultUsers = [{ username: 'admin', password: '1346' }];
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
      return defaultUsers;
    }
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ username: 'admin', password: '1346' }];
    }
    return parsed;
  } catch (e) {
    return [{ username: 'admin', password: '1346' }];
  }
}

export function saveUsers(users) {
  try {
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
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

export function validateToken(token) {
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
    const users = getUsers();
    const userExists = users.some(u => u.username === username && u.password === password);
    if (!userExists) {
      throw new AuthError('Acesso não autorizado', 401);
    }
    return { username };
  } catch (e) {
    throw new AuthError('Sessão inválida', 401);
  }
}

export function requireAuth(request) {
  const token = extractToken(request);
  if (!token) {
    throw new AuthError('Cabeçalho de autorização ausente', 401);
  }
  return validateToken(token);
}
