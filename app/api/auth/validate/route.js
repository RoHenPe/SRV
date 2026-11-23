import crypto from 'crypto';
import {
  validateToken,
  extractToken,
  getUsers,
  verifyPassword,
  verifyBootstrapAdminCredentials,
  touchDeviceSession,
  createSessionCookieValue,
  createSessionToken,
  buildAuthCookieHeader,
  AuthError,
} from '@/lib/auth';
import { getClientIp, getClientDeviceId, getClientDeviceName, checkRateLimit } from '@/lib/rateLimit';
import { logAction, logRequest } from '@/lib/logger';
import { classifyError, recordErrorFlow } from '@/lib/errorFlow';
import { formatClientSafeError } from '@/lib/sanitize';

function isHttpsRequest(request) {
  const proto = request.headers?.get?.('x-forwarded-proto') || '';
  return proto.includes('https') || Boolean(process.env.VERCEL);
}

export async function POST(request) {
  const startTime = Date.now();
  const deviceId = getClientDeviceId(request);
  const deviceName = getClientDeviceName(request);
  const ip = getClientIp(request);
  const isHttps = isHttpsRequest(request);

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
      if (!checkRateLimit(request, 'LOGIN_PASSWORD_ATTEMPTS', { max: 20, windowMs: 60000, perIpOnly: true })) {
        return Response.json(
          { ok: false, error: 'Muitas tentativas de login deste endereço. Aguarde 1 minuto.' },
          { status: 429 }
        );
      }

      if (verifyBootstrapAdminCredentials(body.username, body.password)) {
        await touchDeviceSession({
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          username: 'admin',
          ip,
          route: '/api/auth/validate',
          resetRevoked: true,
          forcePersist: true,
        });
        await Promise.race([
          logAction('auth.login', 'success', {
            user: 'admin',
            deviceId: resolvedDeviceId,
            deviceName: resolvedDeviceName,
            ip,
          }).catch(() => {}),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
        const cookieVal = createSessionCookieValue('admin', 'admin', resolvedDeviceId);
        const sessionToken = createSessionToken('admin', 'admin', resolvedDeviceId);
        const headers = new Headers();
        if (cookieVal) {
          headers.set('Set-Cookie', buildAuthCookieHeader(cookieVal, isHttps, false));
        }
        return Response.json(
          {
            ok: true,
            token: sessionToken || process.env.API_KEY,
            username: 'admin',
            role: 'admin',
            deviceId: resolvedDeviceId,
          },
          { headers }
        );
      }

      const users = await getUsers(true);
      const user = users.find((u) => u.username === body.username && verifyPassword(body.password, u));

      if (!user) {
        await logAction('auth.login_failed', 'denied', {
          attemptedUser: String(body.username).slice(0, 32),
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          ip,
        });
        return Response.json({ ok: false, error: 'Usuário ou senha incorretos' }, { status: 401 });
      }

      const role = user.role || 'admin';
      const token =
        createSessionToken(user.username, role, resolvedDeviceId) ||
        Buffer.from(`${body.username}:${body.password}`).toString('base64');
      await touchDeviceSession({
        deviceId: resolvedDeviceId,
        deviceName: resolvedDeviceName,
        username: user.username,
        ip,
        route: '/api/auth/validate',
        resetRevoked: true,
        forcePersist: true,
      });

      await Promise.race([
        logAction('auth.login', 'success', {
          user: user.username,
          deviceId: resolvedDeviceId,
          deviceName: resolvedDeviceName,
          ip,
        }).catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);

      const cookieVal = createSessionCookieValue(user.username, role, resolvedDeviceId);
      const headers = new Headers();
      if (cookieVal) {
        headers.set('Set-Cookie', buildAuthCookieHeader(cookieVal, isHttps, false));
      }

      return Response.json(
        {
          ok: true,
          token,
          username: user.username,
          role,
          deviceId: resolvedDeviceId,
        },
        { headers }
      );
    }

    const token = extractToken(request);
    if (!token) {
      return Response.json({ ok: false, error: 'Cabeçalho de autorização ausente' }, { status: 401 });
    }

    const user = await validateToken(token);
    await touchDeviceSession({
      deviceId: resolvedDeviceId,
      deviceName: resolvedDeviceName,
      username: user.username,
      ip,
      route: '/api/auth/validate',
      activeView: body.activeView,
      activeApp: body.activeApp,
      tokenDeviceId: user.tokenDeviceId || null,
      tokenIat: user.tokenIat || 0,
    });

    let role = user.role || 'admin';
    if (user.username !== 'admin') {
      const liveUsers = await getUsers();
      const liveUser = liveUsers.find((u) => u.username === user.username);
      if (!liveUser) {
        throw new AuthError('Usuário removido ou acesso revogado.', 401);
      }
      role = liveUser.role || 'operator';
    }

    const cookieVal = createSessionCookieValue(
      user.username,
      role,
      resolvedDeviceId !== 'default-device' ? resolvedDeviceId : user.tokenDeviceId || null
    );
    const headers = new Headers();
    if (cookieVal) {
      headers.set('Set-Cookie', buildAuthCookieHeader(cookieVal, isHttps, false));
    }

    return Response.json(
      {
        ok: true,
        valid: true,
        username: user.username,
        role,
        deviceId: resolvedDeviceId,
      },
      { headers }
    );
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
      {
        ok: false,
        error: formatClientSafeError(err, diagnosis),
        errorId: diagnosis.errorId,
        category: diagnosis.category,
      },
      { status }
    );
  }
}

export async function DELETE(request) {
  const isHttps = isHttpsRequest(request);
  const headers = new Headers();
  headers.set('Set-Cookie', buildAuthCookieHeader('', isHttps, true));
  return Response.json({ ok: true, loggedOut: true }, { headers });
}
