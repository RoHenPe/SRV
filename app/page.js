'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmModal from './components/ConfirmModal';
import OutputPanel from './components/OutputPanel';
import { getOrInitDeviceIdentity } from './hooks/useApi';

const NAV_ITEMS = [
  { id: 'home', label: 'Visão Geral', icon: 'grid_view' },
  { id: 'containers', label: 'Containers', icon: 'deployed_code' },
  { id: 'ia', label: 'Automação & LLM', icon: 'memory' },
  { id: 'terminal', label: 'Terminal SSH', icon: 'terminal' },
  { id: 'sistema', label: 'Processos & Rede', icon: 'monitoring' },
  { id: 'backup', label: 'Storage & Backup', icon: 'hard_drive' },
  { id: 'manutencao', label: 'Manutenção', icon: 'build' },
  { id: 'logs', label: 'Logs do Servidor', icon: 'receipt_long' },
  { id: 'usuarios', label: 'Sessões & Acessos', icon: 'devices' },
];

export default function DashboardPage() {
  const router = useRouter();
  const [activeView, setActiveView] = useState('home');
  const [theme, setTheme] = useState('dark');
  const [deviceIdentity, setDeviceIdentity] = useState({ deviceId: '', deviceName: '' });
  const [currentUser, setCurrentUser] = useState('admin');
  const [sshOverride, setSshOverride] = useState('');

  // Status compartilhado do servidor
  const [serverStatus, setServerStatus] = useState({
    online: false,
    cpu: 0,
    uptime: '',
    memory: { total: 0, used: 0, percent: 0 },
    disks: [],
    runningContainers: [],
    activeDevices: 1,
    host: '',
    port: 22,
    route: '',
  });
  const [statusLoading, setStatusLoading] = useState(true);

  // Aplicativo/módulo aberto em tela embarcada neste dispositivo
  const [activeApp, setActiveApp] = useState(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appLoadingText, setAppLoadingText] = useState('');

  // Modal de confirmação e painel de saída
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    danger: true,
    onConfirm: null,
  });
  const [outputPanel, setOutputPanel] = useState({
    isOpen: false,
    title: '',
    output: '',
    loading: false,
  });

  // Inicialização de tema, dispositivo e validação de sessão
  useEffect(() => {
    const savedTheme = localStorage.getItem('srv-theme') || 'dark';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedOverride = localStorage.getItem('srv-ssh-override') || '';
    setSshOverride(savedOverride);

    const savedView = sessionStorage.getItem('srv-active-view');
    if (savedView && NAV_ITEMS.some((i) => i.id === savedView)) {
      setActiveView(savedView);
    }

    const identity = getOrInitDeviceIdentity();
    setDeviceIdentity(identity);

    const token = localStorage.getItem('dashboard-token');
    if (!token) {
      router.push('/login');
      return;
    }

    const savedUser = localStorage.getItem('srv-username');
    if (savedUser) setCurrentUser(savedUser);
  }, [router]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('srv-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const handleSelectView = (viewId) => {
    setActiveView(viewId);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('srv-active-view', viewId);
    }
  };

  // Wrapper central de chamadas de API com identificação de dispositivo
  const apiFetch = useCallback(
    async (url, options = {}) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('dashboard-token') : null;
      const override = typeof window !== 'undefined' ? localStorage.getItem('srv-ssh-override') : '';
      const identity = getOrInitDeviceIdentity();

      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(override ? { 'x-ssh-override': override } : {}),
        'x-device-id': identity.deviceId,
        'x-device-name': identity.deviceName,
        ...(options.headers || {}),
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
        throw new Error('Sessão expirada ou encerrada. Faça login novamente.');
      }

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Falha na operação solicitada.');
      }
      return data;
    },
    []
  );

  // Registro assíncrono de eventos do cliente nos logs do servidor
  const logClientEvent = useCallback(
    (event, message = 'ok', details = {}, level = 'info') => {
      apiFetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify({ event, message, details, level }),
      }).catch(() => {});
    },
    [apiFetch]
  );

  const fetchStatus = useCallback(
    async (force = false) => {
      try {
        const data = await apiFetch(`/api/status${force ? '?force=1' : ''}`);
        setServerStatus({
          online: Boolean(data.online),
          cpu: data.cpu || 0,
          uptime: data.uptime || '',
          memory: data.memory || { total: 0, used: 0, percent: 0 },
          disks: Array.isArray(data.disks) ? data.disks : [],
          runningContainers: Array.isArray(data.runningContainers) ? data.runningContainers : [],
          activeDevices: data.activeDevices || 1,
          host: data.host || '',
          port: data.port || 22,
          route: data.route || '',
        });
      } catch (_) {
        setServerStatus((prev) => ({ ...prev, online: false }));
      } finally {
        setStatusLoading(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    fetchStatus(false);
    const interval = setInterval(() => fetchStatus(false), 12000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const showOutput = (title, output, loading = false) => {
    setOutputPanel({ isOpen: true, title, output, loading });
  };

  const askConfirm = (title, message, onConfirm, danger = true) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      danger,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        await onConfirm();
      },
    });
  };

  // Abre módulo web embarcado ou em nova guia com suporte multi-dispositivo (sem derrubar sessões alheias)
  const openModule = async ({ name, port, protocol = 'http:', sandboxRoute = null, path = '', externalOnly = false }) => {
    setAppLoading(true);
    setAppLoadingText(`Inicializando ${name} (porta ${port})...`);
    try {
      if (sandboxRoute) {
        await apiFetch(sandboxRoute, { method: 'POST' });
      }

      const isLocalHttp =
        typeof window !== 'undefined' &&
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' ||
          window.location.hostname.startsWith('192.168.') ||
          window.location.hostname.startsWith('100.'));

      setAppLoadingText(`Conectando roteamento para ${name}...`);
      const tunnelData = await apiFetch('/api/tunnel', {
        method: 'POST',
        body: JSON.stringify({
          port,
          protocol,
          mode: isLocalHttp ? 'local_http' : 'tunnel',
          appName: name,
        }),
      });

      const baseUrl = tunnelData.url.replace(/\/$/, '');
      const finalUrl = `${baseUrl}${path || ''}`;

      // Se a URL for HTTP em página HTTPS, usa /api/proxy para evitar bloqueio Mixed Content
      const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const embedUrl =
        isHttpsPage && finalUrl.startsWith('http://')
          ? `/api/proxy?url=${encodeURIComponent(finalUrl)}`
          : finalUrl;

      logClientEvent('module.open', 'opened', { name, port, url: finalUrl });

      if (externalOnly) {
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
      } else {
        setActiveApp({
          name,
          port,
          url: embedUrl,
          rawUrl: finalUrl,
        });
      }
      fetchStatus(true);
    } catch (err) {
      logClientEvent('module.open_error', err.message, { name, port }, 'error');
      showOutput(`Erro ao abrir ${name}`, err.message, false);
    } finally {
      setAppLoading(false);
      setAppLoadingText('');
    }
  };

  // Fecha apenas a visualização neste aparelho, preservando túneis para outros aparelhos conectados
  const closeActiveApp = async () => {
    const closedApp = activeApp;
    setActiveApp(null);
    if (closedApp) {
      try {
        await apiFetch('/api/tunnel', {
          method: 'POST',
          body: JSON.stringify({ action: 'stop' }),
        });
      } catch (_) {}
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dashboard-token');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-background)] flex flex-col">
      {/* Barra Superior Técnica */}
      <header className="sticky top-0 z-30 bg-[var(--md-sys-color-surface)] border-b border-[var(--md-sys-color-surface-variant)] px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-xl">dns</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight google-sans truncate">
                  Painel de Controle do Servidor
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                  {serverStatus.online ? 'CONECTADO' : statusLoading ? 'VERIFICANDO' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate font-mono">
                Dispositivo: {deviceIdentity.deviceName || 'Web'} • Usuário: {currentUser} • Sessões ativas: {serverStatus.activeDevices || 1}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchStatus(true)}
              title="Atualizar estado do servidor"
              className="p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] transition-colors"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
            </button>
            <button
              onClick={toggleTheme}
              title="Alternar tema claro/escuro"
              className="p-2 rounded-xl hover:bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] transition-colors"
            >
              <span className="material-symbols-outlined text-lg">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button
              onClick={handleLogout}
              title="Encerrar sessão neste dispositivo"
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] hover:opacity-90 text-[var(--md-sys-color-on-surface)] flex items-center gap-1.5 transition-all"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Navegação de Módulos */}
        <nav className="max-w-7xl mx-auto mt-2.5 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isSelected = activeView === item.id && !activeApp;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (activeApp) closeActiveApp();
                  handleSelectView(item.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-[var(--md-sys-color-primary)] text-white'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
                }`}
              >
                <span className="material-symbols-outlined text-base">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Indicador de inicialização de serviço/túnel */}
      {appLoading && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-6 max-w-sm w-full text-center space-y-3">
            <span className="material-symbols-outlined animate-spin text-3xl text-[var(--md-sys-color-primary)]">
              progress_activity
            </span>
            <p className="text-sm font-semibold">{appLoadingText || 'Conectando ao serviço...'}</p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Preparando instância e rota para este dispositivo.
            </p>
          </div>
        </div>
      )}

      {/* Visualização de Aplicativo Embarcado */}
      {activeApp ? (
        <div className="flex-1 flex flex-col bg-[var(--md-sys-color-background)]">
          <div className="bg-[var(--md-sys-color-surface)] border-b border-[var(--md-sys-color-surface-variant)] px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold truncate">{activeApp.name}</span>
              <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                (:{activeApp.port})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={activeApp.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] flex items-center gap-1 hover:opacity-90"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
                Nova Guia
              </a>
              <button
                onClick={closeActiveApp}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] flex items-center gap-1 hover:opacity-90"
              >
                <span className="material-symbols-outlined text-sm">close</span>
                Fechar
              </button>
            </div>
          </div>
          <iframe
            src={activeApp.url}
            title={activeApp.name}
            className="flex-1 w-full border-0 bg-white"
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        </div>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
          {activeView === 'home' && (
            <HomeView
              serverStatus={serverStatus}
              openModule={openModule}
              apiFetch={apiFetch}
              fetchStatus={fetchStatus}
              showOutput={showOutput}
            />
          )}
          {activeView === 'containers' && (
            <ContainersView
              apiFetch={apiFetch}
              showOutput={showOutput}
              askConfirm={askConfirm}
              fetchGlobalStatus={fetchStatus}
            />
          )}
          {activeView === 'ia' && (
            <AutomationView
              apiFetch={apiFetch}
              showOutput={showOutput}
              openModule={openModule}
            />
          )}
          {activeView === 'terminal' && (
            <TerminalView
              apiFetch={apiFetch}
              openModule={openModule}
              deviceId={deviceIdentity.deviceId}
            />
          )}
          {activeView === 'sistema' && (
            <SistemaView
              apiFetch={apiFetch}
              showOutput={showOutput}
              askConfirm={askConfirm}
              sshOverride={sshOverride}
              setSshOverride={setSshOverride}
              fetchGlobalStatus={fetchStatus}
            />
          )}
          {activeView === 'backup' && (
            <BackupView
              serverStatus={serverStatus}
              apiFetch={apiFetch}
              showOutput={showOutput}
            />
          )}
          {activeView === 'manutencao' && (
            <ManutencaoView
              apiFetch={apiFetch}
              showOutput={showOutput}
              askConfirm={askConfirm}
            />
          )}
          {activeView === 'logs' && (
            <LogsView
              apiFetch={apiFetch}
              deviceIdentity={deviceIdentity}
              askConfirm={askConfirm}
            />
          )}
          {activeView === 'usuarios' && (
            <UsuariosView
              apiFetch={apiFetch}
              deviceIdentity={deviceIdentity}
              setDeviceIdentity={setDeviceIdentity}
              askConfirm={askConfirm}
            />
          )}
        </main>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      <OutputPanel
        isOpen={outputPanel.isOpen}
        title={outputPanel.title}
        output={outputPanel.output}
        loading={outputPanel.loading}
        onClose={() => setOutputPanel((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

/* ============================================================================
 * 1. VISÃO GERAL (MÓDULOS E SERVIÇOS TÉCNICOS - SEM BANNER DE STATUS / BOLINHAS VERDES)
 * ============================================================================ */
function HomeView({ serverStatus, openModule, apiFetch, fetchStatus, showOutput }) {
  const [busyService, setBusyService] = useState(null);
  const running = serverStatus.runningContainers || [];

  const isContainerActive = (containerName) => {
    if (!containerName) return true;
    return running.includes(containerName);
  };

  const handleServiceToggle = async (serviceKey, action, label) => {
    setBusyService(`${serviceKey}:${action}`);
    try {
      const res = await apiFetch('/api/services', {
        method: 'POST',
        body: JSON.stringify({ service: serviceKey, action }),
      });
      await fetchStatus(true);
      if (res.output) {
        showOutput(`${label} (${action})`, res.output, false);
      }
    } catch (err) {
      showOutput(`Erro em ${label}`, err.message, false);
    } finally {
      setBusyService(null);
    }
  };

  const INFRA_MODULES = [
    {
      id: 'cockpit',
      name: 'Console Linux (Cockpit)',
      desc: 'Gerenciamento de sistema, systemd, rede e discos',
      port: 9090,
      protocol: 'https:',
      icon: 'settings_System_daydream',
      container: null,
    },
    {
      id: 'erp',
      name: 'Sistema ERP Operacional',
      desc: 'Backend FastAPI + PostgreSQL e painel administrativo',
      port: 8095,
      protocol: 'http:',
      icon: 'storefront',
      container: 'srv_erp_mercados',
      serviceKey: 'srv_erp_mercados',
    },
    {
      id: 'cups',
      name: 'Servidor de Impressão (CUPS)',
      desc: 'Filas de impressão, drivers e dispositivos USB/Rede',
      port: 631,
      protocol: 'http:',
      icon: 'print',
      container: 'cupsd',
      serviceKey: 'cups',
    },
    {
      id: 'scanner',
      name: 'Digitalização (ScanservJS)',
      desc: 'Interface web para captura de documentos e OCR',
      port: 8080,
      protocol: 'http:',
      icon: 'scanner',
      container: 'scanservjs',
      serviceKey: 'scanner',
    },
  ];

  const SANDBOX_MODULES = [
    {
      id: 'vscode',
      name: 'IDE Web (VS Code)',
      desc: 'Editor de código completo conectado ao workspace',
      port: 8443,
      protocol: 'http:',
      icon: 'code',
      sandboxRoute: '/api/sandbox/vscode',
      container: 'srv_vscode_sandbox',
      serviceKey: 'srv_vscode_sandbox',
    },
    {
      id: 'filebrowser',
      name: 'Gerenciador de Arquivos',
      desc: 'Upload, download e edição de diretórios remotos',
      port: 8089,
      protocol: 'http:',
      icon: 'folder_open',
      sandboxRoute: '/api/sandbox/filebrowser',
      container: 'srv_filebrowser',
      serviceKey: 'srv_filebrowser',
    },
    {
      id: 'terminal_tty',
      name: 'Terminal Web (TTY)',
      desc: 'Sessão interativa de shell via navegador',
      port: 7682,
      protocol: 'http:',
      icon: 'terminal',
      sandboxRoute: '/api/sandbox/terminal',
      container: 'srv_terminal_sandbox',
      serviceKey: 'srv_terminal_sandbox',
    },
    {
      id: 'neovim',
      name: 'Editor Neovim Web',
      desc: 'Ambiente de edição modal em container isolado',
      port: 7683,
      protocol: 'http:',
      icon: 'edit_document',
      sandboxRoute: '/api/sandbox/neovim',
      container: 'srv_nvim_sandbox',
      serviceKey: 'srv_nvim_sandbox',
    },
    {
      id: 'cli_agent_tty',
      name: 'Console CLI Agente',
      desc: 'Sessão dedicada de terminal para assistente CLI',
      port: 7685,
      protocol: 'http:',
      icon: 'smart_toy',
      sandboxRoute: '/api/sandbox/antigravity',
      container: 'srv_ag_sandbox',
      serviceKey: 'srv_ag_sandbox',
    },
    {
      id: 'webtop',
      name: 'Desktop Remoto (Webtop)',
      desc: 'Sessão gráfica Linux completa via navegador',
      port: 3001,
      protocol: 'https:',
      icon: 'desktop_windows',
      sandboxRoute: '/api/sandbox/webtop',
      container: 'srv_webtop_sandbox',
      serviceKey: 'srv_webtop_sandbox',
    },
    {
      id: 'kdenlive',
      name: 'Editor de Vídeo (Kdenlive)',
      desc: 'Edição e renderização de mídia remota',
      port: 3005,
      protocol: 'http:',
      icon: 'movie_edit',
      sandboxRoute: '/api/sandbox/kdenlive',
      container: 'srv_kdenlive_sandbox',
      serviceKey: 'srv_kdenlive_sandbox',
    },
    {
      id: 'steam',
      name: 'Ambiente Gráfico (Steam)',
      desc: 'Container acelerado para aplicações gráficas',
      port: 8083,
      protocol: 'http:',
      icon: 'sports_esports',
      sandboxRoute: '/api/sandbox/steam',
      container: 'srv_steam_sandbox',
      serviceKey: 'srv_steam_sandbox',
    },
  ];

  const DATA_MODULES = [
    {
      id: 'metabase',
      name: 'BI & Analytics (Metabase)',
      desc: 'Consultas SQL, relatórios e painéis analíticos',
      port: 3003,
      protocol: 'http:',
      icon: 'analytics',
      container: 'srv_metabase',
      serviceKey: 'srv_metabase',
    },
    {
      id: 'onlyoffice',
      name: 'Suíte Documental (OnlyOffice)',
      desc: 'Servidor de documentos, planilhas e apresentações',
      port: 8086,
      protocol: 'http:',
      icon: 'description',
      container: 'srv_onlyoffice',
      serviceKey: 'srv_onlyoffice',
    },
    {
      id: 'jupyter',
      name: 'Notebooks (Jupyter / Spark)',
      desc: 'Execução de scripts Python e análise de dados',
      port: 8888,
      protocol: 'http:',
      icon: 'science',
      container: 'srv_jupyter_spark',
      serviceKey: 'srv_jupyter_spark',
    },
    {
      id: 'openwebui',
      name: 'Interface LLM (Open WebUI)',
      desc: 'Cliente web para modelos locais Ollama',
      port: 3002,
      protocol: 'http:',
      icon: 'chat',
      container: 'open-webui',
      serviceKey: 'open-webui',
    },
    {
      id: 'emulator',
      name: 'Emulador Web (EmulatorJS)',
      desc: 'Execução de imagens e ROMs via navegador',
      port: 8082,
      protocol: 'http:',
      icon: 'videogame_asset',
      container: 'emulatorjs',
      serviceKey: 'emulator',
    },
  ];

  const renderModuleGrid = (title, items) => (
    <section className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((mod) => {
          const active = isContainerActive(mod.container);
          return (
            <div
              key={mod.id}
              className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center text-[var(--md-sys-color-primary)]">
                    <span className="material-symbols-outlined text-lg">{mod.icon}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    :{mod.port} • {active ? 'ATIVO' : 'PARADO'}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {mod.name}
                  </h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 line-clamp-2">
                    {mod.desc}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--md-sys-color-surface-variant)]">
                <button
                  onClick={() => openModule(mod)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">open_in_browser</span>
                  Abrir
                </button>
                <button
                  onClick={() => openModule({ ...mod, externalOnly: true })}
                  title="Abrir em nova guia"
                  className="p-1.5 rounded-xl bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] hover:opacity-90"
                >
                  <span className="material-symbols-outlined text-sm">open_in_new</span>
                </button>
                {mod.serviceKey && (
                  <button
                    disabled={busyService !== null}
                    onClick={() =>
                      handleServiceToggle(
                        mod.serviceKey,
                        active ? 'stop' : 'start',
                        mod.name
                      )
                    }
                    title={active ? 'Parar serviço' : 'Iniciar serviço'}
                    className="py-1.5 px-2.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] hover:opacity-90 disabled:opacity-50"
                  >
                    {busyService === `${mod.serviceKey}:${active ? 'stop' : 'start'}`
                      ? '...'
                      : active
                      ? 'Parar'
                      : 'Iniciar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {renderModuleGrid('Infraestrutura & Administração', INFRA_MODULES)}
      {renderModuleGrid('Ambientes de Trabalho Isolados (Sandboxes)', SANDBOX_MODULES)}
      {renderModuleGrid('Dados, BI & Produtividade', DATA_MODULES)}
    </div>
  );
}

/* ============================================================================
 * 2. GERENCIAMENTO DE CONTAINERS DOCKER
 * ============================================================================ */
function ContainersView({ apiFetch, showOutput, askConfirm, fetchGlobalStatus }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState(null);

  const loadContainers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/docker/all');
      const rawList = Array.isArray(data.containers) ? data.containers : [];
      const parsed = rawList.map((item) => {
        const name = item.Names || item.name || item.ID || 'container';
        const status = item.Status || item.State || '';
        const image = item.Image || '';
        const ports = item.Ports || '';
        const isRunning = /^Up/i.test(status) || item.State === 'running';
        return {
          raw: `${name} ${image} ${status} ${ports}`,
          name,
          image,
          status,
          ports,
          isRunning,
        };
      });
      setContainers(parsed);
    } catch (err) {
      showOutput('Erro ao listar containers', err.message, false);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showOutput]);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  const runContainerAction = async (name, op) => {
    setActionBusy(`${name}:${op}`);
    try {
      if (op === 'logs') {
        const res = await apiFetch(`/api/docker/logs?name=${encodeURIComponent(name)}`);
        showOutput(`Logs: ${name}`, res.output || 'Sem logs recentes.', false);
      } else {
        const res = await apiFetch(`/api/docker/${op}`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        await loadContainers();
        await fetchGlobalStatus(true);
        if (res.output || res.message) {
          showOutput(`Container ${name} (${op})`, res.output || res.message, false);
        }
      }
    } catch (err) {
      showOutput(`Erro em ${name} (${op})`, err.message, false);
    } finally {
      setActionBusy(null);
    }
  };

  const handleListImages = async () => {
    showOutput('Imagens Docker', '', true);
    try {
      const res = await apiFetch('/api/docker/images');
      const imgs = Array.isArray(res.images) ? res.images : [];
      const text = imgs.length
        ? imgs.map((i) => `${i.Repository}:${i.Tag}  |  ID: ${i.ID}  |  Tam: ${i.Size}`).join('\n')
        : res.output || 'Nenhuma imagem encontrada.';
      showOutput('Imagens Docker', text, false);
    } catch (err) {
      showOutput('Erro ao listar imagens', err.message, false);
    }
  };

  const filtered = containers.filter((c) => {
    if (filter === 'running' && !c.isRunning) return false;
    if (filter === 'stopped' && c.isRunning) return false;
    if (search && !c.raw.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar container por nome ou imagem..."
            className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3.5 py-2 outline-none"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3 py-2 outline-none"
          >
            <option value="all">Todos ({containers.length})</option>
            <option value="running">Em Execução ({containers.filter((c) => c.isRunning).length})</option>
            <option value="stopped">Parados ({containers.filter((c) => !c.isRunning).length})</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleListImages}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] hover:opacity-90"
          >
            Imagens Docker
          </button>
          <button
            onClick={loadContainers}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90"
          >
            Atualizar Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
          Carregando containers do servidor...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
          Nenhum container encontrado para o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((c) => (
            <div
              key={c.name}
              className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold font-mono truncate">{c.name}</h3>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono truncate mt-0.5">
                    {c.image}
                  </p>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    Status: {c.status}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--md-sys-color-surface-variant)]">
                  {c.isRunning ? 'ATIVO' : 'PARADO'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--md-sys-color-surface-variant)]">
                {!c.isRunning ? (
                  <button
                    disabled={actionBusy !== null}
                    onClick={() => runContainerAction(c.name, 'start')}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Iniciar
                  </button>
                ) : (
                  <button
                    disabled={actionBusy !== null}
                    onClick={() => runContainerAction(c.name, 'stop')}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] hover:opacity-90 disabled:opacity-50"
                  >
                    Parar
                  </button>
                )}
                <button
                  disabled={actionBusy !== null}
                  onClick={() => runContainerAction(c.name, 'restart')}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] hover:opacity-90 disabled:opacity-50"
                >
                  Reiniciar
                </button>
                <button
                  disabled={actionBusy !== null}
                  onClick={() => runContainerAction(c.name, 'logs')}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)] hover:opacity-90 disabled:opacity-50"
                >
                  Logs
                </button>
                <button
                  disabled={actionBusy !== null}
                  onClick={() =>
                    askConfirm(
                      `Remover ${c.name}`,
                      `Tem certeza que deseja remover o container "${c.name}"?`,
                      () => runContainerAction(c.name, 'rm'),
                      true
                    )
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:opacity-90 disabled:opacity-50 ml-auto"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 3. AUTOMAÇÃO & MODELOS LLM (NOMES TÉCNICOS E GENÉRICOS)
 * ============================================================================ */
function AutomationView({ apiFetch, showOutput }) {
  const [engine, setEngine] = useState('cli-agent');
  const [mode, setMode] = useState('autonomous');
  const [prompt, setPrompt] = useState('');
  const [agentOutput, setAgentOutput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);

  // Modelos e Chat
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [pullModelName, setPullModelName] = useState('');
  const [pullBusy, setPullBusy] = useState(false);

  const loadModels = useCallback(async () => {
    try {
      const data = await apiFetch('/api/ia/models');
      const lines = (data.output || '').split('\n').map((l) => l.trim()).filter(Boolean);
      const parsed = [];
      for (const line of lines.slice(1)) {
        const parts = line.split(/\s+/);
        if (parts[0]) {
          parsed.push({ name: parts[0], provider: 'ollama', size: parts[2] || 'Local' });
        }
      }
      if (Array.isArray(data.gatewayModels)) {
        for (const gm of data.gatewayModels) {
          parsed.push({ name: gm.name, provider: 'gateway', size: gm.size || 'Cloud' });
        }
      }
      setModels(parsed);
      if (parsed.length > 0 && !selectedModel) {
        setSelectedModel(parsed[0].name);
      }
    } catch (_) {}
  }, [apiFetch, selectedModel]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleRunAgent = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setAgentBusy(true);
    setAgentOutput('Executando tarefa no servidor...');
    try {
      const res = await apiFetch('/api/ia/agent', {
        method: 'POST',
        body: JSON.stringify({ engine, mode, prompt }),
      });
      setAgentOutput(res.output || 'Execução concluída.');
    } catch (err) {
      setAgentOutput(`Erro: ${err.message}`);
    } finally {
      setAgentBusy(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !selectedModel) return;
    const nextUserMsg = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, nextUserMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setChatBusy(true);

    try {
      const modelObj = models.find((m) => m.name === selectedModel);
      const res = await apiFetch('/api/ia/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: selectedModel,
          provider: modelObj?.provider || 'ollama',
          messages: updatedMessages,
        }),
      });
      if (res.message) {
        setChatMessages((prev) => [...prev, res.message]);
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Erro ao consultar modelo: ${err.message}` },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  const handlePullModel = async (e) => {
    e.preventDefault();
    if (!pullModelName.trim()) return;
    setPullBusy(true);
    try {
      const res = await apiFetch('/api/ia/pull', {
        method: 'POST',
        body: JSON.stringify({ model: pullModelName.trim() }),
      });
      setPullModelName('');
      await loadModels();
      showOutput('Download de Modelo', res.output || res.message, false);
    } catch (err) {
      showOutput('Erro ao baixar modelo', err.message, false);
    } finally {
      setPullBusy(false);
    }
  };

  const handleRemoveModel = async (modelName) => {
    try {
      const res = await apiFetch('/api/ia/remove', {
        method: 'POST',
        body: JSON.stringify({ model: modelName }),
      });
      await loadModels();
      showOutput('Modelo Removido', res.output || res.message, false);
    } catch (err) {
      showOutput('Erro ao remover modelo', err.message, false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Executor de Agente Técnico CLI */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold">Executor de Agente de Automação</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            Execução direta de instruções técnicas no host remoto
          </p>
        </div>

        <form onSubmit={handleRunAgent} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Motor de Execução
              </label>
              <select
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl px-3 py-2 outline-none"
              >
                <option value="cli-agent">Agente CLI Principal (agy)</option>
                <option value="multi-agent">Orquestrador Multi-Agente</option>
                <option value="local-llm">Inferência Local (Ollama API)</option>
                <option value="shell-interpreter">Interpretador de Shell</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Modo de Permissão
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl px-3 py-2 outline-none"
              >
                <option value="autonomous">Autônomo (Aceitar Edições)</option>
                <option value="supervised">Somente Consulta</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">
              Instrução Técnica
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva a verificação, diagnóstico ou tarefa a executar no servidor..."
              className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl p-3 outline-none resize-y"
              required
            />
          </div>

          <button
            type="submit"
            disabled={agentBusy || !prompt.trim()}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {agentBusy ? 'Processando no Servidor...' : 'Executar Instrução'}
          </button>
        </form>

        {agentOutput && (
          <div className="bg-[var(--md-sys-color-background)] border border-[var(--md-sys-color-surface-variant)] rounded-xl p-3.5 font-mono text-xs whitespace-pre-wrap max-h-72 overflow-y-auto">
            {agentOutput}
          </div>
        )}
      </div>

      {/* Console de Chat e Gerenciamento de Modelos */}
      <div className="space-y-6">
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold">Console de Inferência LLM</h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Comunicação direta com modelos locais ou gateway
              </p>
            </div>
            {chatMessages.length > 0 && (
              <button
                onClick={() => setChatMessages([])}
                className="px-2.5 py-1 rounded-lg text-xs bg-[var(--md-sys-color-surface-variant)]"
              >
                Limpar
              </button>
            )}
          </div>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3 py-2 outline-none"
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.size})
              </option>
            ))}
          </select>

          <div className="bg-[var(--md-sys-color-background)] border border-[var(--md-sys-color-surface-variant)] rounded-xl p-3 h-56 overflow-y-auto space-y-2.5 text-xs">
            {chatMessages.length === 0 ? (
              <p className="text-[var(--md-sys-color-on-surface-variant)] text-center py-16">
                Envie uma mensagem para testar ou consultar o modelo selecionado.
              </p>
            ) : (
              chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl ${
                    m.role === 'user'
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] ml-6'
                      : 'bg-[var(--md-sys-color-surface-variant)] mr-6'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase opacity-70 mb-1">
                    {m.role === 'user' ? 'Operador' : selectedModel}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Digite sua consulta técnica..."
              className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3.5 py-2.5 outline-none"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white hover:opacity-90 disabled:opacity-50"
            >
              {chatBusy ? '...' : 'Enviar'}
            </button>
          </form>
        </div>

        {/* Gerenciamento de Modelos Locais Ollama */}
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)]">
            Modelos Locais Instalados (Ollama)
          </h3>

          <form onSubmit={handlePullModel} className="flex gap-2">
            <input
              type="text"
              value={pullModelName}
              onChange={(e) => setPullModelName(e.target.value)}
              placeholder="Instalar modelo (ex: gemma4:latest, qwen2.5-coder:7b)"
              className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3.5 py-2 outline-none"
            />
            <button
              type="submit"
              disabled={pullBusy || !pullModelName.trim()}
              className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white disabled:opacity-50"
            >
              {pullBusy ? 'Baixando...' : 'Baixar'}
            </button>
          </form>

          <div className="divide-y divide-[var(--md-sys-color-surface-variant)] text-xs">
            {models
              .filter((m) => m.provider === 'ollama')
              .map((m) => (
                <div key={m.name} className="py-2 flex items-center justify-between">
                  <span className="font-mono">{m.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {m.size}
                    </span>
                    <button
                      onClick={() => handleRemoveModel(m.name)}
                      className="px-2 py-1 rounded text-[11px] bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 4. TERMINAL SSH DIRETO VIA HTTPS (ESTADO ISOLADO POR DISPOSITIVO)
 * ============================================================================ */
function TerminalView({ apiFetch, openModule, deviceId }) {
  const storageKeyCwd = `srv-term-cwd-${deviceId || 'default'}`;
  const [cwd, setCwd] = useState('~');
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKeyCwd);
    if (saved) setCwd(saved);
  }, [storageKeyCwd]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const executeCommand = async (cmdToRun) => {
    const clean = cmdToRun.trim();
    if (!clean) return;
    if (clean === 'clear') {
      setHistory([]);
      setCommand('');
      return;
    }

    setBusy(true);
    setCommand('');
    const entryId = Date.now();
    setHistory((prev) => [...prev, { id: entryId, cwd, command: clean, output: 'Executando...', exitCode: null }]);

    try {
      const res = await apiFetch('/api/terminal/exec', {
        method: 'POST',
        body: JSON.stringify({ command: clean, cwd }),
      });
      const nextCwd = res.cwd || cwd;
      setCwd(nextCwd);
      localStorage.setItem(storageKeyCwd, nextCwd);
      setHistory((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? { ...item, output: res.output, cwd: nextCwd, exitCode: res.exitCode }
            : item
        )
      );
    } catch (err) {
      setHistory((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? { ...item, output: `Erro: ${err.message}`, exitCode: 1 }
            : item
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const QUICK_COMMANDS = [
    { label: 'Status Docker', cmd: 'sudo docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"' },
    { label: 'Uso de Disco', cmd: 'df -h' },
    { label: 'Memória RAM', cmd: 'free -h' },
    { label: 'Portas Ativas', cmd: 'ss -tlnp' },
    { label: 'Últimos Logs Auditoria', cmd: 'tail -n 20 ~/dashboard-audit.log' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_COMMANDS.map((q) => (
            <button
              key={q.label}
              disabled={busy}
              onClick={() => executeCommand(q.cmd)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono bg-[var(--md-sys-color-surface-variant)] hover:opacity-90 disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistory([])}
            className="px-3 py-1.5 rounded-xl text-xs bg-[var(--md-sys-color-surface-variant)]"
          >
            Limpar Console
          </button>
          <button
            onClick={() =>
              openModule({
                name: 'Terminal Web (TTY)',
                port: 7682,
                protocol: 'http:',
                sandboxRoute: '/api/sandbox/terminal',
              })
            }
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white"
          >
            Abrir TTY Interativo (:7682)
          </button>
        </div>
      </div>

      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl overflow-hidden flex flex-col h-[62vh]">
        <div className="px-4 py-2 border-b border-[var(--md-sys-color-surface-variant)] text-xs font-mono text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-between">
          <span>Diretório atual neste dispositivo: {cwd}</span>
          <span>SSH HTTPS Exec</span>
        </div>

        <div className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-3 bg-[var(--md-sys-color-background)]">
          {history.length === 0 ? (
            <div className="text-[var(--md-sys-color-on-surface-variant)]">
              Digite qualquer comando Linux abaixo. Cada dispositivo mantém seu próprio diretório de trabalho (cwd) e histórico.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="text-[var(--md-sys-color-primary)] font-semibold">
                  [{item.cwd}]$ {item.command}
                </div>
                <pre className="whitespace-pre-wrap break-words text-[var(--md-sys-color-on-surface)] pl-2 border-l-2 border-[var(--md-sys-color-surface-variant)]">
                  {item.output}
                </pre>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            executeCommand(command);
          }}
          className="p-3 border-t border-[var(--md-sys-color-surface-variant)] flex items-center gap-2 bg-[var(--md-sys-color-surface)]"
        >
          <span className="font-mono text-xs text-[var(--md-sys-color-primary)] font-bold">
            $
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Digite um comando shell (ex: ls -la, docker stats --no-stream, git status)..."
            className="flex-1 bg-transparent font-mono text-xs outline-none"
            disabled={busy}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !command.trim()}
            className="px-4 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white disabled:opacity-50"
          >
            {busy ? 'Executando...' : 'Executar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 5. PROCESSOS, SERVIÇOS SYSTEMD & REDE
 * ============================================================================ */
function SistemaView({ apiFetch, showOutput, askConfirm, sshOverride, setSshOverride, fetchGlobalStatus }) {
  const [sysData, setSysData] = useState({
    processes: [],
    services: [],
    listeningPorts: [],
    activeTunnels: [],
    host: '',
    port: 22,
    route: '',
  });
  const [loading, setLoading] = useState(true);
  const [overrideInput, setOverrideInput] = useState(sshOverride || '');

  const loadControlData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/system/control');
      setSysData({
        processes: data.processes || [],
        services: data.services || [],
        listeningPorts: data.listeningPorts || [],
        activeTunnels: data.activeTunnels || [],
        host: data.host || '',
        port: data.port || 22,
        route: data.route || '',
      });
    } catch (err) {
      showOutput('Erro ao carregar controle do sistema', err.message, false);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showOutput]);

  useEffect(() => {
    loadControlData();
  }, [loadControlData]);

  const handleServiceOp = async (service, op) => {
    try {
      const res = await apiFetch('/api/system/control', {
        method: 'POST',
        body: JSON.stringify({ action: 'service', service, op }),
      });
      await loadControlData();
      showOutput(`Systemd: ${service}`, res.output || res.message, false);
    } catch (err) {
      showOutput(`Erro em ${service}`, err.message, false);
    }
  };

  const handleKillProcess = (pid, comm) => {
    askConfirm(
      `Finalizar Processo PID ${pid}`,
      `Deseja encerrar o processo "${comm}" (PID ${pid})?`,
      async () => {
        try {
          const res = await apiFetch('/api/system/control', {
            method: 'POST',
            body: JSON.stringify({ action: 'kill_process', pid, signal: '9' }),
          });
          await loadControlData();
          showOutput(`Processo ${pid}`, res.output || res.message, false);
        } catch (err) {
          showOutput(`Erro ao finalizar PID ${pid}`, err.message, false);
        }
      },
      true
    );
  };

  const handleSaveOverride = (e) => {
    e.preventDefault();
    const clean = overrideInput.trim();
    setSshOverride(clean);
    if (clean) {
      localStorage.setItem('srv-ssh-override', clean);
    } else {
      localStorage.removeItem('srv-ssh-override');
    }
    fetchGlobalStatus(true);
    loadControlData();
  };

  const handleVpnStatus = async () => {
    showOutput('Status da Rede / Tailscale VPN', '', true);
    try {
      const res = await apiFetch('/api/vpn/status');
      showOutput('Status da Rede / Tailscale VPN', res.output || 'Sem saída.', false);
    } catch (err) {
      showOutput('Erro ao consultar VPN', err.message, false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuração de Rota SSH e Diagnóstico de Rede */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">Roteamento SSH & Conectividade</h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">
              Endpoint ativo: {sysData.host || 'padrão'}:{sysData.port || 22} ({sysData.route || 'auto'})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleVpnStatus}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)]"
            >
              Verificar Tailscale VPN
            </button>
            <button
              onClick={loadControlData}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white"
            >
              Atualizar Dados
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveOverride} className="flex flex-wrap gap-2 pt-2">
          <input
            type="text"
            value={overrideInput}
            onChange={(e) => setOverrideInput(e.target.value)}
            placeholder="Override de Host:Porta SSH (ex: bore.pub:42204 ou 192.168.15.109:22) — deixe vazio para automático"
            className="flex-1 min-w-[240px] bg-[var(--md-sys-color-surface-variant)] text-xs font-mono rounded-xl px-3.5 py-2 outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white"
          >
            Aplicar Rota
          </button>
        </form>
      </div>

      {/* Serviços Systemd */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold">Serviços do Sistema (systemd)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sysData.services.map((srv) => (
            <div
              key={srv.name}
              className="border border-[var(--md-sys-color-surface-variant)] rounded-xl p-3.5 flex items-center justify-between gap-2"
            >
              <div>
                <div className="text-xs font-bold font-mono">{srv.name}</div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] uppercase">
                  Estado: {srv.state}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleServiceOp(srv.name, srv.active ? 'restart' : 'start')}
                  className="px-2.5 py-1 rounded-lg text-xs bg-[var(--md-sys-color-primary)] text-white"
                >
                  {srv.active ? 'Reiniciar' : 'Iniciar'}
                </button>
                {srv.active && srv.name !== 'ssh' && (
                  <button
                    onClick={() => handleServiceOp(srv.name, 'stop')}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--md-sys-color-surface-variant)]"
                  >
                    Parar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela de Processos */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold">Processos com Maior Consumo (CPU / RAM)</h2>
        {loading ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Carregando processos...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                  <th className="py-2 pr-3">PID</th>
                  <th className="py-2 pr-3">USUÁRIO</th>
                  <th className="py-2 pr-3">%CPU</th>
                  <th className="py-2 pr-3">%MEM</th>
                  <th className="py-2 pr-3">TEMPO</th>
                  <th className="py-2 pr-3">COMANDO</th>
                  <th className="py-2 text-right">AÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                {sysData.processes.map((p) => (
                  <tr key={p.pid}>
                    <td className="py-2 pr-3 font-bold">{p.pid}</td>
                    <td className="py-2 pr-3">{p.user}</td>
                    <td className="py-2 pr-3">{p.cpu}%</td>
                    <td className="py-2 pr-3">{p.mem}%</td>
                    <td className="py-2 pr-3">{p.elapsed}</td>
                    <td className="py-2 pr-3 truncate max-w-[220px]">{p.command}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleKillProcess(p.pid, p.command)}
                        className="px-2 py-0.5 rounded bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] text-[11px]"
                      >
                        Encerrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Portas em Escuta e Túneis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase text-[var(--md-sys-color-on-surface-variant)]">
            Portas TCP em Escuta
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {sysData.listeningPorts.map((port) => (
              <span
                key={port}
                className="px-2 py-1 rounded-lg text-xs font-mono bg-[var(--md-sys-color-surface-variant)]"
              >
                {port}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase text-[var(--md-sys-color-on-surface-variant)]">
            Túneis Ativos Detectados
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {sysData.activeTunnels.length === 0 ? (
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                Nenhum túnel público secundário listado.
              </span>
            ) : (
              sysData.activeTunnels.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono bg-[var(--md-sys-color-surface-variant)]"
                >
                  {t}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. STORAGE & BACKUP
 * ============================================================================ */
function BackupView({ serverStatus, apiFetch, showOutput }) {
  const disks = serverStatus.disks || [];

  const runBackupAction = async (endpoint, title) => {
    showOutput(title, '', true);
    try {
      const res = await apiFetch(endpoint, { method: editMethod(endpoint) });
      const text =
        res.log !== undefined
          ? `Processo em execução: ${res.running ? 'SIM' : 'NÃO'}\n\n${res.log || 'Sem log disponível.'}`
          : res.output || res.message || 'Operação concluída.';
      showOutput(title, text, false);
    } catch (err) {
      showOutput(`Erro: ${title}`, err.message, false);
    }
  };

  function editMethod(ep) {
    return ep.endsWith('/status') || ep.endsWith('/storage') ? 'GET' : 'POST';
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">Partições e Volumes Montados</h2>
          <button
            onClick={() => runBackupAction('/api/backup/storage', 'Relatório Detalhado de Storage')}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)]"
          >
            Inspecionar Blocos (df / lsblk)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {disks.map((d) => (
            <div
              key={d.mount}
              className="border border-[var(--md-sys-color-surface-variant)] rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold">{d.mount}</span>
                <span>{d.filesystem}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-[var(--md-sys-color-surface-variant)] overflow-hidden">
                <div
                  className="h-full bg-[var(--md-sys-color-primary)]"
                  style={{ width: `${Math.min(100, d.percent || 0)}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-[var(--md-sys-color-on-surface-variant)] font-mono">
                <span>Usado: {d.used} / {d.total}</span>
                <span>Livre: {d.available} ({d.percent}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold">Rotinas de Backup & Sincronização</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => runBackupAction('/api/backup/status', 'Status dos Backups')}
            className="p-4 rounded-xl border border-[var(--md-sys-color-surface-variant)] text-left hover:bg-[var(--md-sys-color-surface-variant)] transition-colors space-y-1"
          >
            <div className="text-xs font-bold">Verificar Logs de Backup</div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Consulta histórico e arquivos recentes de backup
            </p>
          </button>
          <button
            onClick={() => runBackupAction('/api/backup/full', 'Backup Completo do Sistema')}
            className="p-4 rounded-xl border border-[var(--md-sys-color-surface-variant)] text-left hover:bg-[var(--md-sys-color-surface-variant)] transition-colors space-y-1"
          >
            <div className="text-xs font-bold">Executar Backup Completo</div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Inicia rotina de snapshot dos diretórios principais
            </p>
          </button>
          <button
            onClick={() => runBackupAction('/api/backup/photos', 'Sincronização de Mídia')}
            className="p-4 rounded-xl border border-[var(--md-sys-color-surface-variant)] text-left hover:bg-[var(--md-sys-color-surface-variant)] transition-colors space-y-1"
          >
            <div className="text-xs font-bold">Sincronizar Mídia e Documentos</div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Executa cópia incremental de arquivos de mídia
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * 7. MANUTENÇÃO E ENERGIA
 * ============================================================================ */
function ManutencaoView({ apiFetch, showOutput, askConfirm }) {
  const execMaint = async (endpoint, title) => {
    showOutput(title, '', true);
    try {
      const res = await apiFetch(endpoint, { method: 'POST' });
      showOutput(title, res.output || res.message || 'Concluído.', false);
    } catch (err) {
      showOutput(`Erro: ${title}`, err.message, false);
    }
  };

  const ACTIONS = [
    {
      title: 'Atualizar Pacotes do Sistema (APT)',
      desc: 'Executa apt-get update && apt-get upgrade -y de forma não-interativa',
      endpoint: '/api/maintenance/update',
      danger: false,
    },
    {
      title: 'Limpeza de Cache e Imagens Órfãs',
      desc: 'Executa apt autoremove, journalctl vacuum e limpeza de recursos temporários',
      endpoint: '/api/maintenance/clean',
      danger: false,
    },
    {
      title: 'Reiniciar Daemon Docker',
      desc: 'Reinicia o serviço systemd do Docker e recarrega containers ativos',
      endpoint: '/api/docker/restart-service',
      danger: true,
    },
    {
      title: 'Alternar Próximo Boot para Windows',
      desc: 'Configura grub-reboot para inicializar a partição Windows no próximo reinício',
      endpoint: '/api/maintenance/windows',
      danger: true,
    },
    {
      title: 'Enviar Pacote Wake-on-LAN (WoL)',
      desc: 'Aciona placa de rede local via Magic Packet',
      endpoint: '/api/power/wol',
      danger: false,
    },
    {
      title: 'Reiniciar Servidor (Reboot)',
      desc: 'Reinicia imediatamente o sistema operacional do servidor',
      endpoint: '/api/power/reboot',
      danger: true,
    },
    {
      title: 'Desligar Servidor (Shutdown)',
      desc: 'Encerra todos os serviços e desliga a máquina física',
      endpoint: '/api/power/shutdown',
      danger: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ACTIONS.map((item) => (
        <div
          key={item.endpoint}
          className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 flex flex-col justify-between gap-4"
        >
          <div>
            <h3 className="text-sm font-bold">{item.title}</h3>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
              {item.desc}
            </p>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() =>
                item.danger
                  ? askConfirm(
                      item.title,
                      `Confirma a execução de "${item.title}" no servidor?`,
                      () => execMaint(item.endpoint, item.title),
                      true
                    )
                  : execMaint(item.endpoint, item.title)
              }
              className={`px-4 py-2 rounded-xl text-xs font-medium ${
                item.danger
                  ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
                  : 'bg-[var(--md-sys-color-primary)] text-white'
              }`}
            >
              Executar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
 * 8. LOGS DE AUDITORIA NO SERVIDOR (TEMPO REAL + FILTROS + EXPORTAÇÃO)
 * ============================================================================ */
function LogsView({ apiFetch, deviceIdentity, askConfirm }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState('all');
  const [deviceScope, setDeviceScope] = useState('all');
  const [search, setSearch] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '200',
        level,
        search,
        deviceId: deviceScope === 'current' ? deviceIdentity.deviceId : 'all',
      });
      const data = await apiFetch(`/api/logs?${params.toString()}`);
      setLogs(data.logs || []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [apiFetch, level, search, deviceScope, deviceIdentity.deviceId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClearLogs = () => {
    askConfirm(
      'Limpar Logs de Auditoria',
      'Deseja limpar o arquivo ~/dashboard-audit.log no servidor e o buffer de auditoria?',
      async () => {
        await apiFetch('/api/logs', { method: 'DELETE' });
        await loadLogs();
      },
      true
    );
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `srv-audit-logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar rota, comando, usuário, IP ou dispositivo..."
            className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3.5 py-2 outline-none"
          />
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3 py-2 outline-none"
          >
            <option value="all">Todos os Níveis</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
          <select
            value={deviceScope}
            onChange={(e) => setDeviceScope(e.target.value)}
            className="bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3 py-2 outline-none"
          >
            <option value="all">Todos os Dispositivos</option>
            <option value="current">Apenas Este Dispositivo</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)]"
          >
            Exportar JSON
          </button>
          <button
            onClick={handleClearLogs}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
          >
            Limpar Logs
          </button>
          <button
            onClick={loadLogs}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--md-sys-color-surface-variant)] flex items-center justify-between text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">
          <span>Arquivo persistente no servidor: ~/dashboard-audit.log</span>
          <span>Registros carregados: {logs.length}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            Carregando registros de auditoria do servidor...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
            Nenhum evento encontrado para os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="sticky top-0 bg-[var(--md-sys-color-surface)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                <tr>
                  <th className="py-2.5 px-3">DATA/HORA</th>
                  <th className="py-2.5 px-3">NÍVEL</th>
                  <th className="py-2.5 px-3">DISPOSITIVO</th>
                  <th className="py-2.5 px-3">USUÁRIO / IP</th>
                  <th className="py-2.5 px-3">EVENTO / ROTA</th>
                  <th className="py-2.5 px-3">DETALHES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                {logs.map((entry, idx) => (
                  <tr key={entry.id || idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/40">
                    <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          entry.level === 'error'
                            ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
                            : 'bg-[var(--md-sys-color-surface-variant)]'
                        }`}
                      >
                        {entry.level || 'info'}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div>{entry.deviceName || '-'}</div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        {entry.deviceId || ''}
                      </div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div>{entry.user || 'admin'}</div>
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        {entry.ip || ''}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold">
                        {entry.route ? `${entry.method || ''} ${entry.route}` : entry.message}
                      </div>
                      {entry.responseTime && (
                        <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                          Status {entry.status || 200} • {entry.responseTime}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 max-w-md truncate text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      {entry.error ||
                        entry.command ||
                        entry.url ||
                        entry.service ||
                        entry.promptPreview ||
                        entry.result ||
                        '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 9. SESSÕES MULTI-DISPOSITIVO & CONTAS DE USUÁRIO
 * ============================================================================ */
function UsuariosView({ apiFetch, deviceIdentity, setDeviceIdentity, askConfirm }) {
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edição do dispositivo atual
  const [deviceNameInput, setDeviceNameInput] = useState(deviceIdentity.deviceName || '');
  const [deviceSavedMsg, setDeviceSavedMsg] = useState('');

  // Formulário de usuário
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [userMsg, setUserMsg] = useState('');

  const loadUsersAndSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/users');
      setUsers(data.users || []);
      setSessions(data.sessions || []);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    setDeviceNameInput(deviceIdentity.deviceName || '');
    loadUsersAndSessions();
  }, [deviceIdentity.deviceName, loadUsersAndSessions]);

  const handleUpdateDeviceName = async (e) => {
    e.preventDefault();
    const clean = deviceNameInput.trim();
    if (!clean) return;
    localStorage.setItem('srv-device-name', clean);
    setDeviceIdentity((prev) => ({ ...prev, deviceName: clean }));
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        action: 'update_device',
        deviceId: deviceIdentity.deviceId,
        deviceName: clean,
      }),
    });
    setDeviceSavedMsg('Identificação atualizada.');
    setTimeout(() => setDeviceSavedMsg(''), 3000);
    loadUsersAndSessions();
  };

  const handleRevokeSession = (session) => {
    askConfirm(
      'Encerrar Sessão do Dispositivo',
      `Deseja desconectar imediatamente o dispositivo "${session.deviceName}" (${session.ip})?`,
      async () => {
        await apiFetch(`/api/users?sessionId=${encodeURIComponent(session.deviceId)}`, {
          method: 'DELETE',
        });
        loadUsersAndSessions();
      },
      true
    );
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;
    setUserMsg('');
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      });
      setNewUsername('');
      setNewPassword('');
      setUserMsg(res.updated ? 'Senha/perfil atualizado com sucesso.' : 'Usuário cadastrado com sucesso.');
      loadUsersAndSessions();
    } catch (err) {
      setUserMsg(`Erro: ${err.message}`);
    }
  };

  const handleDeleteUser = (username) => {
    askConfirm(
      `Excluir Usuário ${username}`,
      `Confirma a exclusão da conta "${username}"?`,
      async () => {
        await apiFetch(`/api/users?username=${encodeURIComponent(username)}`, {
          method: 'DELETE',
        });
        loadUsersAndSessions();
      },
      true
    );
  };

  return (
    <div className="space-y-6">
      {/* Identificação deste Aparelho */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold">Identificação Deste Aparelho</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-mono">
            ID Único de Sessão: {deviceIdentity.deviceId}
          </p>
        </div>
        <form onSubmit={handleUpdateDeviceName} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={deviceNameInput}
            onChange={(e) => setDeviceNameInput(e.target.value)}
            placeholder="Nome técnico deste aparelho (ex: Notebook Rodrigo, Celular Android)"
            className="flex-1 min-w-[240px] bg-[var(--md-sys-color-surface-variant)] text-xs rounded-xl px-3.5 py-2 outline-none"
            required
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[var(--md-sys-color-primary)] text-white"
          >
            Salvar Nome do Aparelho
          </button>
          {deviceSavedMsg && (
            <span className="text-xs text-[var(--md-sys-color-primary)] font-medium">
              {deviceSavedMsg}
            </span>
          )}
        </form>
      </div>

      {/* Lista de Aparelhos Conectados Simultaneamente */}
      <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Aparelhos & Sessões Simultâneas</h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Cada aparelho opera de forma independente sem interromper os demais
            </p>
          </div>
          <button
            onClick={loadUsersAndSessions}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--md-sys-color-surface-variant)]"
          >
            Atualizar Sessões
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Carregando sessões...</p>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            Nenhuma sessão registrada no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sessions.map((s) => {
              const isCurrent = s.deviceId === deviceIdentity.deviceId;
              return (
                <div
                  key={s.deviceId}
                  className="border border-[var(--md-sys-color-surface-variant)] rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">
                        {s.deviceName} {isCurrent ? '(Este Aparelho)' : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--md-sys-color-surface-variant)]">
                        {s.online ? 'ONLINE' : `INATIVO (${s.idleSeconds}s)`}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                      ID: {s.deviceId} • Usuário: {s.username} • IP: {s.ip}
                    </div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                      Módulo ativo: {s.activeApp || 'Painel Principal'} • Última atividade:{' '}
                      {s.lastSeen ? new Date(s.lastSeen).toLocaleTimeString('pt-BR') : '-'}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRevokeSession(s)}
                      className="px-3 py-1 rounded-lg text-xs bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                    >
                      Revogar Acesso deste Aparelho
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gerenciamento de Contas de Usuário */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold">Adicionar ou Atualizar Conta de Usuário</h2>
          <form onSubmit={handleSaveUser} className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Nome de Usuário
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Ex: operador1, rodrigo, admin"
                className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl px-3.5 py-2.5 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Senha
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha de acesso"
                className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl px-3.5 py-2.5 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)] mb-1">
                Perfil Técnico
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-[var(--md-sys-color-surface-variant)] rounded-xl px-3.5 py-2.5 outline-none"
              >
                <option value="admin">Administrador (Acesso Total)</option>
                <option value="operator">Operador Técnico</option>
              </select>
            </div>
            {userMsg && (
              <div className="text-xs font-medium text-[var(--md-sys-color-primary)]">
                {userMsg}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl font-medium bg-[var(--md-sys-color-primary)] text-white"
            >
              Salvar Credenciais
            </button>
          </form>
        </div>

        <div className="bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold">Contas Cadastradas</h2>
          <div className="divide-y divide-[var(--md-sys-color-surface-variant)] text-xs">
            {users.map((u) => (
              <div key={u.username} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-bold font-mono">{u.username}</div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    Perfil: {u.role || 'admin'} • Aparelhos online: {u.activeSessions || 0}
                  </div>
                </div>
                {u.username !== 'admin' && (
                  <button
                    onClick={() => handleDeleteUser(u.username)}
                    className="px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
                  >
                    Excluir
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
