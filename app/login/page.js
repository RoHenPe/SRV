'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
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
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Invalid API key');
        setLoading(false);
        return;
      }

      localStorage.setItem('dashboard-token', apiKey);
      router.push('/');
    } catch (err) {
      setError('Connection error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-8 shadow-lg">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center">
              <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-2xl icon-filled">
                vpn_key
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-[var(--md-sys-color-on-surface)] mb-2 tracking-tight">
            Dashboard ROHENPER
          </h1>
          <p className="text-xs text-center text-[var(--md-sys-color-on-surface-variant)] mb-8">
            Controle remoto do servidor
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface)] mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole sua API Key"
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--md-sys-color-primary)] transition-all"
                disabled={loading}
                autoFocus
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
              disabled={loading || !apiKey.trim()}
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

          <div className="mt-6 pt-6 border-t border-[var(--md-sys-color-surface-variant)] text-center">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              API Key fornecida pelo administrador
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
