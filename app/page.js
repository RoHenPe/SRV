'use client';
import { useState, useEffect, useCallback } from 'react';
import ConfirmModal from './components/ConfirmModal';
import OutputPanel from './components/OutputPanel';

// ─── Uptime & System info parser ──────────────────────────────────────────────
function parseUptime(output) {
  if (!output) return null;
  const lines = output.split('\n');
  if (lines.length < 2) return null;
  const uptimeLine = lines[1];
  
  const upIndex = uptimeLine.indexOf('up');
  if (upIndex === -1) return null;
  
  const fromUp = uptimeLine.substring(upIndex + 3);
  const commaIndex = fromUp.indexOf(',');
  const uptimeStr = commaIndex !== -1 ? fromUp.substring(0, commaIndex).trim() : fromUp.trim();
  
  const loadIndex = uptimeLine.indexOf('load average:');
  const loadStr = loadIndex !== -1 ? uptimeLine.substring(loadIndex + 13).trim() : null;
  
  return {
    uptime: uptimeStr,
    load: loadStr,
  };
}

async function apiFetch(url, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('dashboard-token') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dashboard-token');
      window.location.href = '/login';
    }
  }

  return res.json();
}

// ─── Componentes Comuns Refatorados ────────────────────────────────────────────

function Card({ children, className = '', view }) {
  const isList = view === 'list';
  const layoutClass = isList 
    ? 'flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4' 
    : 'flex-col p-5';
  
  return (
    <div className={`mat-card ${layoutClass} ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, color = 'blue', density }) {
  const colors = {
    blue: 'text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]',
    red: 'text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)]',
    purple: 'text-[#6750A4] bg-[#EADDFF]', 
    green: 'text-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)]',
    orange: 'text-[var(--md-sys-color-warning)] bg-[var(--md-sys-color-warning-container)]',
    cyan: 'text-[#006874] bg-[#97F0FF]', 
  };
  
  const isCompact = density === 'compact';
  
  return (
    <div className="flex items-center gap-3">
      <div className={`rounded-xl flex items-center justify-center flex-shrink-0 ${
        isCompact ? 'w-8 h-8' : 'w-10 h-10'
      } ${colors[color]}`}>
        <span className={`material-symbols-outlined icon-filled ${isCompact ? 'text-lg' : 'text-xl'}`}>{icon}</span>
      </div>
      <h2 className={`font-semibold tracking-tight google-sans text-[var(--md-sys-color-on-surface)] ${
        isCompact ? 'text-sm' : 'text-base'
      }`}>{title}</h2>
    </div>
  );
}

function ActionButton({ label, icon, onClick, variant = 'primary', loading = false, disabled = false, density }) {
  const variants = {
    primary: 'btn-primary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  
  const isCompact = density === 'compact';
  const paddingClass = isCompact 
    ? 'py-1.5 px-3 rounded-lg text-xs gap-1.5 h-8' 
    : 'py-2.5 px-5 rounded-xl text-sm gap-2 h-11';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${variants[variant]} ${paddingClass} flex items-center justify-center font-medium flex-1 min-w-0 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading ? (
        <span className={`material-symbols-outlined animate-spin ${isCompact ? 'text-[14px]' : 'text-[18px]'}`}>autorenew</span>
      ) : (
        <span className={`material-symbols-outlined ${isCompact ? 'text-[16px]' : 'text-[18px]'}`}>{icon}</span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Toast Notification & Hook ───────────────────────────────────────────────

function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3 rounded-xl shadow-lg animate-fade-in ${
            t.type === 'error'
              ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
              : t.type === 'success'
              ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]'
              : 'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined icon-filled text-[18px] flex-shrink-0 mt-0.5">
            {t.type === 'error' ? 'error' : t.type === 'success' ? 'check_circle' : 'info'}
          </span>
          <span className="flex-1 font-medium text-xs">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 5000);
  }, []);
  const removeToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  return { toasts, addToast, removeToast };
}

// ─── SEÇÕES DO DASHBOARD ──────────────────────────────────────────────────────

function PowerCard({ addToast, view, density }) {
  const [confirm, setConfirm] = useState(null);
  const [loading, setLoading] = useState(null);

  async function execute(action) {
    setLoading(action);
    setConfirm(null);
    try {
      const data = await apiFetch(`/api/power/${action}`, { method: 'POST' });
      if (data.ok) addToast(data.message, 'success');
      else addToast(data.error, 'error');
    } catch {
      addToast('Erro ao conectar.', 'error');
    }
    setLoading(null);
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-row gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="power_settings_new" title="Energia" color="red" density={density} />
        <div className={buttonsClass}>
          <ActionButton
            label="Reiniciar"
            icon="restart_alt"
            variant="danger"
            density={density}
            loading={loading === 'reboot'}
            onClick={() => setConfirm('reboot')}
          />
          <ActionButton
            label="Desligar"
            icon="power_off"
            variant="danger"
            density={density}
            loading={loading === 'shutdown'}
            onClick={() => setConfirm('shutdown')}
          />
        </div>
      </Card>

      <ConfirmModal
        isOpen={confirm === 'reboot'}
        title="Reiniciar"
        message="Deseja reiniciar o servidor?"
        onConfirm={() => execute('reboot')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        isOpen={confirm === 'shutdown'}
        title="Desligar"
        message="Deseja desligar o servidor?"
        onConfirm={() => execute('shutdown')}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function DockerCard({ addToast, view, density }) {
  const [panel, setPanel] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');
  const [stopModal, setStopModal] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [containers, setContainers] = useState([]);

  async function fetchData(endpoint, title) {
    setLoading(true);
    setPanelTitle(title);
    setPanel(true);
    try {
      const data = await apiFetch(`/api/docker/${endpoint}`);
      if (endpoint === 'ps' || endpoint === 'all') {
        setContainers(data.containers || []);
        setOutput('');
      } else if (endpoint === 'images') {
        const lines = (data.images || [])
          .map((i) => `${i.Repository}:${i.Tag} | ${i.Size}`)
          .join('\n');
        setOutput(lines || 'Sem imagens.');
        setContainers([]);
      }
    } catch {
      setOutput('Erro ao carregar dados.');
    }
    setLoading(false);
  }

  async function restartDocker() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/docker/restart-service', { method: 'POST' });
      addToast(data.ok ? 'Docker reiniciado!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      addToast('Erro ao reiniciar.', 'error');
    }
    setLoading(false);
  }

  async function stopContainer() {
    if (!containerName.trim()) return;
    setLoading(true);
    setStopModal(false);
    try {
      const data = await apiFetch('/api/docker/stop', {
        method: 'POST',
        body: JSON.stringify({ name: containerName.trim() }),
      });
      addToast(data.ok ? 'Container parado!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      addToast('Erro ao parar.', 'error');
    }
    setLoading(false);
    setContainerName('');
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="view_in_ar" title="Docker" color="blue" density={density} />
        <div className={buttonsClass}>
          <div className={`flex gap-2 ${view === 'list' ? 'contents' : 'w-full'}`}>
            <ActionButton label="Ativos" icon="play_circle" density={density} onClick={() => fetchData('ps', 'docker ps')} loading={loading} />
            <ActionButton label="Todos" icon="list" variant="ghost" density={density} onClick={() => fetchData('all', 'docker ps -a')} loading={loading} />
          </div>
          <div className={`flex gap-2 ${view === 'list' ? 'contents' : 'w-full'}`}>
            <ActionButton label="Imagens" icon="layers" variant="ghost" density={density} onClick={() => fetchData('images', 'docker images')} />
            <ActionButton label="Parar" icon="stop_circle" variant="danger" density={density} onClick={() => setStopModal(true)} />
          </div>
          <ActionButton label="Reiniciar" icon="restart_alt" variant="ghost" density={density} onClick={restartDocker} loading={loading} />
        </div>
      </Card>

      {stopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setStopModal(false)} />
          <div className="relative bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] shadow-[var(--md-elevation-3)] rounded-2xl p-5 w-full max-w-sm animate-fade-in">
            <h3 className="text-lg font-medium google-sans mb-3 text-[var(--md-sys-color-on-surface)]">Parar Container</h3>
            <input
              className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] transition-all mb-4"
              placeholder="Nome ou ID"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && stopContainer()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setStopModal(false)} className="px-4 py-2 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-black/5 rounded-full transition-colors">Cancelar</button>
              <button onClick={stopContainer} className="px-4 py-2 text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 rounded-full transition-colors">Parar</button>
            </div>
          </div>
        </div>
      )}

      {panel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setPanel(false)} />
          <div className="relative w-full sm:max-w-2xl bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-t-2xl sm:rounded-2xl shadow-[var(--md-elevation-3)] flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--md-sys-color-surface-variant)]">
              <span className="text-xs font-mono text-[var(--md-sys-color-on-surface-variant)]">{panelTitle}</span>
              <button onClick={() => setPanel(false)} className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors text-[var(--md-sys-color-on-surface-variant)]">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-[var(--md-sys-color-background)] rounded-b-2xl flex-1">
              {loading ? (
                <div className="flex items-center gap-2 text-[var(--md-sys-color-primary)] font-medium text-xs">
                  <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
                  Carregando...
                </div>
              ) : containers.length > 0 ? (
                <div className="bg-[var(--md-sys-color-surface)] rounded-xl border border-[var(--md-sys-color-surface-variant)] overflow-hidden shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                        <th className="text-left py-2 px-3 font-semibold">Nome</th>
                        <th className="text-left py-2 px-3 font-semibold">Status</th>
                        <th className="text-left py-2 px-3 font-semibold hidden sm:table-cell">Portas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c, i) => (
                        <tr key={i} className="border-b border-[var(--md-sys-color-surface-variant)] last:border-0 hover:bg-[var(--md-sys-color-surface-variant)] transition-colors">
                          <td className="py-2 px-3 font-mono text-[var(--md-sys-color-on-surface)]">{c.Names}</td>
                          <td className={`py-2 px-3 font-semibold ${c.Status?.includes('Up') ? 'text-green-600' : 'text-red-600'}`}>
                            {c.Status}
                          </td>
                          <td className="py-2 px-3 hidden sm:table-cell text-[var(--md-sys-color-on-surface-variant)] font-mono text-[10px]">{c.Ports || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="text-[var(--md-sys-color-on-surface)] font-mono text-xs whitespace-pre-wrap">{output || 'Sem dados.'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SandboxCard({ addToast, view, density }) {
  const [loading, setLoading] = useState(null);

  async function launch(service) {
    setLoading(service);
    try {
      const data = await apiFetch(`/api/sandbox/${service}`, { method: 'POST' });
      if (data.ok) {
        addToast(data.message, 'success');
        if (data.url) setTimeout(() => window.open(data.url, '_blank'), 5000);
      } else {
        addToast(data.error, 'error');
      }
    } catch {
      addToast('Erro ao iniciar.', 'error');
    }
    setLoading(null);
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <Card view={view}>
      <CardHeader icon="science" title="Sandbox" color="purple" density={density} />
      <div className={buttonsClass}>
        <ActionButton label="VS Code" icon="code" density={density} onClick={() => launch('vscode')} loading={loading === 'vscode'} />
        <ActionButton label="Webtop" icon="desktop_windows" variant="ghost" density={density} onClick={() => launch('webtop')} loading={loading === 'webtop'} />
        <ActionButton label="Steam" icon="sports_esports" variant="ghost" density={density} onClick={() => launch('steam')} loading={loading === 'steam'} />
      </div>
    </Card>
  );
}

function IaHubCard({ addToast, view, density }) {
  const [panel, setPanel] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pullModal, setPullModal] = useState(false);
  const [modelName, setModelName] = useState('');

  async function fetchOutput(url, title) {
    setPanelTitle(title);
    setPanel(true);
    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch(url);
      setOutput(data.output || 'Sem saída.');
    } catch {
      setOutput('Erro ao carregar.');
    }
    setLoading(false);
  }

  async function pullModel() {
    if (!modelName.trim()) return;
    setPullModal(false);
    setLoading(true);
    setPanelTitle(`ollama pull ${modelName}`);
    setPanel(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/ia/pull', {
        method: 'POST',
        body: JSON.stringify({ model: modelName }),
      });
      setOutput(data.output || data.message || 'Concluído.');
      addToast(data.ok ? `Modelo "${modelName}" carregado!` : data.error, data.ok ? 'success' : 'error');
    } catch {
      setOutput('Erro de download.');
    }
    setLoading(false);
    setModelName('');
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="psychology" title="IA Hub" color="purple" density={density} />
        <div className={buttonsClass}>
          <ActionButton label="Status" icon="monitoring" density={density} onClick={() => fetchOutput('/api/ia/status', 'ollama status')} loading={loading} />
          <ActionButton label="Modelos" icon="list" variant="ghost" density={density} onClick={() => fetchOutput('/api/ia/models', 'ollama list')} loading={loading} />
          <ActionButton label="Baixar" icon="download" variant="ghost" density={density} onClick={() => setPullModal(true)} />
        </div>
      </Card>

      {pullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setPullModal(false)} />
          <div className="relative bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] shadow-[var(--md-elevation-3)] rounded-2xl p-5 w-full max-w-sm animate-fade-in">
            <h3 className="text-lg font-medium google-sans mb-3 text-[var(--md-sys-color-on-surface)]">Pull de Modelo</h3>
            <input
              className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--md-sys-color-primary)] transition-all mb-4"
              placeholder="ex: llama3, gemma2"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pullModel()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPullModal(false)} className="px-4 py-2 text-xs font-medium text-[var(--md-sys-color-primary)] hover:bg-black/5 rounded-full transition-colors">Cancelar</button>
              <button onClick={pullModel} className="px-4 py-2 text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 rounded-full transition-colors">Baixar</button>
            </div>
          </div>
        </div>
      )}

      <OutputPanel isOpen={panel} title={panelTitle} output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

function BackupCard({ addToast, view, density }) {
  const [panel, setPanel] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');

  async function runBackup() {
    setPanelTitle('backup full');
    setPanel(true);
    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/backup/full', { method: 'POST' });
      setOutput(data.output || data.message || 'Concluído.');
      addToast(data.ok ? 'Backup concluído!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      setOutput('Erro de backup.');
    }
    setLoading(false);
  }

  async function fetchStorage() {
    setPanelTitle('df -h');
    setPanel(true);
    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/backup/storage');
      setOutput(data.output || 'Sem dados.');
    } catch {
      setOutput('Erro de storage.');
    }
    setLoading(false);
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="cloud_sync" title="Backup" color="cyan" density={density} />
        <div className={buttonsClass}>
          <ActionButton label="Backup" icon="backup" density={density} onClick={runBackup} loading={loading} />
          <ActionButton label="Storage" icon="storage" variant="ghost" density={density} onClick={fetchStorage} loading={loading} />
        </div>
      </Card>
      <OutputPanel isOpen={panel} title={panelTitle} output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

function MaintenanceCard({ addToast, view, density }) {
  const [panel, setPanel] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');
  const [confirm, setConfirm] = useState(null);

  async function execute(endpoint, title) {
    setPanelTitle(title);
    setPanel(true);
    setLoading(true);
    setOutput('');
    setConfirm(null);
    try {
      const data = await apiFetch(`/api/maintenance/${endpoint}`, { method: 'POST' });
      setOutput(data.output || data.message || 'Concluído.');
      addToast(data.ok ? 'Sucesso!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      setOutput('Erro de processamento.');
    }
    setLoading(false);
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-row gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="build" title="Manutenção" color="orange" density={density} />
        <div className={buttonsClass}>
          <ActionButton
            label="Limpar"
            icon="delete_sweep"
            density={density}
            onClick={() => setConfirm('clean')}
            loading={loading}
          />
          <ActionButton
            label="Atualizar"
            icon="system_update"
            variant="ghost"
            density={density}
            onClick={() => setConfirm('update')}
            loading={loading}
          />
        </div>
      </Card>

      <ConfirmModal
        isOpen={confirm === 'clean'}
        title="Limpar Arquivos"
        message="Deseja limpar arquivos temporários?"
        onConfirm={() => execute('clean', 'find & rm')}
        onCancel={() => setConfirm(null)}
        danger
      />
      <ConfirmModal
        isOpen={confirm === 'update'}
        title="Atualizar OS"
        message="Deseja atualizar o sistema operacional?"
        onConfirm={() => execute('update', 'apt-get upgrade')}
        onCancel={() => setConfirm(null)}
        danger={false}
      />
      <OutputPanel isOpen={panel} title={panelTitle} output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

function VpnCard({ addToast, view, density }) {
  const [panel, setPanel] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    setPanel(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/vpn/status');
      setOutput(data.output || 'Sem dados.');
    } catch {
      setOutput('Erro de status VPN.');
    }
    setLoading(false);
  }

  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <>
      <Card view={view}>
        <CardHeader icon="vpn_lock" title="VPN" color="blue" density={density} />
        <div className={buttonsClass}>
          <ActionButton label="Status" icon="monitoring" density={density} onClick={fetchStatus} loading={loading} />
        </div>
      </Card>
      <OutputPanel isOpen={panel} title="tailscale status" output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

function QuickLinksCard({ view, density }) {
  const host = process.env.NEXT_PUBLIC_SSH_HOST || '192.168.15.109';
  const isCompact = density === 'compact';
  const paddingClass = isCompact 
    ? 'py-1.5 px-3 rounded-lg text-xs gap-1.5 h-8' 
    : 'py-2.5 px-5 rounded-xl text-sm gap-2 h-11';
  const buttonsClass = view === 'list'
    ? 'flex flex-row items-center gap-2 flex-wrap w-full sm:w-auto'
    : 'flex flex-col gap-2 mt-4 w-full';

  return (
    <Card view={view}>
      <CardHeader icon="open_in_browser" title="Links" color="green" density={density} />
      <div className={buttonsClass}>
        <a
          href={`https://${host}:9090`}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn-ghost ${paddingClass} flex items-center justify-center font-medium flex-1 min-w-0 transition-all`}
        >
          <span className="material-symbols-outlined text-base">web</span>
          <span className="truncate">Cockpit</span>
        </a>
        <a
          href={`smb://${host}/Arquivos_Servidor`}
          className={`btn-ghost ${paddingClass} flex items-center justify-center font-medium flex-1 min-w-0 transition-all`}
        >
          <span className="material-symbols-outlined text-base">folder_open</span>
          <span className="truncate">SMB</span>
        </a>
        <a
          href={`http://${host}:6080`}
          target="_blank"
          rel="noopener noreferrer"
          className={`btn-ghost ${paddingClass} flex items-center justify-center font-medium flex-1 min-w-0 transition-all`}
        >
          <span className="material-symbols-outlined text-base">android</span>
          <span className="truncate">VNC</span>
        </a>
      </div>
    </Card>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function NavBar({ serverStatus }) {
  const isOnline = serverStatus?.online;
  const info = isOnline ? parseUptime(serverStatus?.output) : null;

  return (
    <nav className="navbar border-b border-[var(--md-sys-color-surface-variant)]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center">
          <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-[20px] icon-filled">dns</span>
        </div>
        <div>
          <span className="text-base font-bold tracking-tight text-[var(--md-sys-color-on-surface)]">ROHENPER</span>
          {info && (
            <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1.5 mt-0.5">
              <span>Uptime: {info.uptime}</span>
              <span className="opacity-45">•</span>
              <span>Load: {info.load}</span>
            </div>
          )}
        </div>
      </div>
      <div className={`status-badge ${isOnline === false ? 'status-offline' : isOnline ? 'status-online' : 'status-checking'} transition-all`}>
        <span className={`w-2 h-2 rounded-full ${isOnline === false ? 'bg-red-600' : isOnline ? 'bg-green-600' : 'bg-yellow-600 animate-pulse'}`} />
        <span className="text-[10px] font-bold">
          {isOnline === false ? 'Offline' : isOnline ? `${serverStatus?.host || 'Online'}` : 'Verificando...'}
        </span>
      </div>
    </nav>
  );
}

// ─── CONTROL BAR ──────────────────────────────────────────────────────────────

function ControlBar({ theme, setTheme, density, setDensity, view, setView }) {
  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px]">tune</span>
        <span className="font-medium">Painel de Ajustes</span>
      </div>
      <div className="flex items-center gap-3">
        {/* Densidade */}
        <div className="flex bg-[var(--md-sys-color-surface-variant)] rounded-full p-0.5 border border-[var(--md-sys-color-surface-variant)]">
          <button
            onClick={() => setDensity('compact')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              density === 'compact'
                ? 'bg-[var(--md-sys-color-primary)] text-white shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:opacity-85'
            }`}
          >
            Compacto
          </button>
          <button
            onClick={() => setDensity('normal')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              density === 'normal'
                ? 'bg-[var(--md-sys-color-primary)] text-white shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:opacity-85'
            }`}
          >
            Padrão
          </button>
        </div>

        {/* Visualização */}
        <div className="flex bg-[var(--md-sys-color-surface-variant)] rounded-full p-0.5 border border-[var(--md-sys-color-surface-variant)]">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              view === 'grid'
                ? 'bg-[var(--md-sys-color-primary)] text-white shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:opacity-85'
            }`}
          >
            Grade
          </button>
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1 rounded-full font-medium transition-all ${
              view === 'list'
                ? 'bg-[var(--md-sys-color-primary)] text-white shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:opacity-85'
            }`}
          >
            Lista
          </button>
        </div>

        {/* Tema */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-7 h-7 rounded-full bg-[var(--md-sys-color-surface-variant)] border border-[var(--md-sys-color-surface-variant)] flex items-center justify-center hover:opacity-85 transition-opacity"
        >
          <span className="material-symbols-outlined text-[16px]">
            {theme === 'dark' ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── MAIN APP PAGE ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [serverStatus, setServerStatus] = useState(null);

  const [theme, setTheme] = useState('light');
  const [density, setDensity] = useState('normal');
  const [view, setView] = useState('grid');
  const [mounted, setMounted] = useState(false);
  const [authValid, setAuthValid] = useState(false);

  useEffect(() => {
    const validateAuth = async () => {
      const token = localStorage.getItem('dashboard-token');
      if (!token) {
        window.location.href = '/login';
        return;
      }

      try {
        const res = await fetch('/api/auth/validate', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 401) {
          localStorage.removeItem('dashboard-token');
          window.location.href = '/login';
          return;
        }

        const data = await res.json();
        if (data.ok) {
          setAuthValid(true);
        } else {
          localStorage.removeItem('dashboard-token');
          window.location.href = '/login';
        }
      } catch (err) {
        console.error('Auth validation failed:', err);
        localStorage.removeItem('dashboard-token');
        window.location.href = '/login';
      }
    };

    validateAuth();
  }, []);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    const savedDensity = localStorage.getItem('dashboard-density') || 'normal';
    const savedView = localStorage.getItem('dashboard-view') || 'grid';
    
    setTheme(savedTheme);
    setDensity(savedDensity);
    setView(savedView);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('dashboard-theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('dashboard-density', density);
  }, [density, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('dashboard-view', view);
  }, [view, mounted]);

  useEffect(() => {
    const fetchStatus = () => {
      apiFetch('/api/status')
        .then((data) => setServerStatus(data))
        .catch(() => setServerStatus({ online: false }));
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] transition-colors">
      {!authValid ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-3">
            <span className="material-symbols-outlined animate-spin text-4xl text-[var(--md-sys-color-primary)]">
              autorenew
            </span>
            <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              Validando acesso...
            </span>
          </div>
        </div>
      ) : (
        <>
          <NavBar serverStatus={serverStatus} />

          <ControlBar
            theme={theme} setTheme={setTheme}
            density={density} setDensity={setDensity}
            view={view} setView={setView}
          />

          <main className={`max-w-6xl mx-auto px-4 py-4 animate-fade-in ${
            view === 'list'
              ? 'flex flex-col gap-3'
              : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
          }`}>
            <PowerCard addToast={addToast} view={view} density={density} />
            <DockerCard addToast={addToast} view={view} density={density} />
            <SandboxCard addToast={addToast} view={view} density={density} />
            <IaHubCard addToast={addToast} view={view} density={density} />
            <BackupCard addToast={addToast} view={view} density={density} />
            <VpnCard addToast={addToast} view={view} density={density} />
            <QuickLinksCard view={view} density={density} />
            <MaintenanceCard addToast={addToast} view={view} density={density} />
          </main>

          <Toast toasts={toasts} removeToast={removeToast} />
        </>
      )}
    </div>
  );
}
