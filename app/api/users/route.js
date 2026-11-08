import { requireAuth, getUsers, saveUsers, getActiveSessions, revokeDeviceSession, touchDeviceSession, AuthError } from '@/lib/auth';
import { logAction } from '@/lib/logger';

export async function GET(request) {
  try {
    const caller = await requireAuth(request);
    const users = await getUsers();
    const sessions = await getActiveSessions();
    const safeUsers = users.map((u) => ({
      username: u.username,
      role: u.role || (u.username === 'admin' ? 'admin' : 'operator'),
      createdAt: u.createdAt || null,
      activeSessions: sessions.filter((s) => s.username === u.username && s.online).length,
    }));
    return Response.json({
      ok: true,
      users: safeUsers,
      sessions,
      currentDeviceId: caller.deviceId,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const caller = await requireAuth(request);
    const body = await request.json();

    // Atualização de nome/metadados do dispositivo atual
    if (body.action === 'update_device') {
      const targetDevice = body.deviceId || caller.deviceId;
      const updated = await touchDeviceSession({
        deviceId: targetDevice,
        deviceName: body.deviceName || caller.deviceName,
        username: caller.username,
        ip: caller.ip,
        activeView: body.activeView,
        activeApp: body.activeApp,
      });
      await logAction('session.update_device', 'success', {
        user: caller.username,
        deviceId: targetDevice,
        deviceName: body.deviceName,
      });
      return Response.json({ ok: true, session: updated });
    }

    const { username, password, role } = body;
    if (caller.role && caller.role !== 'admin') {
      return Response.json({ ok: false, error: 'Apenas administradores podem gerenciar usuários' }, { status: 403 });
    }
    if (!username || !password) {
      return Response.json({ ok: false, error: 'Usuário e senha são obrigatórios' }, { status: 400 });
    }

    const cleanUsername = String(username).trim();
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(cleanUsername)) {
      return Response.json({ ok: false, error: 'Nome de usuário inválido (use 2-32 caracteres alfanuméricos)' }, { status: 400 });
    }

    const users = await getUsers();
    const existingIdx = users.findIndex((u) => u.username === cleanUsername);
    const isUpdate = existingIdx > -1;
    if (isUpdate) {
      users[existingIdx].password = password;
      if (role) users[existingIdx].role = role;
    } else {
      users.push({
        username: cleanUsername,
        password,
        role: role || 'operator',
        createdAt: new Date().toISOString(),
      });
    }

    await saveUsers(users);
    await logAction(isUpdate ? 'user.update' : 'user.create', 'success', {
      targetUser: cleanUsername,
      role: role || 'operator',
      byUser: caller.username,
      deviceId: caller.deviceId,
    });
    return Response.json({ ok: true, updated: isUpdate });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const caller = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const username = searchParams.get('username');

    if (sessionId) {
      await revokeDeviceSession(sessionId);
      await logAction('session.revoke', 'success', {
        revokedDeviceId: sessionId,
        byUser: caller.username,
        byDeviceId: caller.deviceId,
      });
      return Response.json({ ok: true, revokedSessionId: sessionId });
    }

    if (!username) {
      return Response.json({ ok: false, error: 'Parâmetro username ou sessionId é obrigatório' }, { status: 400 });
    }

    if (caller.role && caller.role !== 'admin') {
      return Response.json({ ok: false, error: 'Apenas administradores podem excluir usuários' }, { status: 403 });
    }

    if (username === 'admin') {
      return Response.json({ ok: false, error: 'Não é possível excluir o usuário admin principal' }, { status: 400 });
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
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
