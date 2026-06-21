import { validateToken, extractToken, AuthError } from '@/lib/auth';

export async function POST(request) {
  try {
    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { ok: false, error: 'Missing authorization header' },
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
