'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOrInitDeviceIdentity } from '../hooks/useApi';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const identity = getOrInitDeviceIdentity();
    setDeviceId(identity.deviceId);
    setDeviceName(identity.deviceName);
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanDeviceName = deviceName.trim() || 'Dispositivo Web';
      if (typeof window !== 'undefined') {
        localStorage.setItem('srv-device-name', cleanDeviceName);
      }

      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId || 'default-device',
          'x-device-name': cleanDeviceName,
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          deviceId: deviceId || 'default-device',
          deviceName: cleanDeviceName,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Usuário ou senha inválidos');
        setLoading(false);
        return;
      }

      localStorage.setItem('dashboard-token', data.token);
      localStorage.setItem('srv-username', data.username || username.trim());
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

          <h1 className="text-xl font-bold text-center text-[var(--md-sys-color-on-surface)] mb-1 tracking-tight google-sans">
            Autenticação de Sistema
          </h1>
          <p className="text-xs text-center text-[var(--md-sys-color-on-surface-variant)] mb-6">
            Sessão isolada por dispositivo
          </p>

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Usuário
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--md-sys-color-primary)] border border-transparent transition-all"
                disabled={loading}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--md-sys-color-primary)] border border-transparent transition-all"
                disabled={loading}
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Identificação deste Dispositivo
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Ex: Workstation Principal, Celular, Notebook"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2.5 text-xs outline-none focus:border-[var(--md-sys-color-primary)] border border-transparent transition-all"
                disabled={loading}
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
                  Autenticando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">
                    login
                  </span>
                  Iniciar Sessão
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
