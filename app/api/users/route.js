import {
  requireAuth,
  getUsers,
  saveUsers,
  getActiveSessions,
  revokeDeviceSession,
  touchDeviceSession,
  hashPassword,
  AuthError,
} from '@/lib/auth';
import { logAction } from '@/lib/logger';
import { classifyError, recordErrorFlow } from '@/lib/errorFlow';
import { getClientIp, getClientDeviceId, getClientDeviceName } from '@/lib/rateLimit';
import { formatClientSafeError, describeNetworkScope } from '@/lib/sanitize';

async function handleUsersError(err, request, routeName) {
  const status = err instanceof AuthError ? err.status : 500;
  const deviceId = getClientDeviceId(request);
  const deviceName = getClientDeviceName(request);
  const clientIp = getClientIp(request);
  const diagnosis = classifyError(err, { route: routeName, deviceId, deviceName, clientIp });
  await recordErrorFlow({
    diagnosis,
    err,
    context: { route: routeName, deviceId, deviceName, clientIp },
    selfHealed: false,
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

export async function GET(request) {
  try {
    const caller = await requireAuth(request);
    const sessions = await getActiveSessions();
    const isAdmin = caller.role === 'admin';

    const sanitizedSessions = (isAdmin
      ? sessions
      : sessions.filter((s) => s.username === caller.username || s.deviceId === caller.deviceId)
    ).map(({ ip: rawIp, userAgent: _ua, ...rest }) => ({
      ...rest,
      networkScope: rest.networkScope || describeNetworkScope(rawIp),
    }));

    let safeUsers = [];
    if (isAdmin) {
      const users = await getUsers();
      safeUsers = users.map((u) => ({
        username: u.username,
        role: u.role || (u.username === 'admin' ? 'admin' : 'operator'),
        createdAt: u.createdAt || null,
        activeSessions: sessions.filter((s) => s.username === u.username && s.online).length,
      }));
    } else {
      safeUsers = [
        {
          username: caller.username,
          role: caller.role || 'operator',
          activeSessions: sanitizedSessions.filter((s) => s.online).length,
        },
      ];
    }

    return Response.json({
      ok: true,
      role: caller.role || 'operator',
      users: safeUsers,
      sessions: sanitizedSessions,
      currentDeviceId: caller.deviceId,
    });
  } catch (err) {
    return handleUsersError(err, request, 'GET /api/users');
  }
}

export async function POST(request) {
  try {
    const caller = await requireAuth(request);
    const body = await request.json();

    if (body.action === 'update_device') {
      const targetDevice = body.deviceId && caller.role === 'admin' ? body.deviceId : caller.deviceId;
      const updated = await touchDeviceSession({
        deviceId: targetDevice,
        deviceName: body.deviceName || caller.deviceName,
        username: caller.username,
        ip: caller.ip,
        activeView: body.activeView,
        activeApp: body.activeApp,
        forcePersist: true,
      });
      await logAction('session.update_device', 'success', {
        user: caller.username,
        deviceId: targetDevice,
        deviceName: body.deviceName,
      });
      return Response.json({ ok: true, session: updated });
    }

    if (caller.role !== 'admin') {
      return Response.json({ ok: false, error: 'Apenas administradores podem gerenciar usuários.' }, { status: 403 });
    }

    const { username, password, role } = body;
    if (!username || !password) {
      return Response.json({ ok: false, error: 'Usuário e senha são obrigatórios.' }, { status: 400 });
    }

    const cleanUsername = String(username).trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(cleanUsername)) {
      return Response.json(
        { ok: false, error: 'Nome de usuário inválido (use 2-32 caracteres alfanuméricos).' },
        { status: 400 }
      );
    }

    const validRole = role === 'admin' ? 'admin' : 'operator';
    const users = await getUsers();
    const existingIdx = users.findIndex((u) => u.username === cleanUsername);
    const isUpdate = existingIdx > -1;
    const passwordHash = hashPassword(password);

    if (isUpdate) {
      users[existingIdx] = {
        ...users[existingIdx],
        passwordHash,
        role: role ? validRole : users[existingIdx].role,
      };
      delete users[existingIdx].password;
    } else {
      users.push({
        username: cleanUsername,
        passwordHash,
        role: validRole,
        createdAt: new Date().toISOString(),
      });
    }

    await saveUsers(users);
    await logAction(isUpdate ? 'user.update' : 'user.create', 'success', {
      targetUser: cleanUsername,
      role: validRole,
      byUser: caller.username,
      deviceId: caller.deviceId,
    });
    return Response.json({ ok: true, updated: isUpdate });
  } catch (err) {
    return handleUsersError(err, request, 'POST /api/users');
  }
}

export async function DELETE(request) {
  try {
    const caller = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const username = searchParams.get('username');

    if (sessionId) {
      if (caller.role !== 'admin' && sessionId !== caller.deviceId) {
        const sessions = await getActiveSessions();
        const target = sessions.find((s) => s.deviceId === sessionId);
        if (!target || target.username !== caller.username) {
          return Response.json({ ok: false, error: 'Sem permissão para revogar esta sessão.' }, { status: 403 });
        }
      }
      await revokeDeviceSession(sessionId);
      await logAction('session.revoke', 'success', {
        revokedDeviceId: sessionId,
        byUser: caller.username,
        byDeviceId: caller.deviceId,
      });
      return Response.json({ ok: true, revokedSessionId: sessionId });
    }

    if (!username) {
      return Response.json({ ok: false, error: 'Parâmetro username ou sessionId é obrigatório.' }, { status: 400 });
    }

    if (caller.role !== 'admin') {
      return Response.json({ ok: false, error: 'Apenas administradores podem excluir usuários.' }, { status: 403 });
    }

    if (username === 'admin') {
      return Response.json({ ok: false, error: 'Não é possível excluir o usuário admin principal.' }, { status: 400 });
    }

    let users = await getUsers();
    users = users.filter((u) => u.username !== username);
    await saveUsers(users);
    await logAction('user.delete', 'success', {
      deletedUser: username,
      byUser: caller.username,
      deviceId: caller.deviceId,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return handleUsersError(err, request, 'DELETE /api/users');
  }
}
