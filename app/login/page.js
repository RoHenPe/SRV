'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Usuário ou senha inválidos');
        setLoading(false);
        return;
      }

      localStorage.setItem('dashboard-token', data.token);
      router.push('/');
    } catch (err) {
      setError('Erro de conexão. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-8">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center">
              <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-2xl icon-filled">
                vpn_key
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-[var(--md-sys-color-on-surface)] mb-6 tracking-tight google-sans">
            Acesso ao Painel
          </h1>

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuário"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--md-sys-color-primary)] border border-transparent transition-all"
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--md-sys-color-primary)] border border-transparent transition-all"
                disabled={loading}
                required
              />
            </div>

            {error && (
              <div className="bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] rounded-xl p-3 text-xs flex items-start gap-2">
                <span className="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">
                  error
                </span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full bg-[var(--md-sys-color-primary)] text-white font-medium py-3 px-4 rounded-xl transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">
                    autorenew
                  </span>
                  Entrando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">
                    login
                  </span>
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
