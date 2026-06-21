export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
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
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error('API_KEY not configured');
  }
  if (!token || token !== apiKey) {
    throw new AuthError('Invalid API key', 401);
  }
  return token;
}

export function requireAuth(request) {
  const token = extractToken(request);
  if (!token) {
    throw new AuthError('Missing authorization header', 401);
  }
  validateToken(token);
}
