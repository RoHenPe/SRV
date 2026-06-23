import { requireAuth, getUsers, saveUsers, AuthError } from '@/lib/auth';

export async function GET(request) {
  try {
    requireAuth(request);
    const users = getUsers();
    return Response.json({ ok: true, users });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    requireAuth(request);
    const { username, password } = await request.json();
    if (!username || !password) {
      return Response.json({ ok: false, error: 'Usuário e senha são obrigatórios' }, { status: 400 });
    }

    const users = getUsers();
    const existingIdx = users.findIndex(u => u.username === username);
    if (existingIdx > -1) {
      users[existingIdx].password = password;
    } else {
      users.push({ username, password });
    }

    saveUsers(users);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    requireAuth(request);
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    if (!username) {
      return Response.json({ ok: false, error: 'Usuário é obrigatório' }, { status: 400 });
    }

    if (username === 'admin') {
      return Response.json({ ok: false, error: 'Não é possível excluir o usuário admin principal' }, { status: 400 });
    }

    let users = getUsers();
    users = users.filter(u => u.username !== username);
    saveUsers(users);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ ok: false, error: err.message }, { status: err.status });
    }
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
