'use client';
import { useState, useEffect, useCallback } from 'react';
import ConfirmModal from './components/ConfirmModal';
import OutputPanel from './components/OutputPanel';

// ─── Utilitários ──────────────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// ─── Componente de Card genérico ──────────────────────────────────────────────

function Card({ children, className = '', span = 1 }) {
  const spanClass = span === 2 ? 'md:col-span-2' : '';
  return (
    <div className={`mat-card ${spanClass} ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, color = 'blue' }) {
  const colors = {
    blue: 'text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]',
    red: 'text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)]',
    purple: 'text-[#6750A4] bg-[#EADDFF]', // Material Purple
    green: 'text-[var(--md-sys-color-tertiary)] bg-[var(--md-sys-color-tertiary-container)]',
    orange: 'text-[var(--md-sys-color-warning)] bg-[var(--md-sys-color-warning-container)]',
    cyan: 'text-[#006874] bg-[#97F0FF]', // Material Cyan
  };
  return (
    <div className="flex flex-col items-center text-center mb-5">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${colors[color]}`}>
        <span className={`material-symbols-outlined text-3xl icon-filled`}>{icon}</span>
      </div>
      <h2 className="text-[17px] font-medium tracking-tight google-sans">{title}</h2>
    </div>
  );
}

function ActionButton({ label, icon, onClick, variant = 'primary', loading = false, disabled = false }) {
  const variants = {
    primary: 'btn-primary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${variants[variant]} flex items-center justify-center gap-2 flex-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {loading ? (
        <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
      ) : (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

// ─── Toast Notification ───────────────────────────────────────────────────────

function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-2xl shadow-lg animate-fade-in ${
            t.type === 'error'
              ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
              : t.type === 'success'
              ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]'
              : 'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined icon-filled text-[20px] flex-shrink-0 mt-0.5">
            {t.type === 'error' ? 'error' : t.type === 'success' ? 'check_circle' : 'info'}
          </span>
          <span className="flex-1 font-medium">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100 transition-opacity">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Hook de Toast ────────────────────────────────────────────────────────────

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

// ─── SEÇÃO: Energia ───────────────────────────────────────────────────────────

function PowerCard({ addToast }) {
  const [confirm, setConfirm] = useState(null); // 'shutdown' | 'reboot'
  const [loading, setLoading] = useState(null);

  async function execute(action) {
    setLoading(action);
    setConfirm(null);
    try {
      const data = await apiFetch(`/api/power/${action}`, { method: 'POST' });
      if (data.ok) addToast(data.message, 'success');
      else addToast(data.error, 'error');
    } catch {
      addToast('Erro ao conectar ao servidor.', 'error');
    }
    setLoading(null);
  }

  return (
    <>
      <Card span={2}>
        <CardHeader icon="power_settings_new" title="Gerenciamento de Energia" color="red" />
        <div className="flex gap-3 mt-auto">
          <ActionButton
            label="Reiniciar"
            icon="restart_alt"
            variant="danger"
            loading={loading === 'reboot'}
            onClick={() => setConfirm('reboot')}
          />
          <ActionButton
            label="Desligar"
            icon="power_off"
            variant="danger"
            loading={loading === 'shutdown'}
            onClick={() => setConfirm('shutdown')}
          />
        </div>
      </Card>

      <ConfirmModal
        isOpen={confirm === 'reboot'}
        title="Reiniciar Servidor"
        message="O servidor será reiniciado. Todos os serviços serão interrompidos temporariamente."
        onConfirm={() => execute('reboot')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmModal
        isOpen={confirm === 'shutdown'}
        title="Desligar Servidor"
        message="O servidor será DESLIGADO. Você precisará do Wake-on-LAN ou acesso físico para ligá-lo novamente."
        onConfirm={() => execute('shutdown')}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

// ─── SEÇÃO: Docker ────────────────────────────────────────────────────────────

function DockerCard({ addToast }) {
  const [panel, setPanel] = useState(false);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [panelTitle, setPanelTitle] = useState('');
  const [stopModal, setStopModal] = useState(false);
  const [containerName, setContainerName] = useState('');
  const [containers, setContainers] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'all' | 'images'

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
          .map((i) => `${i.Repository}:${i.Tag}  ${i.Size}  ${i.CreatedSince}`)
          .join('\n');
        setOutput(lines || 'Sem imagens.');
        setContainers([]);
      }
    } catch {
      setOutput('Erro ao buscar dados.');
    }
    setLoading(false);
  }

  async function restartDocker() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/docker/restart-service', { method: 'POST' });
      addToast(data.ok ? 'Docker reiniciado!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      addToast('Erro ao reiniciar Docker.', 'error');
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
      addToast(data.ok ? data.message : data.error, data.ok ? 'success' : 'error');
    } catch {
      addToast('Erro ao parar container.', 'error');
    }
    setLoading(false);
    setContainerName('');
  }

  return (
    <>
      <Card>
        <CardHeader icon="view_in_ar" title="Containers Docker" color="blue" />
        <div className="flex flex-col gap-2 mt-auto">
          <div className="flex gap-2">
            <ActionButton label="Ativos" icon="play_circle" onClick={() => fetchData('ps', 'docker ps')} loading={loading} />
            <ActionButton label="Todos" icon="list" variant="ghost" onClick={() => fetchData('all', 'docker ps -a')} loading={loading} />
          </div>
          <div className="flex gap-2">
            <ActionButton label="Imagens" icon="layers" variant="ghost" onClick={() => fetchData('images', 'docker images')} />
            <ActionButton label="Parar" icon="stop_circle" variant="danger" onClick={() => setStopModal(true)} />
          </div>
          <ActionButton label="Reiniciar Daemon" icon="restart_alt" variant="ghost" onClick={restartDocker} loading={loading} />
        </div>
      </Card>

      {/* Modal: Parar container */}
      {stopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setStopModal(false)} />
          <div className="relative bg-[var(--md-sys-color-surface)] shadow-[var(--md-elevation-3)] rounded-[28px] p-6 w-full max-w-sm animate-fade-in">
            <h3 className="text-xl font-medium google-sans mb-4 text-[var(--md-sys-color-on-surface)]">Parar Container</h3>
            <input
              className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-t-xl border-b-2 border-[var(--md-sys-color-on-surface-variant)] px-4 py-3 text-base outline-none focus:border-[var(--md-sys-color-primary)] transition-colors mb-6"
              placeholder="Nome ou ID"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && stopContainer()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setStopModal(false)} className="px-4 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-black/5 rounded-full transition-colors">Cancelar</button>
              <button onClick={stopContainer} className="px-4 py-2 text-sm font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 rounded-full transition-colors">Parar</button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de saída */}
      {panel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPanel(false)} />
          <div className="relative w-full sm:max-w-3xl bg-[var(--md-sys-color-surface)] rounded-t-[28px] sm:rounded-[28px] shadow-[var(--md-elevation-3)] flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <span className="text-sm font-mono text-[var(--md-sys-color-on-surface-variant)]">{panelTitle}</span>
              <button onClick={() => setPanel(false)} className="w-10 h-10 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors text-[var(--md-sys-color-on-surface-variant)]">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-[#F8F9FA] rounded-b-[28px] flex-1">
              {loading ? (
                <div className="flex items-center gap-2 text-[var(--md-sys-color-primary)] font-medium text-sm">
                  <span className="animate-spin material-symbols-outlined text-[18px]">autorenew</span>
                  Processando...
                </div>
              ) : containers.length > 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                        <th className="text-left py-3 px-4 font-medium">Nome</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Portas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-mono text-gray-900">{c.Names}</td>
                          <td className={`py-3 px-4 font-medium ${c.Status?.includes('Up') ? 'text-green-600' : 'text-red-600'}`}>
                            {c.Status}
                          </td>
                          <td className="py-3 px-4 hidden sm:table-cell text-gray-500 font-mono text-xs">{c.Ports || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="text-gray-800 font-mono text-sm whitespace-pre-wrap">{output || 'Sem dados.'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── SEÇÃO: Sandbox ───────────────────────────────────────────────────────────

function SandboxCard({ addToast }) {
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
      addToast('Erro ao iniciar sandbox.', 'error');
    }
    setLoading(null);
  }

  return (
    <Card>
      <CardHeader icon="science" title="Sandbox" color="purple" />
      <div className="flex flex-col gap-2 mt-auto">
        <ActionButton label="VS Code" icon="code" onClick={() => launch('vscode')} loading={loading === 'vscode'} />
        <ActionButton label="Webtop Desktop" icon="desktop_windows" variant="ghost" onClick={() => launch('webtop')} loading={loading === 'webtop'} />
        <ActionButton label="Steam" icon="sports_esports" variant="ghost" onClick={() => launch('steam')} loading={loading === 'steam'} />
      </div>
    </Card>
  );
}

// ─── SEÇÃO: IA Hub ────────────────────────────────────────────────────────────

function IaHubCard({ addToast }) {
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
      setOutput('Erro ao buscar dados.');
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
      addToast(data.ok ? `Modelo "${modelName}" baixado!` : data.error, data.ok ? 'success' : 'error');
    } catch {
      setOutput('Erro ao fazer pull do modelo.');
    }
    setLoading(false);
    setModelName('');
  }

  return (
    <>
      <Card>
        <CardHeader icon="psychology" title="IA Hub (Ollama)" color="purple" />
        <div className="flex flex-col gap-2 mt-auto">
          <ActionButton label="Status Ollama" icon="monitoring" onClick={() => fetchOutput('/api/ia/status', 'ollama status')} loading={loading} />
          <ActionButton label="Listar Modelos" icon="list" variant="ghost" onClick={() => fetchOutput('/api/ia/models', 'ollama list')} loading={loading} />
          <ActionButton label="Pull Modelo" icon="download" variant="ghost" onClick={() => setPullModal(true)} />
        </div>
      </Card>

      {/* Modal pull */}
      {pullModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPullModal(false)} />
          <div className="relative bg-[var(--md-sys-color-surface)] shadow-[var(--md-elevation-3)] rounded-[28px] p-6 w-full max-w-sm animate-fade-in">
            <h3 className="text-xl font-medium google-sans mb-4 text-[var(--md-sys-color-on-surface)]">Pull de Modelo Ollama</h3>
            <input
              className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-t-xl border-b-2 border-[var(--md-sys-color-on-surface-variant)] px-4 py-3 text-base outline-none focus:border-[var(--md-sys-color-primary)] transition-colors mb-2"
              placeholder="ex: llama3, mistral, gemma2"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pullModel()}
              autoFocus
            />
            <p className="text-[var(--md-sys-color-on-surface-variant)] text-xs mb-6 px-1">Este processo pode demorar vários minutos e exige paciência.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPullModal(false)} className="px-4 py-2 text-sm font-medium text-[var(--md-sys-color-primary)] hover:bg-black/5 rounded-full transition-colors">Cancelar</button>
              <button onClick={pullModel} className="px-4 py-2 text-sm font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 rounded-full transition-colors">Baixar</button>
            </div>
          </div>
        </div>
      )}

      <OutputPanel
        isOpen={panel}
        title={panelTitle}
        output={output}
        loading={loading}
        onClose={() => setPanel(false)}
      />
    </>
  );
}

