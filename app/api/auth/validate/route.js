import { validateToken, extractToken, getUsers, touchDeviceSession, AuthError } from '@/lib/auth';
import { getClientIp, getClientDeviceId, getClientDeviceName, checkRateLimit } from '@/lib/rateLimit';
import { logAction, logRequest } from '@/lib/logger';
import { classifyError, recordErrorFlow } from '@/lib/errorFlow';

export async function POST(request) {
  const startTime = Date.now();
  const deviceId = getClientDeviceId(request);
  const deviceName = getClientDeviceName(request);
  const ip = getClientIp(request);
  const userAgent = request.headers?.get?.('user-agent') || '';

  try {
    if (!checkRateLimit(request, 'POST /api/auth/validate')) {
      return Response.json(
        { ok: false, error: 'Muitas tentativas de autenticação. Aguarde alguns segundos.' },
        { status: 429 }
      );
    }
    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const resolvedDeviceId = body.deviceId || deviceId;
    const resolvedDeviceName = body.deviceName || deviceName;

    if (body.username && body.password) {
      if (process.env.API_KEY && (body.password === process.env.API_KEY || body.username === process.env.API_KEY)) {
        await touchDeviceSession({
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          username: 'admin',
          ip,
          userAgent,
          route: '/api/auth/validate',
          resetRevoked: true,
        });
        await logAction('auth.login', 'success', {
          user: 'admin',
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          ip,
        });
        return Response.json({
          ok: true,
          token: process.env.API_KEY,
          username: 'admin',
          role: 'admin',
          deviceId: resolvedDeviceId,
        });
      }

      const users = await getUsers();
      const user = users.find((u) => u.username === body.username && u.password === body.password);

      if (!user) {
        await logAction('auth.login_failed', 'denied', {
          attemptedUser: body.username,
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          ip,
        });
        return Response.json(
          { ok: false, error: 'Usuário ou senha incorretos' },
          { status: 401 }
        );
      }

      const token = Buffer.from(`${body.username}:${body.password}`).toString('base64');
      await touchDeviceSession({
        deviceId: resolvedDeviceId,
        deviceName: resolvedDeviceName,
        username: user.username,
        ip,
        userAgent,
        route: '/api/auth/validate',
        resetRevoked: true,
      });

      await logAction('auth.login', 'success', {
        user: user.username,
        deviceId: resolvedDeviceId,
        deviceName: resolvedDeviceName,
        ip,
      });

      return Response.json({
        ok: true,
        token,
        username: user.username,
        role: user.role || 'admin',
        deviceId: resolvedDeviceId,
      });
    }

    const token = extractToken(request);
    if (!token) {
      return Response.json(
        { ok: false, error: 'Cabeçalho de autorização ausente' },
        { status: 401 }
      );
    }

    const user = await validateToken(token);
    await touchDeviceSession({
      deviceId: resolvedDeviceId,
      deviceName: resolvedDeviceName,
      username: user.username,
      ip,
      userAgent,
      route: '/api/auth/validate',
      activeView: body.activeView,
      activeApp: body.activeApp,
    });

    return Response.json({
      ok: true,
      valid: true,
      username: user.username,
      role: user.role || 'admin',
      deviceId: resolvedDeviceId,
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const status = err instanceof AuthError ? err.status : 500;
    const diagnosis = classifyError(err, {
      route: 'POST /api/auth/validate',
      username: 'anonymous',
      deviceId,
      deviceName,
      clientIp: ip,
      responseTime,
    });
    await recordErrorFlow({
      diagnosis,
      err,
      context: {
        route: 'POST /api/auth/validate',
        username: 'anonymous',
        deviceId,
        deviceName,
        clientIp: ip,
        responseTime,
      },
      selfHealed: false,
    });
    await logRequest('POST', '/api/auth/validate', 'anonymous', status, responseTime, err, {
      errorId: diagnosis.errorId,
      category: diagnosis.category,
      deviceId,
      deviceName,
      ip,
    });
    return Response.json(
      { ok: false, error: err.message, errorId: diagnosis.errorId, category: diagnosis.category },
      { status }
    );
  }
}
