import { requireAuth, AuthError } from '@/lib/auth';

export async function GET(request) {
  try {
    await requireAuth(request);
    const env = {};
    for (const key in process.env) {
      const upperKey = key.toUpperCase();
      if (
        upperKey.includes('KEY') ||
        upperKey.includes('PASSWORD') ||
        upperKey.includes('SECRET') ||
        upperKey.includes('TOKEN') ||
        upperKey.includes('AUTH')
      ) {
        env[key] = '***';
      } else {
        env[key] = process.env[key];
      }
    }
    return Response.json({ ok: true, env });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