// ─── SEÇÃO: Backup ────────────────────────────────────────────────────────────

function BackupCard({ addToast }) {
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
      setOutput('Erro ao executar backup.');
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
      setOutput('Erro ao buscar storage.');
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <CardHeader icon="cloud_sync" title="Backup System" color="cyan" />
        <div className="flex flex-col gap-2 mt-auto">
          <ActionButton label="Backup Full" icon="backup" onClick={runBackup} loading={loading} />
          <ActionButton label="Status Storage" icon="storage" variant="ghost" onClick={fetchStorage} loading={loading} />
        </div>
      </Card>
      <OutputPanel isOpen={panel} title={panelTitle} output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

// ─── SEÇÃO: Manutenção ────────────────────────────────────────────────────────

function MaintenanceCard({ addToast }) {
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
      addToast(data.ok ? 'Operação concluída!' : data.error, data.ok ? 'success' : 'error');
    } catch {
      setOutput('Erro ao executar operação.');
    }
    setLoading(false);
  }

  return (
    <>
      <Card span={2}>
        <CardHeader icon="build" title="Manutenção Rápida" color="orange" />
        <div className="flex gap-3 mt-auto">
          <ActionButton
            label="Limpar Lixo"
            icon="delete_sweep"
            onClick={() => setConfirm('clean')}
            loading={loading}
          />
          <ActionButton
            label="Atualizar OS"
            icon="system_update"
            variant="ghost"
            onClick={() => setConfirm('update')}
            loading={loading}
          />
        </div>
      </Card>

      <ConfirmModal
        isOpen={confirm === 'clean'}
        title="Limpar Arquivos Temporários"
        message="Remove arquivos *test*, *tmp*, *junk* em /home/rodrigo (profundidade 2). Isso é irreversível."
        onConfirm={() => execute('clean', 'find & rm')}
        onCancel={() => setConfirm(null)}
        danger
      />
      <ConfirmModal
        isOpen={confirm === 'update'}
        title="Atualizar Sistema"
        message="Executa apt-get update && upgrade -y no servidor. Pode demorar alguns minutos."
        onConfirm={() => execute('update', 'apt-get upgrade')}
        onCancel={() => setConfirm(null)}
        danger={false}
      />
      <OutputPanel isOpen={panel} title={panelTitle} output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

// ─── SEÇÃO: VPN ───────────────────────────────────────────────────────────────

function VpnCard({ addToast }) {
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
      setOutput('Erro ao buscar status VPN.');
    }
    setLoading(false);
  }

  return (
    <>
      <Card>
        <CardHeader icon="vpn_lock" title="VPN (Tailscale)" color="blue" />
        <div className="mt-auto">
          <ActionButton label="Ver Status" icon="monitoring" onClick={fetchStatus} loading={loading} />
        </div>
      </Card>
      <OutputPanel isOpen={panel} title="tailscale status" output={output} loading={loading} onClose={() => setPanel(false)} />
    </>
  );
}

