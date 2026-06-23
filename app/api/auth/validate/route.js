import { validateToken, extractToken, getUsers, AuthError } from '@/lib/auth';

export async function POST(request) {
  try {
    // Check if the body contains username and password for a login attempt
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body may not be JSON or may be empty
    }

    if (body.username && body.password) {
      const users = getUsers();
      const user = users.find(u => u.username === body.username && u.password === body.password);
      
      if (!user) {
        return Response.json(
          { ok: false, error: 'Usuário ou senha incorretos' },
          { status: 401 }
        );
      }

      // Generate base64 token representing username:password credentials
      const token = Buffer.from(`${body.username}:${body.password}`).toString('base64');
      return Response.json({
        ok: true,
        token,
      });
    }

    // Otherwise, perform token validation
    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { ok: false, error: 'Cabeçalho de autorização ausente' },
        { status: 401 }
      );
    }

    validateToken(token);

    return Response.json({
      ok: true,
      valid: true,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json(
        { ok: false, error: err.message },
        { status: err.status }
      );
    }

    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
