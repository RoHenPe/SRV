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
    <div className={`card ${spanClass} ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon, title, color = 'blue' }) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10',
    red: 'text-red-400 bg-red-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green: 'text-green-400 bg-green-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
  };
  return (
    <div className="flex flex-col items-center text-center mb-5">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <span className={`material-symbols-outlined text-3xl ${colors[color].split(' ')[0]}`}>{icon}</span>
      </div>
      <h2 className="text-base font-semibold text-gray-100">{title}</h2>
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
      className={`${variants[variant]} flex items-center justify-center gap-2 flex-1 min-w-0`}
    >
      {loading ? (
        <span className="material-symbols-outlined text-base animate-spin">autorenew</span>
      ) : (
        <span className="material-symbols-outlined text-base">{icon}</span>
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
          className={`flex items-start gap-3 p-3 rounded-xl shadow-lg border text-sm animate-slide-in ${
            t.type === 'error'
              ? 'bg-red-950 border-red-700 text-red-200'
              : t.type === 'success'
              ? 'bg-green-950 border-green-700 text-green-200'
              : 'bg-gray-800 border-gray-700 text-gray-200'
          }`}
        >
          <span className={`material-symbols-outlined text-base flex-shrink-0 mt-0.5 ${
            t.type === 'error' ? 'text-red-400' : t.type === 'success' ? 'text-green-400' : 'text-blue-400'
          }`}>
            {t.type === 'error' ? 'error' : t.type === 'success' ? 'check_circle' : 'info'}
          </span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-50 hover:opacity-100">
            <span className="material-symbols-outlined text-sm">close</span>
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setStopModal(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-100 mb-3">Parar Container</h3>
            <input
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-gray-100 text-sm outline-none focus:border-blue-500 mb-4"
              placeholder="Nome ou ID do container"
              value={containerName}
              onChange={(e) => setContainerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && stopContainer()}
              autoFocus
            />
            <div className="flex gap-3">
              <button onClick={() => setStopModal(false)} className="flex-1 btn-ghost">Cancelar</button>
              <button onClick={stopContainer} className="flex-1 btn-danger">Parar</button>
            </div>
          </div>
        </div>
      )}

      {/* Painel de saída */}
      {panel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPanel(false)} />
          <div className="relative w-full sm:max-w-3xl bg-gray-950 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <span className="ml-2 text-gray-400 text-sm font-mono">{panelTitle}</span>
              </div>
              <button onClick={() => setPanel(false)} className="text-gray-500 hover:text-gray-300">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
                  <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
                  Carregando...
                </div>
              ) : containers.length > 0 ? (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left pb-2">Nome</th>
                      <th className="text-left pb-2">Status</th>
                      <th className="text-left pb-2 hidden sm:table-cell">Portas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containers.map((c, i) => (
                      <tr key={i} className="border-b border-gray-900 text-gray-300">
                        <td className="py-1.5 text-green-400">{c.Names}</td>
                        <td className={`py-1.5 ${c.Status?.includes('Up') ? 'text-green-400' : 'text-red-400'}`}>
                          {c.Status}
                        </td>
                        <td className="py-1.5 hidden sm:table-cell text-gray-500">{c.Ports || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className="text-green-400 text-sm whitespace-pre-wrap">{output || 'Sem dados.'}</pre>
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPullModal(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-100 mb-3">Pull de Modelo Ollama</h3>
            <input
              className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-gray-100 text-sm outline-none focus:border-purple-500 mb-1"
              placeholder="ex: llama3, mistral, gemma2"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pullModel()}
              autoFocus
            />
            <p className="text-gray-500 text-xs mb-4">Este processo pode demorar vários minutos.</p>
            <div className="flex gap-3">
              <button onClick={() => setPullModal(false)} className="flex-1 btn-ghost">Cancelar</button>
              <button onClick={pullModel} className="flex-1 btn-primary">Baixar</button>
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
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-xl">dns</span>
        </div>
        <div>
          <span className="text-lg font-bold text-white tracking-tight">ROHENPER</span>
          <span className="text-gray-500 text-xs ml-2">Dashboard</span>
        </div>
      </div>
      <div className={`status-badge ${isOnline === false ? 'status-offline' : isOnline ? 'status-online' : 'status-checking'}`}>
        <span className={`w-2 h-2 rounded-full ${isOnline === false ? 'bg-red-400' : isOnline ? 'bg-green-400 animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
        {isOnline === false ? 'Offline' : isOnline ? `Online · ${process.env.NEXT_PUBLIC_SSH_HOST || '192.168.15.109'}` : 'Verificando...'}
      </div>
    </nav>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    apiFetch('/api/status')
      .then((data) => setServerStatus(data))
      .catch(() => setServerStatus({ online: false }));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <NavBar serverStatus={serverStatus} />

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