// ─── SEÇÃO: Cockpit & Monitor ─────────────────────────────────────────────────

function QuickLinksCard() {
  const host = process.env.NEXT_PUBLIC_SSH_HOST || '192.168.15.109';

  return (
    <Card>
      <CardHeader icon="open_in_browser" title="Links Rápidos" color="green" />
      <div className="flex flex-col gap-2 mt-auto">
        <a
          href={`https://${host}:9090`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">web</span>
          Cockpit UI
        </a>
        <a
          href={`smb://${host}/Arquivos_Servidor`}
          className="btn-ghost flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">folder_open</span>
          Pastas SMB
        </a>
        <a
          href={`http://${host}:6080`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-base">android</span>
          Android VNC
        </a>
      </div>
    </Card>
  );
}

// ─── NAVBAR ───────────────────────────────────────────────────────────────────

function NavBar({ serverStatus }) {
  const isOnline = serverStatus?.online;

  return (
    <nav className="navbar">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-[var(--md-sys-color-primary-container)] flex items-center justify-center">
          <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-[24px]">dns</span>
        </div>
        <div>
          <span className="text-xl font-medium google-sans tracking-tight text-[var(--md-sys-color-on-surface)]">PC</span>
          <span className="text-[var(--md-sys-color-on-surface-variant)] text-sm ml-2 font-medium">Dashboard</span>
        </div>
      </div>
      <div className={`status-badge ${isOnline === false ? 'status-offline' : isOnline ? 'status-online' : 'status-checking'}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${isOnline === false ? 'bg-red-600' : isOnline ? 'bg-green-600' : 'bg-yellow-600 animate-pulse'}`} />
        {isOnline === false ? 'Offline' : isOnline ? `Online · ${serverStatus?.host || 'Servidor'}` : 'Verificando...'}
      </div>
    </nav>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    const fetchStatus = () => {
      apiFetch('/api/status')
        .then((data) => setServerStatus(data))
        .catch(() => setServerStatus({ online: false }));
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // Verifica a cada 15 segundos
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)]">
      <NavBar serverStatus={serverStatus} />

      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
        <PowerCard addToast={addToast} />
        <DockerCard addToast={addToast} />
        <SandboxCard addToast={addToast} />
        <IaHubCard addToast={addToast} />
        <BackupCard addToast={addToast} />
        <VpnCard addToast={addToast} />
        <QuickLinksCard />
        <MaintenanceCard addToast={addToast} />
      </main>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
