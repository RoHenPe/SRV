'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ─── UTILS ──────────────────────────────────────────────────────────────────
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

// ─── TOAST HOOK & COMPONENT ─────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-3 rounded-xl border border-[var(--md-sys-color-surface-variant)] animate-fade-in ${
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

// ─── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { toasts, addToast, removeToast } = useToast();
  
  const [serverStatus, setServerStatus] = useState(null);
  const [theme, setTheme] = useState('light');
  const [authValid, setAuthValid] = useState(false);
  const [activeTab, setActiveTab] = useState('home'); // home, docker, ia, backup, users, maintenance, or app config
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States for active iframe app
  const [activeApp, setActiveApp] = useState(null);
  const [iframeUrl, setIframeUrl] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState('');

  // Sandbox Applications definitions
  const apps = [
    { id: 'vscode', name: 'VS Code', icon: 'code', type: 'sandbox', port: 8443 },
    { id: 'webtop', name: 'Webtop', icon: 'desktop_windows', type: 'sandbox', port: 3000 },
    { id: 'steam', name: 'Steam', icon: 'sports_esports', type: 'sandbox', port: 8083 },
    { id: 'filebrowser', name: 'Arquivos', icon: 'folder_open', type: 'sandbox', port: 8089 },
    { id: 'kdenlive', name: 'Kdenlive', icon: 'movie', type: 'sandbox', port: 3005 },
    { id: 'terminal', name: 'Terminal Sandbox', icon: 'terminal', type: 'sandbox', port: 7682 },
    { id: 'ttyd', name: 'Console Real', icon: 'wysiwyg', type: 'service', serviceName: 'ttyd', port: 7681 },
    { id: 'cockpit', name: 'Cockpit', icon: 'web', type: 'static', port: 9090, protocol: 'https:' },
    { id: 'cups', name: 'Impressora', icon: 'print', type: 'service', serviceName: 'cups', port: 631 },
    { id: 'scanner', name: 'Scanner', icon: 'document_scanner', type: 'service', serviceName: 'scanner', port: 8080 },
    { id: 'metabase', name: 'BI Metabase', icon: 'analytics', type: 'service', serviceName: 'portal', port: 3003 },
    { id: 'jupyter', name: 'Jupyter Spark', icon: 'science', type: 'service', serviceName: 'portal', port: 8888 },
    { id: 'onlyoffice', name: 'Documentos', icon: 'description', type: 'service', serviceName: 'portal', port: 8086, path: '/example' },
    { id: 'jarvis', name: 'Jarvis', icon: 'smart_toy', type: 'service', serviceName: 'jarvis', port: 3010 }
  ];

  // Auth check
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
        localStorage.removeItem('dashboard-token');
        window.location.href = '/login';
      }
    };

    validateAuth();
  }, []);

  // Theme loader
  useEffect(() => {
    const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
    setTheme(savedTheme);
    const root = document.documentElement;
    if (savedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('dashboard-theme', nextTheme);
    const root = document.documentElement;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  // Status fetcher
  const fetchStatus = useCallback(() => {
    apiFetch('/api/status')
      .then((data) => {
        if (data.ok) {
          setServerStatus(data);
        } else {
          setServerStatus({ online: false });
        }
      })
      .catch(() => setServerStatus({ online: false }));
  }, []);

  useEffect(() => {
    if (!authValid) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [authValid, fetchStatus]);

  const handleLogout = () => {
    localStorage.removeItem('dashboard-token');
    window.location.href = '/login';
  };

  // Sandbox/Service Launcher
  const selectApp = async (app) => {
    setActiveTab('app');
    setActiveApp(app);
    setIframeUrl('');
    setMobileMenuOpen(false);

    const host = window.location.hostname;
    const protocol = app.protocol || 'http:';
    const path = app.path || '';
    const targetUrl = `${protocol}//${host}:${app.port}${path}`;

    // Helper checking if a container name is running
    const isContainerRunning = (name) => {
      if (!serverStatus?.runningContainers) return false;
      return serverStatus.runningContainers.some(c => 
        c.toLowerCase() === name.toLowerCase() || c.toLowerCase().includes(name.toLowerCase())
      );
    };

    // If it's a sandbox, start/check it
    if (app.type === 'sandbox') {
      // Map app id to container name
      let containerName = `srv_${app.id}_sandbox`;
      if (app.id === 'filebrowser') containerName = 'srv_filebrowser';

      if (isContainerRunning(containerName)) {
        setIframeUrl(targetUrl);
        return;
      }

      setLaunching(true);
      setLaunchMessage(`Iniciando contêiner para ${app.name}...`);
      try {
        const res = await apiFetch(`/api/sandbox/${app.id}`, { method: 'POST' });
        if (res.ok) {
          addToast(`${app.name} iniciado!`, 'success');
          // Wait 5 seconds for initialization
          setTimeout(() => {
            setIframeUrl(targetUrl);
            setLaunching(false);
            fetchStatus();
          }, 5000);
        } else {
          addToast(res.error || 'Erro ao iniciar aplicativo.', 'error');
          setLaunching(false);
          setActiveTab('home');
        }
      } catch {
        addToast('Erro de conexão.', 'error');
        setLaunching(false);
        setActiveTab('home');
      }
    } 
    // If it's a docker compose service, verify if it's running
    else if (app.type === 'service') {
      let isRunning = false;
      if (app.id === 'jarvis') isRunning = isContainerRunning('open-webui');
      else if (app.id === 'cups') isRunning = isContainerRunning('cupsd');
      else if (app.id === 'scanner') isRunning = isContainerRunning('scanservjs');
      else if (app.id === 'ttyd') isRunning = isContainerRunning('srv_dashboard');
      else if (app.id === 'metabase') isRunning = isContainerRunning('srv_metabase');
      else if (app.id === 'jupyter') isRunning = isContainerRunning('srv_jupyter_spark');
      else if (app.id === 'onlyoffice') isRunning = isContainerRunning('srv_onlyoffice');

      if (isRunning) {
        setIframeUrl(targetUrl);
      } else {
        // If not running, prompt user to start service
        if (window.confirm(`O serviço ${app.name} não está ativo. Deseja iniciá-lo agora?`)) {
          setLaunching(true);
          setLaunchMessage(`Iniciando serviço ${app.name}...`);
          try {
            const res = await apiFetch('/api/services', {
              method: 'POST',
              body: JSON.stringify({ service: app.serviceName, action: 'start' })
            });
            if (res.ok) {
              addToast(`Serviço ${app.name} iniciado!`, 'success');
              setTimeout(() => {
                setIframeUrl(targetUrl);
                setLaunching(false);
                fetchStatus();
              }, 6000);
            } else {
              addToast(res.error || 'Erro ao iniciar serviço.', 'error');
              setLaunching(false);
              setActiveTab('home');
            }
          } catch {
            addToast('Erro de conexão.', 'error');
            setLaunching(false);
            setActiveTab('home');
          }
        } else {
          setActiveTab('home');
        }
      }
    } 
    // Static app
    else {
      setIframeUrl(targetUrl);
    }
  };

  const closeActiveApp = () => {
    setActiveTab('home');
    setActiveApp(null);
    setIframeUrl('');
  };

  const reloadIframe = () => {
    const prev = iframeUrl;
    setIframeUrl('');
    setTimeout(() => setIframeUrl(prev), 100);
  };

  const stopActiveAppContainer = async () => {
    if (!activeApp) return;
    if (!window.confirm(`Deseja realmente parar o contêiner do aplicativo ${activeApp.name}?`)) return;

    setLaunching(true);
    setLaunchMessage(`Parando ${activeApp.name}...`);
    try {
      let endpoint = '';
      let body = {};
      
      if (activeApp.type === 'sandbox') {
        endpoint = '/api/docker/stop';
        let name = `srv_${activeApp.id}_sandbox`;
        if (activeApp.id === 'filebrowser') name = 'srv_filebrowser';
        body = { name };
      } else if (activeApp.type === 'service') {
        endpoint = '/api/services';
        body = { service: activeApp.serviceName, action: 'stop' };
      }

      if (endpoint) {
        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify(body)
        });
        if (res.ok) {
          addToast(`Aplicativo ${activeApp.name} parado.`, 'success');
          closeActiveApp();
          fetchStatus();
        } else {
          addToast(res.error || 'Erro ao parar aplicativo.', 'error');
        }
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setLaunching(false);
  };

  if (!authValid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--md-sys-color-background)]">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-4xl text-[var(--md-sys-color-primary)]">
            autorenew
          </span>
          <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            Validando acesso...
          </span>
        </div>
      </div>
    );
  }

  const isOnline = serverStatus?.online;
  const systemInfo = isOnline ? parseUptime(serverStatus?.output) : null;

  return (
    <div className="flex h-screen bg-[var(--md-sys-color-background)] overflow-hidden text-[var(--md-sys-color-on-background)] relative">
      {/* ─── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside className={`border-r border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between flex-shrink-0 z-40 transition-all duration-200 ${
        mobileMenuOpen ? 'fixed inset-y-0 left-0 w-64' : 'hidden md:flex w-64'
      }`}>
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Brand header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--md-sys-color-surface-variant)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center">
                <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-lg icon-filled">dns</span>
              </div>
              <span className="font-bold tracking-tight text-sm google-sans">Painel</span>
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-[var(--md-sys-color-on-surface-variant)]">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Navigation Menu */}
          <div className="px-3 py-4 space-y-6">
            <div className="space-y-1">
              <span className="px-4 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] tracking-wider uppercase block mb-2">Sistema</span>
              {[
                { id: 'home', name: 'Resumo', icon: 'home' },
                { id: 'docker', name: 'Docker', icon: 'view_in_ar' },
                { id: 'ia', name: 'IA Hub', icon: 'psychology' },
                { id: 'backup', name: 'Backup & Discos', icon: 'cloud_sync' },
                { id: 'users', name: 'Usuários', icon: 'group' },
                { id: 'maintenance', name: 'Manutenção & VPN', icon: 'build' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                      : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                  <span>{tab.name}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <span className="px-4 text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] tracking-wider uppercase block mb-2">Aplicações</span>
              <div className="grid grid-cols-2 gap-1 px-1">
                {apps.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => selectApp(app)}
                    title={app.name}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all border ${
                      activeTab === 'app' && activeApp?.id === app.id
                        ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                        : 'border-transparent text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg mb-1">{app.icon}</span>
                    <span className="text-[10px] font-medium truncate w-full text-center">{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-[var(--md-sys-color-surface-variant)] flex items-center justify-between">
          <button onClick={toggleTheme} className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
            <span className="material-symbols-outlined text-base">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          <button onClick={handleLogout} className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] flex items-center justify-center">
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </aside>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />
      )}

      {/* ─── MAIN WORKSPACE ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-14 border-b border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="md:hidden text-[var(--md-sys-color-on-surface-variant)]">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-sm font-semibold google-sans capitalize">
              {activeTab === 'app' ? activeApp?.name : activeTab}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* System Info Badges */}
            {systemInfo && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[var(--md-sys-color-surface-variant)] px-2.5 py-1 rounded-full text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  <span>{systemInfo.uptime}</span>
                </div>
                <div className="flex items-center gap-1 bg-[var(--md-sys-color-surface-variant)] px-2.5 py-1 rounded-full text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="material-symbols-outlined text-[12px]">analytics</span>
                  <span>{systemInfo.load}</span>
                </div>
              </div>
            )}

            {/* Server Online Status */}
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold ${
              isOnline === false 
                ? 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]' 
                : isOnline 
                ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]' 
                : 'bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)]'
            }`}>
              <span className="material-symbols-outlined text-[10px] icon-filled">
                {isOnline === false ? 'offline_bolt' : isOnline ? 'cloud_done' : 'sync'}
              </span>
              <span>{isOnline === false ? 'Offline' : isOnline ? 'Online' : 'Checking'}</span>
            </div>
          </div>
        </header>

        {/* Content Pane */}
        <main className="flex-1 overflow-y-auto p-6 relative">
          {launching && (
            <div className="absolute inset-0 bg-[var(--md-sys-color-background)]/85 z-30 flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined animate-spin text-3xl text-[var(--md-sys-color-primary)]">
                autorenew
              </span>
              <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] font-medium">
                {launchMessage}
              </span>
            </div>
          )}

          {activeTab === 'home' && <HomeView apps={apps} selectApp={selectApp} serverStatus={serverStatus} addToast={addToast} fetchStatus={fetchStatus} />}
          {activeTab === 'docker' && <DockerView addToast={addToast} />}
          {activeTab === 'ia' && <IaHubView addToast={addToast} />}
          {activeTab === 'backup' && <BackupView serverStatus={serverStatus} addToast={addToast} />}
          {activeTab === 'users' && <UsersView addToast={addToast} />}
          {activeTab === 'maintenance' && <MaintenanceView serverStatus={serverStatus} addToast={addToast} fetchStatus={fetchStatus} />}
          
          {activeTab === 'app' && activeApp && (
            <div className="w-full h-full flex flex-col bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] rounded-2xl overflow-hidden">
              {/* App Iframe Controls */}
              <div className="h-10 px-4 bg-[var(--md-sys-color-surface-variant)] flex items-center justify-between border-b border-[var(--md-sys-color-surface-variant)] flex-shrink-0 text-xs">
                <span className="font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate max-w-md">
                  {iframeUrl || 'Carregando...'}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={reloadIframe} title="Recarregar aplicativo" className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                  </button>
                  <button onClick={stopActiveAppContainer} title="Parar contêiner" className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-error)]">
                    <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                  </button>
                  <button onClick={closeActiveApp} title="Fechar e voltar" className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-[var(--md-sys-color-background)]">
                {iframeUrl ? (
                  <iframe src={iframeUrl} className="w-full h-full border-0" allow="clipboard-read; clipboard-write; fullscreen" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    Aguardando inicialização do aplicativo...
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

// ─── HOME VIEW ──────────────────────────────────────────────────────────────
function HomeView({ apps, selectApp, serverStatus, addToast, fetchStatus }) {
  const [loading, setLoading] = useState(false);

  const triggerPower = async (action) => {
    const label = action === 'reboot' ? 'reiniciar' : 'desligar';
    if (!window.confirm(`Deseja realmente ${label} o servidor remoto?`)) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/power/${action}`, { method: 'POST' });
      if (data.ok) addToast(data.message || 'Comando executado com sucesso.', 'success');
      else addToast(data.error || 'Erro ao executar comando.', 'error');
    } catch {
      addToast('Erro ao conectar.', 'error');
    }
    setLoading(false);
  };

  const triggerWol = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/power/wol', { method: 'POST' });
      if (data.ok) addToast(data.message, 'success');
      else addToast(data.error, 'error');
    } catch {
      addToast('Erro ao enviar Magic Packet.', 'error');
    }
    setLoading(false);
    setTimeout(fetchStatus, 3000);
  };

  // Determine running state based on status
  const isRunning = (app) => {
    if (!serverStatus?.runningContainers) return false;
    let containerName = `srv_${app.id}_sandbox`;
    if (app.id === 'filebrowser') containerName = 'srv_filebrowser';
    else if (app.id === 'jarvis') containerName = 'open-webui';
    else if (app.id === 'cups') containerName = 'cupsd';
    else if (app.id === 'scanner') containerName = 'scanservjs';
    else if (app.id === 'ttyd') containerName = 'srv_dashboard';
    else if (app.id === 'metabase') containerName = 'srv_metabase';
    else if (app.id === 'jupyter') containerName = 'srv_jupyter_spark';
    else if (app.id === 'onlyoffice') containerName = 'srv_onlyoffice';
    else if (app.type === 'static') return true;

    return serverStatus.runningContainers.some(c => 
      c.toLowerCase() === containerName.toLowerCase() || c.toLowerCase().includes(containerName.toLowerCase())
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome / Quick Info */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight google-sans">Servidor Remoto</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
            Status: {serverStatus?.online ? `Conectado via ${serverStatus.host}` : 'Desconectado'}
          </p>
        </div>
        <div className="flex gap-2">
          {!serverStatus?.online && (
            <button onClick={triggerWol} disabled={loading} className="btn-primary py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 h-10">
              <span className="material-symbols-outlined text-[16px]">bolt</span>
              <span>Ligar (WOL)</span>
            </button>
          )}
          <button onClick={() => triggerPower('reboot')} disabled={loading || !serverStatus?.online} className="btn-ghost py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 h-10 text-[var(--md-sys-color-warning)] border-[var(--md-sys-color-warning)]/20 hover:bg-[var(--md-sys-color-warning-container)]">
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span>Reiniciar</span>
          </button>
          <button onClick={() => triggerPower('shutdown')} disabled={loading || !serverStatus?.online} className="btn-danger py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 h-10">
            <span className="material-symbols-outlined text-[16px]">power_off</span>
            <span>Desligar</span>
          </button>
        </div>
      </div>

      {/* Quick Launch App Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Lançador Rápido</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {apps.map((app) => {
            const active = isRunning(app);
            return (
              <button
                key={app.id}
                onClick={() => selectApp(app)}
                className={`border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:border-[var(--md-sys-color-primary)] ${
                  active ? 'ring-1 ring-[var(--md-sys-color-primary)]' : ''
                }`}
              >
                <span className={`material-symbols-outlined text-2xl mb-2 ${
                  active ? 'text-[var(--md-sys-color-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)]'
                }`}>{app.icon}</span>
                <span className="text-xs font-medium truncate w-full">{app.name}</span>
                <span className="text-[9px] text-[var(--md-sys-color-on-surface-variant)] mt-1 opacity-75">
                  {active ? 'Ativo' : 'Parado'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connected Disks summary */}
      {serverStatus?.disks && serverStatus.disks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Discos Conectados</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {serverStatus.disks.map((d, idx) => (
              <div key={idx} className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between font-medium">
                  <span className="truncate">{d.mount}</span>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">{d.used} / {d.total}</span>
                </div>
                <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-[var(--md-sys-color-primary)] h-full transition-all" 
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  <span>{d.filesystem}</span>
                  <span>{d.percent}% Usado</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DOCKER VIEW ────────────────────────────────────────────────────────────
function DockerView({ addToast }) {
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [logs, setLogs] = useState('');
  const [logsContainer, setLogsContainer] = useState('');
  const [tab, setTab] = useState('containers'); // containers, images, logs
  const [loading, setLoading] = useState(false);
  const [filterAll, setFilterAll] = useState(false);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = filterAll ? 'all' : 'ps';
      const data = await apiFetch(`/api/docker/${endpoint}`);
      if (data.ok) {
        setContainers(data.containers || []);
      } else {
        addToast(data.error || 'Erro ao carregar contêineres.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  }, [filterAll, addToast]);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/docker/images');
      if (data.ok) {
        setImages(data.images || []);
      } else {
        addToast(data.error || 'Erro ao carregar imagens.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => {
    if (tab === 'containers') fetchContainers();
    else if (tab === 'images') fetchImages();
  }, [tab, fetchContainers, fetchImages]);

  const triggerAction = async (action, name) => {
    if (action === 'rm' && !window.confirm(`Deseja realmente remover o contêiner ${name}?`)) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/docker/${action}`, {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      if (data.ok) {
        addToast(data.message || 'Comando executado.', 'success');
        fetchContainers();
      } else {
        addToast(data.error || 'Falha ao executar comando.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setLoading(false);
  };

  const showLogs = async (name) => {
    setLogsContainer(name);
    setTab('logs');
    setLogs('');
    setLoading(true);
    try {
      const data = await apiFetch(`/api/docker/logs?name=${name}`);
      if (data.ok) {
        setLogs(data.output || 'Sem logs.');
      } else {
        setLogs(`Erro ao carregar logs: ${data.error}`);
      }
    } catch {
      setLogs('Erro de conexão com o servidor.');
    }
    setLoading(false);
  };

  const restartDockerService = async () => {
    if (!window.confirm('Deseja reiniciar o serviço Docker no servidor remoto?')) return;
    setLoading(true);
    try {
      const data = await apiFetch('/api/docker/restart-service', { method: 'POST' });
      if (data.ok) addToast('Serviço Docker reiniciado!', 'success');
      else addToast(data.error || 'Falha ao reiniciar.', 'error');
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Sub tabs and controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-3 rounded-2xl text-xs">
        <div className="flex gap-2">
          <button 
            onClick={() => setTab('containers')} 
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              tab === 'containers' 
                ? 'bg-[var(--md-sys-color-primary)] text-white' 
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
            }`}
          >
            Contêineres
          </button>
          <button 
            onClick={() => setTab('images')} 
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              tab === 'images' 
                ? 'bg-[var(--md-sys-color-primary)] text-white' 
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
            }`}
          >
            Imagens
          </button>
          {logsContainer && (
            <button 
              onClick={() => setTab('logs')} 
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                tab === 'logs' 
                  ? 'bg-[var(--md-sys-color-primary)] text-white' 
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
              }`}
            >
              Logs: {logsContainer}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {tab === 'containers' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--md-sys-color-on-surface-variant)] select-none">
              <input 
                type="checkbox" 
                checked={filterAll} 
                onChange={(e) => setFilterAll(e.target.checked)} 
                className="w-4 h-4 rounded accent-[var(--md-sys-color-primary)]"
              />
              <span>Mostrar todos (-a)</span>
            </label>
          )}
          <button onClick={restartDockerService} disabled={loading} className="btn-ghost py-2 px-3 rounded-xl flex items-center gap-1.5 text-xs text-[var(--md-sys-color-error)] border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)]">
            <span className="material-symbols-outlined text-base">restart_alt</span>
            <span>Reiniciar Docker</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden min-h-[300px] flex flex-col">
        {loading && (
          <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-center gap-2 flex-1">
            <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
            <span>Carregando dados do Docker...</span>
          </div>
        )}

        {!loading && tab === 'containers' && (
          containers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                    <th className="text-left py-3 px-4">Nome</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4 hidden lg:table-cell">Portas</th>
                    <th className="text-right py-3 px-4">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {containers.map((c, idx) => {
                    const active = c.Status?.includes('Up');
                    return (
                      <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium truncate max-w-[150px]">{c.Names}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            active ? 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]' : 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]'
                          }`}>{c.Status}</span>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] max-w-[200px] truncate">{c.Ports || '—'}</td>
                        <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                          {!active ? (
                            <button onClick={() => triggerAction('start', c.Names)} title="Iniciar" className="w-8 h-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-primary)]">
                              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                            </button>
                          ) : (
                            <button onClick={() => triggerAction('stop', c.Names)} title="Parar" className="w-8 h-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                              <span className="material-symbols-outlined text-[18px]">stop</span>
                            </button>
                          )}
                          <button onClick={() => triggerAction('restart', c.Names)} title="Reiniciar" className="w-8 h-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-warning)]">
                            <span className="material-symbols-outlined text-[18px]">autorenew</span>
                          </button>
                          <button onClick={() => showLogs(c.Names)} title="Logs" className="w-8 h-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
                            <span className="material-symbols-outlined text-[18px]">notes</span>
                          </button>
                          <button onClick={() => triggerAction('rm', c.Names)} title="Remover" className="w-8 h-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">Sem contêineres detectados.</div>
          )
        )}

        {!loading && tab === 'images' && (
          images.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                    <th className="text-left py-3 px-4">Repository</th>
                    <th className="text-left py-3 px-4">Tag</th>
                    <th className="text-left py-3 px-4">Size</th>
                    <th className="text-left py-3 px-4">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {images.map((img, idx) => (
                    <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium">{img.Repository}</td>
                      <td className="py-3 px-4 font-mono">{img.Tag}</td>
                      <td className="py-3 px-4 font-mono text-[var(--md-sys-color-on-surface-variant)]">{img.Size}</td>
                      <td className="py-3 px-4 font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{img.ID?.substring(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">Sem imagens no servidor.</div>
          )
        )}

        {!loading && tab === 'logs' && (
          <div className="flex-1 flex flex-col p-4 bg-black text-green-400 font-mono text-xs overflow-hidden h-[450px]">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
              <span>Logs do container: {logsContainer}</span>
              <button onClick={() => showLogs(logsContainer)} className="hover:text-white flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">refresh</span>
                <span>Recarregar</span>
              </button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap">{logs || 'Aguardando logs...'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── IA HUB VIEW ────────────────────────────────────────────────────────────
function IaHubView({ addToast }) {
  const [subTab, setSubTab] = useState('chat'); // chat, agent, manage
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [chatModel, setChatModel] = useState('');
  
  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Agent States
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentMode, setAgentMode] = useState('safe'); // safe, autonomous
  const [agentOutput, setAgentOutput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);

  // Manage States
  const [ollamaStatus, setOllamaStatus] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [pullModelName, setPullModelName] = useState('');
  const [pullLoading, setPullLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await apiFetch('/api/ia/models');
      if (data.ok) {
        // Parse models output into objects
        const lines = (data.output || '').split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/\s{2,}/);
          if (parts.length >= 3) {
            parsed.push({ name: parts[0], id: parts[1], size: parts[2] });
          }
        }
        setModels(parsed);
        if (parsed.length > 0 && !chatModel) {
          setChatModel(parsed[0].name);
        }
      }
    } catch {}
    setModelsLoading(false);
  }, [chatModel]);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const data = await apiFetch('/api/ia/status');
      setOllamaStatus(data.output || 'Erro ao obter status.');
    } catch {
      setOllamaStatus('Erro ao conectar.');
    }
    setStatusLoading(false);
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (subTab === 'manage') {
      fetchStatus();
    }
  }, [subTab, fetchStatus]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // Chat Send
  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatModel || chatLoading) return;

    const userMsg = { role: 'user', content: chatInput };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const requestMsgs = [...messages, userMsg];
      const data = await apiFetch('/api/ia/chat', {
        method: 'POST',
        body: JSON.stringify({ model: chatModel, messages: requestMsgs })
      });

      if (data.ok && data.message) {
        setMessages(prev => [...prev, data.message]);
      } else {
        addToast(data.error || 'Erro na resposta do modelo.', 'error');
      }
    } catch {
      addToast('Erro ao se conectar ao Ollama.', 'error');
    }
    setChatLoading(false);
  };

  // Agent Trigger
  const triggerAgent = async (e) => {
    e.preventDefault();
    if (!agentPrompt.trim() || agentLoading) return;

    setAgentLoading(true);
    setAgentOutput('');
    try {
      const data = await apiFetch('/api/ia/agent', {
        method: 'POST',
        body: JSON.stringify({ prompt: agentPrompt, mode: agentMode })
      });
      if (data.ok) {
        setAgentOutput(data.output || 'Agente executado com sucesso.');
        addToast('Agente executou com sucesso.', 'success');
      } else {
        setAgentOutput(`Erro: ${data.error}`);
        addToast(data.error || 'Falha na execução.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setAgentLoading(false);
  };

  // Pull Model
  const startPull = async (e) => {
    e.preventDefault();
    if (!pullModelName.trim() || pullLoading) return;

    setPullLoading(true);
    try {
      const data = await apiFetch('/api/ia/pull', {
        method: 'POST',
        body: JSON.stringify({ model: pullModelName })
      });
      if (data.ok) {
        addToast(`Modelo ${pullModelName} baixado com sucesso!`, 'success');
        setPullModelName('');
        fetchModels();
      } else {
        addToast(data.error || 'Erro no download.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setPullLoading(false);
  };

  // Remove Model
  const removeModel = async (name) => {
    if (!window.confirm(`Deseja realmente remover o modelo ${name}?`)) return;

    try {
      const data = await apiFetch('/api/ia/remove', {
        method: 'POST',
        body: JSON.stringify({ model: name })
      });
      if (data.ok) {
        addToast(`Modelo ${name} removido!`, 'success');
        fetchModels();
      } else {
        addToast(data.error || 'Erro ao remover.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub tabs */}
      <div className="flex bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2 rounded-2xl text-xs gap-2">
        <button onClick={() => setSubTab('chat')} className={`px-4 py-2 rounded-xl font-medium transition-all ${subTab === 'chat' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>Conversar</button>
        <button onClick={() => setSubTab('agent')} className={`px-4 py-2 rounded-xl font-medium transition-all ${subTab === 'agent' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>Agente</button>
        <button onClick={() => setSubTab('manage')} className={`px-4 py-2 rounded-xl font-medium transition-all ${subTab === 'manage' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>Gerenciar</button>
      </div>

      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl p-6 min-h-[350px] flex flex-col justify-between">
        {/* CHAT HUB */}
        {subTab === 'chat' && (
          <div className="flex-1 flex flex-col h-[500px]">
            {/* Top Selector */}
            <div className="flex items-center justify-between pb-4 border-b border-[var(--md-sys-color-surface-variant)] mb-4 text-xs">
              <span className="font-medium text-[var(--md-sys-color-on-surface-variant)]">Modelo de Chat:</span>
              <select 
                value={chatModel} 
                onChange={(e) => setChatModel(e.target.value)}
                className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-1.5 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] font-medium"
              >
                {models.length > 0 ? (
                  models.map((m, idx) => (
                    <option key={idx} value={m.name}>{m.name} ({m.size})</option>
                  ))
                ) : (
                  <option value="">Sem modelos carregados</option>
                )}
              </select>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4 text-xs">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] opacity-75">
                  Selecione um modelo e envie uma mensagem para começar a conversar.
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-3.5 rounded-2xl border text-xs leading-relaxed ${
                      m.role === 'user' 
                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/10 rounded-br-none' 
                        : 'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border-transparent rounded-bl-none'
                    }`}>
                      <div className="font-bold mb-1 opacity-75 uppercase text-[9px] tracking-wider">
                        {m.role === 'user' ? 'Você' : chatModel}
                      </div>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[75%] p-3.5 rounded-2xl bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border-transparent rounded-bl-none flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin text-sm">autorenew</span>
                    <span className="text-[10px] font-medium animate-pulse">Gerando resposta...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={sendChatMessage} className="flex gap-2 pt-4 border-t border-[var(--md-sys-color-surface-variant)] mt-auto">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Digite sua mensagem para a IA..."
                disabled={chatLoading || !chatModel}
                className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] transition-all"
              />
              <button 
                type="submit" 
                disabled={chatLoading || !chatInput.trim() || !chatModel}
                className="btn-primary px-5 py-3 rounded-xl text-xs font-bold disabled:opacity-50 flex-shrink-0"
              >
                Enviar
              </button>
            </form>
          </div>
        )}

        {/* AGENT HUB */}
        {subTab === 'agent' && (
          <div className="flex-1 flex flex-col h-[500px]">
            <form onSubmit={triggerAgent} className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-1.5 px-1">Comando ou Prompt para o Agente</label>
                  <input
                    type="text"
                    value={agentPrompt}
                    onChange={(e) => setAgentPrompt(e.target.value)}
                    placeholder="ex: 'organizar arquivos na pasta /home/rodrigo/test'"
                    className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-3 text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] transition-all"
                    disabled={agentLoading}
                  />
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <label className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-0.5">Modo</label>
                  <select 
                    value={agentMode} 
                    onChange={(e) => setAgentMode(e.target.value)}
                    className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-3 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] font-medium h-[42px]"
                  >
                    <option value="safe">Modo Seguro (Confirmação)</option>
                    <option value="autonomous">Autônomo (Livre)</option>
                  </select>
                </div>
                <button type="submit" disabled={agentLoading || !agentPrompt.trim()} className="btn-primary px-6 h-[42px] rounded-xl text-xs font-bold">
                  Executar
                </button>
              </div>
            </form>

            {/* Console Output */}
            <div className="flex-1 mt-6 flex flex-col bg-black text-green-400 font-mono text-xs p-4 rounded-xl overflow-hidden">
              <div className="border-b border-gray-800 pb-2 mb-2 flex justify-between">
                <span>Console do Agente Autônomo (open-interpreter)</span>
                {agentLoading && <span className="animate-pulse">Rodando...</span>}
              </div>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap">{agentOutput || 'Aguardando comando do agente...'}</pre>
            </div>
          </div>
        )}

        {/* MANAGE HUB */}
        {subTab === 'manage' && (
          <div className="flex-1 space-y-6 text-xs">
            {/* Split layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Models List */}
              <div className="space-y-3">
                <h4 className="font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Modelos Instalados</h4>
                <div className="border border-[var(--md-sys-color-surface-variant)] rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-variant)]/10">
                  {modelsLoading ? (
                    <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)]">Carregando modelos...</div>
                  ) : models.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                          <th className="text-left py-2.5 px-3">Nome</th>
                          <th className="text-left py-2.5 px-3">ID</th>
                          <th className="text-left py-2.5 px-3">Tamanho</th>
                          <th className="text-right py-2.5 px-3">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                        {models.map((m, idx) => (
                          <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/50 transition-colors">
                            <td className="py-2 px-3 font-mono font-medium">{m.name}</td>
                            <td className="py-2 px-3 font-mono text-[var(--md-sys-color-on-surface-variant)]">{m.id}</td>
                            <td className="py-2 px-3 font-mono text-[var(--md-sys-color-on-surface-variant)]">{m.size}</td>
                            <td className="py-2 px-3 text-right">
                              <button onClick={() => removeModel(m.name)} title="Remover" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)]">Nenhum modelo instalado.</div>
                  )}
                </div>
              </div>

              {/* Download & Status */}
              <div className="space-y-6">
                {/* Download Form */}
                <div className="space-y-3">
                  <h4 className="font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Baixar Modelo (Pull)</h4>
                  <form onSubmit={startPull} className="flex gap-2">
                    <input
                      type="text"
                      value={pullModelName}
                      onChange={(e) => setPullModelName(e.target.value)}
                      placeholder="ex: deepseek-r1:8b"
                      disabled={pullLoading}
                      className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2.5 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] transition-all"
                    />
                    <button type="submit" disabled={pullLoading || !pullModelName.trim()} className="btn-primary px-5 py-2.5 rounded-xl font-bold flex items-center gap-1.5">
                      {pullLoading ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-sm">autorenew</span>
                          <span>Baixando...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-sm">download</span>
                          <span>Baixar</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Ollama Service Status */}
                <div className="space-y-3 flex-1 flex flex-col">
                  <h4 className="font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Status do Serviço Ollama</h4>
                  <pre className="flex-grow p-4 bg-black text-green-400 font-mono text-[10px] rounded-xl whitespace-pre-wrap overflow-auto max-h-[220px]">
                    {statusLoading ? 'Carregando status...' : ollamaStatus}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BACKUP VIEW ────────────────────────────────────────────────────────────
function BackupView({ serverStatus, addToast }) {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  const runBackup = async () => {
    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/backup/full', { method: 'POST' });
      setOutput(data.output || data.message || 'Concluído.');
      if (data.ok) addToast('Backup concluído com sucesso!', 'success');
      else addToast(data.error || 'Falha ao executar backup.', 'error');
    } catch {
      setOutput('Erro de processamento no servidor remoto.');
      addToast('Erro ao realizar o backup.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Action panel */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-bold tracking-tight google-sans">Sincronização de Backups</h2>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
            Executa a sincronização completa das mídias locais e nuvem (iCloud/Storage).
          </p>
        </div>
        <button onClick={runBackup} disabled={loading} className="btn-primary py-2.5 px-6 rounded-xl text-xs font-bold flex items-center gap-1.5 h-11">
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">autorenew</span>
              <span>Executando Backup...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
              <span>Iniciar Backup</span>
            </>
          )}
        </button>
      </div>

      {/* Split layout: Disks & Output Console */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connected Disks */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Espaço de Armazenamento</h3>
          {serverStatus?.disks && serverStatus.disks.length > 0 ? (
            <div className="space-y-3">
              {serverStatus.disks.map((d, idx) => (
                <div key={idx} className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-2 text-xs">
                  <div className="flex justify-between font-medium">
                    <span className="truncate">{d.mount}</span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]">{d.used} montado em {d.total}</span>
                  </div>
                  <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-[var(--md-sys-color-primary)] h-full transition-all" 
                      style={{ width: `${d.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    <span className="font-mono">{d.filesystem}</span>
                    <span>{d.percent}% Usado</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Sem dados de armazenamento.
            </div>
          )}
        </div>

        {/* Live Output Console */}
        <div className="space-y-3 flex flex-col">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Saída do Processo</h3>
          <div className="flex-1 min-h-[220px] bg-black text-green-400 p-4 rounded-2xl font-mono text-xs overflow-auto max-h-[300px]">
            {loading ? (
              <div className="flex items-center gap-2 animate-pulse">
                <span className="animate-spin material-symbols-outlined text-sm">sync</span>
                <span>Processando backups... (Isso pode demorar alguns minutos)</span>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap">{output || 'Nenhum log de processo de backup recente.'}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── USERS VIEW ─────────────────────────────────────────────────────────────
function UsersView({ addToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/users');
      if (data.ok) {
        setUsers(data.users || []);
      } else {
        addToast(data.error || 'Erro ao carregar usuários.', 'error');
      }
    } catch {
      addToast('Erro ao obter dados de usuários.', 'error');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const data = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      if (data.ok) {
        addToast(`Usuário ${username} adicionado/atualizado!`, 'success');
        setUsername('');
        setPassword('');
        fetchUsers();
      } else {
        addToast(data.error || 'Erro ao salvar usuário.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  };

  const deleteUser = async (name) => {
    if (name === 'admin') return;
    if (!window.confirm(`Deseja realmente remover o usuário ${name}?`)) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/users?username=${name}`, {
        method: 'DELETE'
      });
      if (data.ok) {
        addToast(`Usuário ${name} excluído!`, 'success');
        fetchUsers();
      } else {
        addToast(data.error || 'Erro ao excluir.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
      {/* User list */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Gestão de Contas</h3>
        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden">
          {loading && users.length === 0 ? (
            <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)]">Carregando usuários...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                  <th className="text-left py-3 px-4">Nome de Usuário</th>
                  <th className="text-left py-3 px-4">Senha</th>
                  <th className="text-right py-3 px-4">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                {users.map((u, idx) => (
                  <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/50 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-[var(--md-sys-color-on-surface)]">{u.username}</td>
                    <td className="py-3 px-4 font-mono text-[var(--md-sys-color-on-surface-variant)]">••••••••</td>
                    <td className="py-3 px-4 text-right">
                      {u.username !== 'admin' ? (
                        <button onClick={() => deleteUser(u.username)} title="Remover" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] italic pr-2 select-none">Mestre</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add form */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Novo / Atualizar Usuário</h3>
        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl">
          <form onSubmit={addUser} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-1.5 px-1">Nome</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ex: rodrigo"
                disabled={loading}
                required
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2.5 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider mb-1.5 px-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha de acesso"
                disabled={loading}
                required
                className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-4 py-2.5 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] transition-all"
              />
            </div>
            <button type="submit" disabled={loading || !username.trim() || !password.trim()} className="w-full btn-primary py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 h-11">
              Salvar Usuário
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── MAINTENANCE VIEW ───────────────────────────────────────────────────────
function MaintenanceView({ serverStatus, addToast, fetchStatus }) {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnStatus, setVpnStatus] = useState('');

  const runMaintenance = async (action, title) => {
    if (!window.confirm(`Deseja realmente executar a manutenção: ${title}?`)) return;

    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch(`/api/maintenance/${action}`, { method: 'POST' });
      setOutput(data.output || data.message || 'Concluído.');
      if (data.ok) addToast(`${title} executada com sucesso!`, 'success');
      else addToast(data.error || 'Falha ao executar.', 'error');
    } catch {
      setOutput('Erro de conexão com o servidor.');
      addToast('Erro ao realizar a manutenção.', 'error');
    }
    setLoading(false);
  };

  const getVpnStatus = useCallback(async () => {
    setVpnLoading(true);
    try {
      const data = await apiFetch('/api/vpn/status');
      setVpnStatus(data.output || 'Não foi possível obter status.');
    } catch {
      setVpnStatus('Erro ao conectar.');
    }
    setVpnLoading(false);
  }, []);

  const toggleVpn = async (action) => {
    if (!window.confirm(`Deseja realmente ${action === 'start' ? 'ativar' : 'desativar'} a VPN local?`)) return;
    
    setVpnLoading(true);
    try {
      const data = await apiFetch('/api/services', {
        method: 'POST',
        body: JSON.stringify({ service: 'ttyd', action: action === 'start' ? 'start' : 'stop' }) // Using service command structure
      });
      if (data.ok) {
        addToast(`Comando VPN (${action}) enviado!`, 'success');
        setTimeout(() => {
          getVpnStatus();
          fetchStatus();
        }, 5000);
      } else {
        addToast(data.error || 'Erro ao executar.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setVpnLoading(false);
  };

  useEffect(() => {
    getVpnStatus();
  }, [getVpnStatus]);

  return (
    <div className="space-y-6 text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* VPN Card & Maintenance buttons */}
        <div className="space-y-4">
          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold tracking-tight google-sans">VPN Tailscale</h3>
            <div className="flex gap-2">
              <button onClick={() => toggleVpn('start')} disabled={vpnLoading} className="btn-primary py-2 px-4 rounded-xl text-xs font-bold h-10 flex-1">
                Ligar VPN
              </button>
              <button onClick={() => toggleVpn('stop')} disabled={vpnLoading} className="btn-danger py-2 px-4 rounded-xl text-xs font-bold h-10 flex-1">
                Desligar VPN
              </button>
              <button onClick={getVpnStatus} disabled={vpnLoading} className="btn-ghost py-2 px-3 rounded-xl h-10">
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>

            <pre className="p-4 bg-black text-green-400 font-mono text-[10px] rounded-xl max-h-[150px] overflow-auto whitespace-pre-wrap">
              {vpnLoading ? 'Obtendo status da VPN...' : vpnStatus}
            </pre>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-6 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold tracking-tight google-sans">Tarefas do Servidor</h3>
            <div className="flex gap-2">
              <button onClick={() => runMaintenance('clean', 'Limpar Lixo')} disabled={loading} className="btn-ghost py-2.5 px-4 rounded-xl text-xs font-bold flex-1 flex items-center justify-center gap-1.5 h-11 text-[var(--md-sys-color-error)] border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)]">
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                <span>Limpar Lixo</span>
              </button>
              <button onClick={() => runMaintenance('update', 'Atualizar Servidor')} disabled={loading} className="btn-ghost py-2.5 px-4 rounded-xl text-xs font-bold flex-1 flex items-center justify-center gap-1.5 h-11">
                <span className="material-symbols-outlined text-[16px]">system_update</span>
                <span>Atualizar OS</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Output */}
        <div className="flex flex-col space-y-3">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wider px-1">Saída do Processo</h3>
          <div className="flex-grow min-h-[300px] bg-black text-green-400 p-4 rounded-2xl font-mono text-xs overflow-auto max-h-[400px]">
            {loading ? (
              <div className="flex items-center gap-2 animate-pulse">
                <span className="animate-spin material-symbols-outlined text-sm">sync</span>
                <span>Executando manutenção... (Isso pode demorar um pouco)</span>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap">{output || 'Nenhum log de manutenção recente.'}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
