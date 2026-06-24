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
  const [authValid, setAuthValid] = useState(typeof window !== 'undefined' ? !!localStorage.getItem('dashboard-token') : false);
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
    { id: 'neovim', name: 'Neovim', icon: 'edit_note', type: 'sandbox', port: 7683 },
    { id: 'antigravity', name: 'Antigravity SSH', icon: 'vpn_key', type: 'sandbox', port: 7685 },
    { id: 'terminal', name: 'Terminal', icon: 'terminal', type: 'sandbox', port: 7682 },
    { id: 'ttyd', name: 'Monitor', icon: 'monitoring', type: 'service', serviceName: 'ttyd', port: 7681 },
    { id: 'cockpit', name: 'Cockpit', icon: 'web', type: 'static', port: 9090, protocol: 'https:', skipIframe: true },
    { id: 'cups', name: 'Impressora', icon: 'print', type: 'service', serviceName: 'cups', port: 631, skipIframe: true },
    { id: 'scanner', name: 'Scanner', icon: 'document_scanner', type: 'service', serviceName: 'scanner', port: 8080 },
    { id: 'metabase', name: 'BI Metabase', icon: 'analytics', type: 'service', serviceName: 'portal', port: 3003, skipIframe: true },
    { id: 'jupyter', name: 'Jupyter Spark', icon: 'science', type: 'service', serviceName: 'portal', port: 8888, skipIframe: true },
    { id: 'onlyoffice', name: 'Documentos', icon: 'description', type: 'service', serviceName: 'portal', port: 8086, path: '/example', skipIframe: true },
    { id: 'emulator', name: 'Android Emulator', icon: 'phone_android', type: 'service', serviceName: 'emulator', port: 6081 },
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

  const isRunning = useCallback((app) => {
    if (!serverStatus?.runningContainers) return false;
    let containerName = `srv_${app.id}_sandbox`;
    if (app.id === 'filebrowser') containerName = 'srv_filebrowser';
    else if (app.id === 'antigravity') containerName = 'srv_ag_sandbox';
    else if (app.id === 'neovim') containerName = 'srv_nvim_sandbox';
    else if (app.id === 'jarvis') containerName = 'open-webui';
    else if (app.id === 'cups') containerName = 'cupsd';
    else if (app.id === 'scanner') containerName = 'scanservjs';
    else if (app.id === 'ttyd') containerName = 'srv_dashboard';
    else if (app.id === 'metabase') containerName = 'srv_metabase';
    else if (app.id === 'jupyter') containerName = 'srv_jupyter_spark';
    else if (app.id === 'onlyoffice') containerName = 'srv_onlyoffice';
    else if (app.id === 'emulator') containerName = 'android-container';
    else if (app.type === 'static') return true;

    return serverStatus.runningContainers.some(c => 
      c.toLowerCase() === containerName.toLowerCase() || c.toLowerCase().includes(containerName.toLowerCase())
    );
  }, [serverStatus]);

  // Sandbox/Service Launcher
  const selectApp = async (app) => {
    setActiveTab('app');
    setActiveApp(app);
    setIframeUrl('');
    setMobileMenuOpen(false);
    
    const isIPOrLocalhost = (h) => {
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(h) || h.endsWith('.local');
    };
    
    const isLocal = isIPOrLocalhost(window.location.hostname);
    const host = isLocal 
      ? window.location.hostname 
      : (serverStatus?.host || window.location.hostname);
      
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

    const resolveUrl = async () => {
      if (!isLocal) {
        setLaunchMessage('Iniciando...');
        try {
          const tunRes = await apiFetch('/api/tunnel', { method: 'POST', body: JSON.stringify({ port: app.port, protocol: app.protocol || 'http:' }) });
          if (tunRes.ok && tunRes.url) {
            return tunRes.url + path;
          }
        } catch (e) {}
      }
      return targetUrl;
    };

    // If it's a sandbox, start/check it
    if (app.type === 'sandbox') {
      // Map app id to container name
      let containerName = `srv_${app.id}_sandbox`;
      if (app.id === 'filebrowser') containerName = 'srv_filebrowser';
      else if (app.id === 'antigravity') containerName = 'srv_ag_sandbox';
      else if (app.id === 'neovim') containerName = 'srv_nvim_sandbox';

      if (isContainerRunning(containerName)) {
        setLaunching(true);
        const finalUrl = await resolveUrl();
        setIframeUrl(finalUrl);
        setLaunching(false);
        return;
      }

      setLaunching(true);
      setLaunchMessage('Iniciando...');
      try {
        const res = await apiFetch(`/api/sandbox/${app.id}`, { method: 'POST' });
        if (res.ok) {
          addToast(`${app.name} iniciado!`, 'success');
          // Wait 5 seconds for initialization
          setTimeout(async () => {
            const finalUrl = await resolveUrl();
            setIframeUrl(finalUrl);
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
      else if (app.id === 'emulator') isRunning = isContainerRunning('android-container');

      if (isRunning) {
        setLaunching(true);
        const finalUrl = await resolveUrl();
        setIframeUrl(finalUrl);
        setLaunching(false);
      } else {
        // If not running, prompt user to start service
        if (window.confirm(`O serviço ${app.name} não está ativo. Deseja iniciá-lo agora?`)) {
          setLaunching(true);
          setLaunchMessage('Iniciando...');
          try {
            const res = await apiFetch('/api/services', {
              method: 'POST',
              body: JSON.stringify({ service: app.serviceName, action: 'start' })
            });
            if (res.ok) {
              addToast(`Serviço ${app.name} iniciado!`, 'success');
              setTimeout(async () => {
                const finalUrl = await resolveUrl();
                setIframeUrl(finalUrl);
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
      setLaunching(true);
      const finalUrl = await resolveUrl();
      setIframeUrl(finalUrl);
      setLaunching(false);
    }
  };

  const closeActiveApp = () => {
    setActiveTab('home');
    setActiveApp(null);
    setIframeUrl('');
    const isIPOrLocalhost = (h) => {
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(h) || h.endsWith('.local');
    };
    if (!isIPOrLocalhost(window.location.hostname)) {
      apiFetch('/api/tunnel', { method: 'POST', body: JSON.stringify({ action: 'stop' }) }).catch(()=>{});
    }
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
    setLaunchMessage('Parando...');
    try {
      let endpoint = '';
      let body = {};
      
      if (activeApp.type === 'sandbox') {
        endpoint = '/api/docker/stop';
        let name = `srv_${activeApp.id}_sandbox`;
        if (activeApp.id === 'filebrowser') name = 'srv_filebrowser';
        else if (activeApp.id === 'antigravity') name = 'srv_ag_sandbox';
        else if (activeApp.id === 'neovim') name = 'srv_nvim_sandbox';
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
    return null;
  }

  const isOnline = serverStatus?.online;

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--md-sys-color-background)] overflow-hidden text-[var(--md-sys-color-on-background)] relative">
      {/* Barra de Cabeçalho Superior para Celular */}
      <header className={`md:hidden h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex items-center justify-between pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] flex-shrink-0 z-30 ${
        activeTab === 'app' ? 'hidden' : 'flex'
      }`}>
        <button 
          onClick={() => setMobileMenuOpen(true)} 
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
        <span className="font-bold tracking-tight text-sm google-sans">SRV</span>
        <div className="w-9 h-9" />
      </header>

      <div className="flex flex-1 h-full overflow-hidden relative">
        {/* ─── SIDEBAR (Desktop/Mobile Collapsed) ────────────────────────────────── */}
        <aside className={`border-r border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between flex-shrink-0 z-40 transition-all duration-200 w-[calc(4rem+env(safe-area-inset-left))] pl-[env(safe-area-inset-left)] ${
          mobileMenuOpen ? 'fixed inset-y-0 left-0' : 'hidden md:flex'
        }`}>
          <div className="flex flex-col flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
            {/* Brand header */}
            <div className="flex items-center justify-center py-4 border-b border-[var(--md-sys-color-surface-variant)] relative">
              <div className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center relative">
                <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-lg icon-filled">dns</span>
              </div>
            </div>

            {/* Navigation Menu */}
            <div className="px-2 py-4 flex flex-col items-center gap-1.5 overflow-y-auto flex-1 w-full">
              {[
                { id: 'home', name: 'Início', icon: 'home' },
                { id: 'docker', name: 'Docker', icon: 'view_in_ar' },
                { id: 'ia', name: 'IA', icon: 'psychology' },
                { id: 'backup', name: 'Backup', icon: 'cloud_sync' },
                { id: 'users', name: 'Contas', icon: 'group' },
                { id: 'maintenance', name: 'Ajustes', icon: 'build' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (activeApp) {
                      closeActiveApp();
                    }
                    setActiveTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  title={tab.name}
                  className={`w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-xl transition-all ${
                    activeTab === tab.id
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                      : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                </button>
              ))}

              {apps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => selectApp(app)}
                  title={app.name}
                  className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all ${
                    activeTab === 'app' && activeApp?.id === app.id
                      ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                      : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]/50'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{app.icon}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer controls */}
          <div className="p-3 border-t border-[var(--md-sys-color-surface-variant)] flex flex-col items-center gap-2">
            <button onClick={toggleTheme} className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
              <span className="material-symbols-outlined text-base">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            <button onClick={handleLogout} className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] flex items-center justify-center">
              <span className="material-symbols-outlined text-base">logout</span>
            </button>
          </div>
        </aside>

        {/* Backdrop overlay for mobile menu */}
        {mobileMenuOpen && (
          <div onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-30 bg-black/30 md:hidden" />
        )}

        {/* ─── MAIN WORKSPACE ─── */}
        <div className="flex-1 flex flex-col overflow-hidden pl-[env(safe-area-inset-left)] md:pl-0 pr-[env(safe-area-inset-right)]">
          {/* Content Pane */}
          <main className={`flex-1 overflow-y-auto relative ${
            activeTab === 'app' ? 'p-0' : 'p-4 md:p-6'
          }`}>


            {activeTab === 'home' && <HomeView apps={apps} selectApp={selectApp} serverStatus={serverStatus} addToast={addToast} fetchStatus={fetchStatus} isRunning={isRunning} />}
            {activeTab === 'docker' && <DockerView addToast={addToast} />}
            {activeTab === 'ia' && <IaHubView addToast={addToast} />}
            {activeTab === 'backup' && <BackupView serverStatus={serverStatus} addToast={addToast} />}
            {activeTab === 'users' && <UsersView addToast={addToast} />}
            {activeTab === 'maintenance' && <MaintenanceView serverStatus={serverStatus} addToast={addToast} fetchStatus={fetchStatus} />}
            
            {activeTab === 'app' && activeApp && (
              <div className="w-full h-full flex flex-col bg-[var(--md-sys-color-surface)] md:border md:border-[var(--md-sys-color-surface-variant)] md:rounded-2xl overflow-hidden">
                {/* App Iframe Controls */}
                <div className="h-10 px-4 bg-[var(--md-sys-color-surface-variant)] flex items-center justify-between border-b border-[var(--md-sys-color-surface-variant)] flex-shrink-0 text-xs">
                  <div className="flex items-center gap-2 max-w-[50%] sm:max-w-xs overflow-hidden">
                    <button 
                      onClick={closeActiveApp} 
                      title="Voltar" 
                      className="h-7 px-2 rounded-lg hover:bg-black/5 flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)] font-semibold flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      <span className="hidden sm:inline">Voltar</span>
                    </button>
                    <span className="font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                      {iframeUrl || 'Carregando...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {iframeUrl && (
                      <a 
                        href={iframeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        title="Abrir em nova aba" 
                        className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]"
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      </a>
                    )}
                    <button onClick={reloadIframe} title="Recarregar" className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                    </button>
                    <button onClick={stopActiveAppContainer} title="Parar" className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-error)]">
                      <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-[var(--md-sys-color-background)] relative">
                  {iframeUrl ? (
                    activeApp.id === 'antigravity' ? (
                      <AntigravitySshView host={serverStatus?.host} addToast={addToast} />
                    ) : activeApp.skipIframe ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center space-y-3 max-w-xs mx-auto">
                        <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                          {activeApp.name}
                        </h3>
                        <a 
                          href={iframeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn-primary py-1.5 px-4 rounded-xl font-medium flex items-center justify-center gap-1 text-xs"
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          <span>Abrir</span>
                        </a>
                      </div>
                    ) : (
                      <>
                        <iframe src={iframeUrl} className="w-full h-full border-0" allow="clipboard-read; clipboard-write; fullscreen" />
                        {typeof window !== 'undefined' && window.location.protocol === 'https:' && iframeUrl.startsWith('http://') && (
                          <div className="absolute bottom-4 left-4 right-4 bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] p-2.5 rounded-xl text-[10px] flex items-center justify-between gap-3 shadow z-10">
                            <span>Conteúdo misto detectado.</span>
                            <a href={iframeUrl} target="_blank" rel="noopener noreferrer" className="bg-[var(--md-sys-color-error)] text-white px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90 transition-opacity whitespace-nowrap">
                              <span className="material-symbols-outlined text-xs">open_in_new</span>
                              <span>Abrir</span>
                            </a>
                          </div>
                        )}
                        {typeof window !== 'undefined' && iframeUrl.includes('ngrok') && (
                          <div className="absolute bottom-4 left-4 right-4 bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] p-2.5 rounded-xl text-[10px] flex items-center justify-between gap-3 shadow z-10">
                            <span>Para liberar o aviso do Ngrok:</span>
                            <a href={iframeUrl} target="_blank" rel="noopener noreferrer" className="bg-[var(--md-sys-color-primary)] text-white px-2.5 py-1 rounded-lg flex items-center gap-1 hover:opacity-90 transition-opacity whitespace-nowrap">
                              <span className="material-symbols-outlined text-xs">open_in_new</span>
                              <span>Abrir</span>
                            </a>
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      Iniciando aplicação...
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Bottom Navigation for Mobile */}
      <nav className={`md:hidden border-t border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex items-center justify-around flex-shrink-0 z-40 pb-[env(safe-area-inset-bottom)] pt-2 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${
        activeTab === 'app' ? 'hidden' : 'flex'
      }`}>
        {[
          { id: 'home', icon: 'home' },
          { id: 'docker', icon: 'view_in_ar' },
          { id: 'ia', icon: 'psychology' },
          { id: 'backup', icon: 'cloud_sync' },
          { id: 'users', icon: 'group' },
          { id: 'maintenance', icon: 'build' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeApp) {
                closeActiveApp();
              }
              setActiveTab(tab.id);
            }}
            className="flex items-center justify-center flex-1 py-2 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] transition-all"
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              activeTab === tab.id 
                ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]' 
                : ''
            }`}>
              <span className={`material-symbols-outlined text-xl ${activeTab === tab.id ? 'icon-filled text-[var(--md-sys-color-on-primary-container)]' : ''}`}>{tab.icon}</span>
            </div>
          </button>
        ))}
      </nav>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

// ─── HOME VIEW ──────────────────────────────────────────────────────────────
function HomeView({ apps, selectApp, serverStatus, addToast, fetchStatus, isRunning }) {
  const [loading, setLoading] = useState(false);

  const triggerPower = async (action) => {
    const label = action === 'reboot' ? 'reiniciar' : 'desligar';
    if (!window.confirm(`Deseja realmente ${label} o servidor remoto?`)) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/power/${action}`, { method: 'POST' });
      if (data.ok) addToast('Comando executado com sucesso.', 'success');
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

  // isRunning helper passed as prop

  return (
    <div className="space-y-6">
      {/* Top Welcome / Quick Info Bar */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-lg text-[var(--md-sys-color-primary)]">dns</span>
          <span className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] truncate">
            {serverStatus?.online ? `${serverStatus.host}` : 'Servidor Offline'}
          </span>
        </div>
        <div className="flex gap-1.5">
          {!serverStatus?.online && (
            <button onClick={triggerWol} disabled={loading} title="Ligar (WOL)" className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center transition-opacity hover:opacity-90">
              <span className="material-symbols-outlined text-base">bolt</span>
            </button>
          )}
          <button onClick={() => triggerPower('reboot')} disabled={loading || !serverStatus?.online} title="Reiniciar" className="w-9 h-9 rounded-xl border border-[var(--md-sys-color-warning)]/20 text-[var(--md-sys-color-warning)] bg-transparent hover:bg-[var(--md-sys-color-warning-container)]/10 flex items-center justify-center disabled:opacity-50">
            <span className="material-symbols-outlined text-base">restart_alt</span>
          </button>
          <button onClick={() => triggerPower('shutdown')} disabled={loading || !serverStatus?.online} title="Desligar" className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:bg-[var(--md-sys-color-error-container)]/80 flex items-center justify-center disabled:opacity-50">
            <span className="material-symbols-outlined text-base">power_off</span>
          </button>
        </div>
      </div>

      {/* Quick Launch App Grid */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {apps.map((app) => {
            return (
              <button
                key={app.id}
                onClick={() => selectApp(app)}
                className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:border-[var(--md-sys-color-primary)]"
              >
                <span className="material-symbols-outlined text-xl mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">{app.icon}</span>
                <span className="text-[11px] font-medium truncate w-full">{app.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connected Disks summary */}
      {serverStatus?.disks && serverStatus.disks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {serverStatus.disks.map((d, idx) => (
            <div key={idx} className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3.5 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between font-medium">
                <span className="truncate flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-[var(--md-sys-color-on-surface-variant)]">hard_drive</span>
                  {d.mount}
                </span>
                <span className="text-[var(--md-sys-color-on-surface-variant)] font-semibold">{d.used} / {d.total}</span>
              </div>
              <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-[var(--md-sys-color-primary)] h-full transition-all" 
                  style={{ width: `${d.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-[var(--md-sys-color-on-surface-variant)]">
                <span>{d.filesystem}</span>
                <span>{d.percent}%</span>
              </div>
            </div>
          ))}
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
        addToast('Erro ao carregar contêineres.', 'error');
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
        addToast('Erro ao carregar imagens.', 'error');
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
        addToast('Comando executado.', 'success');
        fetchContainers();
      } else {
        addToast('Falha ao executar comando.', 'error');
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
      setLogs('Erro de conexão.');
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
      <div className="flex items-center justify-between gap-3 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2.5 rounded-2xl text-xs">
        <div className="flex gap-1.5">
          <button 
            onClick={() => setTab('containers')} 
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
              tab === 'containers' 
                ? 'bg-[var(--md-sys-color-primary)] text-white' 
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">view_in_ar</span>
            <span className="hidden sm:inline">Contêineres</span>
          </button>
          <button 
            onClick={() => setTab('images')} 
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
              tab === 'images' 
                ? 'bg-[var(--md-sys-color-primary)] text-white' 
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">image</span>
            <span className="hidden sm:inline">Imagens</span>
          </button>
          {logsContainer && (
            <button 
              onClick={() => setTab('logs')} 
              className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
                tab === 'logs' 
                  ? 'bg-[var(--md-sys-color-primary)] text-white' 
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">notes</span>
              <span className="hidden sm:inline">Logs: {logsContainer}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {tab === 'containers' && (
            <label className="flex items-center gap-1.5 cursor-pointer text-[var(--md-sys-color-on-surface-variant)] select-none text-[11px]">
              <input 
                type="checkbox" 
                checked={filterAll} 
                onChange={(e) => setFilterAll(e.target.checked)} 
                className="w-3.5 h-3.5 rounded accent-[var(--md-sys-color-primary)]"
              />
              <span>Todos (-a)</span>
            </label>
          )}
          <button onClick={restartDockerService} disabled={loading} title="Reiniciar Serviço Docker" className="w-8 h-8 rounded-lg border border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-error)] flex items-center justify-center">
            <span className="material-symbols-outlined text-base">restart_alt</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden min-h-[250px] flex flex-col">
        {loading && (
          <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-center gap-2 flex-1">
            <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
            <span>Carregando...</span>
          </div>
        )}

        {!loading && tab === 'containers' && (
          containers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)]/50 border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="text-left py-2.5 px-4 font-semibold">Nome</th>
                    <th className="text-left py-2.5 px-4 font-semibold">Status</th>
                    <th className="text-left py-2.5 px-4 font-semibold hidden lg:table-cell">Portas</th>
                    <th className="text-right py-2.5 px-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {containers.map((c, idx) => {
                    const active = c.Status?.includes('Up');
                    return (
                      <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                        <td className="py-2.5 px-4 font-mono truncate max-w-[150px]">{c.Names}</td>
                        <td className="py-2.5 px-4">
                          <span className={active ? 'text-[var(--md-sys-color-tertiary)] font-medium' : 'text-[var(--md-sys-color-error)] font-medium'}>
                            {active ? 'Ativo' : 'Parado'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 hidden lg:table-cell font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] max-w-[200px] truncate">{c.Ports || '—'}</td>
                        <td className="py-2.5 px-4 text-right space-x-0.5 whitespace-nowrap">
                          {!active ? (
                            <button onClick={() => triggerAction('start', c.Names)} title="Iniciar" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-primary)]">
                              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                            </button>
                          ) : (
                            <button onClick={() => triggerAction('stop', c.Names)} title="Parar" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                              <span className="material-symbols-outlined text-[16px]">stop</span>
                            </button>
                          )}
                          <button onClick={() => triggerAction('restart', c.Names)} title="Reiniciar" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-warning)]">
                            <span className="material-symbols-outlined text-[16px]">autorenew</span>
                          </button>
                          <button onClick={() => showLogs(c.Names)} title="Logs" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]">
                            <span className="material-symbols-outlined text-[16px]">notes</span>
                          </button>
                          <button onClick={() => triggerAction('rm', c.Names)} title="Remover" className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">Nenhum contêiner.</div>
          )
        )}

        {!loading && tab === 'images' && (
          images.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)]/50 border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="text-left py-2.5 px-4 font-semibold">Repository</th>
                    <th className="text-left py-2.5 px-4 font-semibold">Tag</th>
                    <th className="text-left py-2.5 px-4 font-semibold">Size</th>
                    <th className="text-left py-2.5 px-4 font-semibold">ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {images.map((img, idx) => (
                    <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                      <td className="py-2 px-4 font-mono">{img.Repository}</td>
                      <td className="py-2 px-4 font-mono text-[var(--md-sys-color-on-surface-variant)]">{img.Tag}</td>
                      <td className="py-2 px-4 font-mono text-[var(--md-sys-color-on-surface-variant)]">{img.Size}</td>
                      <td className="py-2 px-4 font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{img.ID?.substring(0, 12)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">Nenhuma imagem.</div>
          )
        )}

        {!loading && tab === 'logs' && (
          <div className="flex-1 flex flex-col p-3 bg-black text-green-400 font-mono text-xs overflow-hidden h-[350px]">
            <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2 text-[10px]">
              <span className="truncate">Logs: {logsContainer}</span>
              <button onClick={() => showLogs(logsContainer)} className="hover:text-white flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">refresh</span>
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
        const lines = (data.output || '').split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = [];
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
      setOllamaStatus(data.output || 'Sem status.');
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

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
        addToast('Erro na IA.', 'error');
      }
    } catch {
      addToast('Erro ao se conectar.', 'error');
    }
    setChatLoading(false);
  };

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
        setAgentOutput(data.output || 'Concluído.');
        addToast('Agente concluído.', 'success');
      } else {
        setAgentOutput(`Erro: ${data.error}`);
        addToast('Falha no agente.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setAgentLoading(false);
  };

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
        addToast(`Modelo ${pullModelName} baixado!`, 'success');
        setPullModelName('');
        fetchModels();
      } else {
        addToast('Erro no download.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setPullLoading(false);
  };

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
        addToast('Erro ao remover.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub tabs */}
      <div className="flex bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2 rounded-2xl text-xs gap-1.5">
        <button onClick={() => setSubTab('chat')} className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${subTab === 'chat' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>
          <span className="material-symbols-outlined text-[16px]">forum</span>
          <span>Conversar</span>
        </button>
        <button onClick={() => setSubTab('agent')} className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${subTab === 'agent' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>
          <span className="material-symbols-outlined text-[16px]">smart_toy</span>
          <span>Agente</span>
        </button>
        <button onClick={() => setSubTab('manage')} className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${subTab === 'manage' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'}`}>
          <span className="material-symbols-outlined text-[16px]">settings</span>
          <span>Gerenciar</span>
        </button>
      </div>

      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl p-4 min-h-[300px] flex flex-col justify-between text-xs">
        {/* CHAT HUB */}
        {subTab === 'chat' && (
          <div className="flex-1 flex flex-col h-[400px]">
            {/* Top Selector */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--md-sys-color-surface-variant)] mb-3 text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">psychology</span>
                Modelo
              </span>
              <select 
                value={chatModel} 
                onChange={(e) => setChatModel(e.target.value)}
                className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2.5 py-1 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] font-medium text-[11px]"
              >
                {models.length > 0 ? (
                  models.map((m, idx) => (
                    <option key={idx} value={m.name}>{m.name}</option>
                  ))
                ) : (
                  <option value="">Sem modelos</option>
                )}
              </select>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pb-3 pr-1 text-xs">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] opacity-60">
                  Envie uma mensagem.
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl border ${
                      m.role === 'user' 
                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/10 rounded-br-none' 
                        : 'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border-transparent rounded-bl-none'
                    }`}>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="p-3 rounded-2xl bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border-transparent rounded-bl-none flex items-center gap-1.5">
                    <span className="material-symbols-outlined animate-spin text-sm">autorenew</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={sendChatMessage} className="flex gap-2 pt-3 border-t border-[var(--md-sys-color-surface-variant)]">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Sua mensagem..."
                disabled={chatLoading || !chatModel}
                className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3.5 py-2 text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)]"
              />
              <button 
                type="submit" 
                disabled={chatLoading || !chatInput.trim() || !chatModel}
                className="btn-primary w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-50 flex-shrink-0"
              >
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </form>
          </div>
        )}

        {/* AGENT HUB */}
        {subTab === 'agent' && (
          <div className="flex-1 flex flex-col h-[400px]">
            <form onSubmit={triggerAgent} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="Comando para o agente..."
                className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3.5 py-2 text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)]"
                disabled={agentLoading}
              />
              <div className="flex gap-2">
                <select 
                  value={agentMode} 
                  onChange={(e) => setAgentMode(e.target.value)}
                  className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2 py-2 outline-none text-[11px] font-medium"
                >
                  <option value="safe">Confirmar</option>
                  <option value="autonomous">Livre</option>
                </select>
                <button type="submit" disabled={agentLoading || !agentPrompt.trim()} className="btn-primary px-4 rounded-xl font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  <span>Executar</span>
                </button>
              </div>
            </form>

            <div className="flex-1 mt-4 flex flex-col bg-black text-green-400 font-mono text-[11px] p-3 rounded-xl overflow-hidden">
              <pre className="flex-1 overflow-auto whitespace-pre-wrap">{agentOutput || 'Console do Agente...'}</pre>
            </div>
          </div>
        )}

        {/* MANAGE HUB */}
        {subTab === 'manage' && (
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Models List */}
              <div className="space-y-2">
                <div className="border border-[var(--md-sys-color-surface-variant)] rounded-2xl overflow-hidden bg-[var(--md-sys-color-surface-variant)]/10">
                  {modelsLoading ? (
                    <div className="p-6 text-center">Carregando...</div>
                  ) : models.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                          <th className="text-left py-2 px-3 font-semibold">Modelo</th>
                          <th className="text-left py-2 px-3 font-semibold">Tamanho</th>
                          <th className="text-right py-2 px-3 font-semibold">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                        {models.map((m, idx) => (
                          <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                            <td className="py-2 px-3 font-mono font-medium">{m.name}</td>
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
                    <div className="p-6 text-center">Sem modelos instalados.</div>
                  )}
                </div>
              </div>

              {/* Download & Status */}
              <div className="space-y-4">
                {/* Download Form */}
                <form onSubmit={startPull} className="flex gap-2">
                  <input
                    type="text"
                    value={pullModelName}
                    onChange={(e) => setPullModelName(e.target.value)}
                    placeholder="deepseek-r1:8b"
                    disabled={pullLoading}
                    className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] text-xs"
                  />
                  <button type="submit" disabled={pullLoading || !pullModelName.trim()} className="btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 flex-shrink-0">
                    <span className="material-symbols-outlined text-sm">download</span>
                    <span>Baixar</span>
                  </button>
                </form>

                {/* Status Box */}
                <pre className="p-3 bg-black text-green-400 font-mono text-[10px] rounded-xl whitespace-pre-wrap overflow-auto max-h-[150px]">
                  {statusLoading ? 'Status...' : ollamaStatus}
                </pre>
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
      if (data.ok) addToast('Backup concluído!', 'success');
      else addToast(data.error || 'Falha no backup.', 'error');
    } catch {
      setOutput('Erro de processamento no servidor remoto.');
      addToast('Erro no backup.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">cloud_sync</span>
          <span className="font-semibold text-xs">Backup Geral</span>
        </div>
        <button onClick={runBackup} disabled={loading} className="btn-primary py-2 px-4 rounded-xl font-bold flex items-center gap-1">
          {loading ? (
            <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
          ) : (
            <>
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>Iniciar</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Storage */}
        {serverStatus?.disks && serverStatus.disks.length > 0 && (
          <div className="space-y-3">
            {serverStatus.disks.map((d, idx) => (
              <div key={idx} className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3 rounded-2xl space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="truncate">{d.mount}</span>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">{d.used} / {d.total}</span>
                </div>
                <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
                  <div 
                    className="bg-[var(--md-sys-color-primary)] h-full transition-all" 
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Console */}
        <div className="flex flex-col bg-black text-green-400 p-3 rounded-2xl font-mono text-[11px] min-h-[150px] max-h-[250px] overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 animate-pulse">
              <span className="animate-spin material-symbols-outlined text-sm">sync</span>
              <span>Sincronizando...</span>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap">{output || 'Logs do backup...'}</pre>
          )}
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
        addToast('Erro ao carregar usuários.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
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
        addToast(`Usuário salvo!`, 'success');
        setUsername('');
        setPassword('');
        fetchUsers();
      } else {
        addToast(data.error || 'Erro ao salvar.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  };

  const deleteUser = async (name) => {
    if (name === 'admin') return;
    if (!window.confirm(`Deseja remover ${name}?`)) return;

    setLoading(true);
    try {
      const data = await apiFetch(`/api/users?username=${name}`, {
        method: 'DELETE'
      });
      if (data.ok) {
        addToast(`Usuário removido!`, 'success');
        fetchUsers();
      } else {
        addToast('Erro ao excluir.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-6 text-center">Carregando...</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--md-sys-color-surface-variant)] border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                <th className="text-left py-2 px-3 font-semibold">Usuário</th>
                <th className="text-right py-2 px-3 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
              {users.map((u, idx) => (
                <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                  <td className="py-2 px-3 font-mono font-medium">{u.username}</td>
                  <td className="py-2 px-3 text-right">
                    {u.username !== 'admin' ? (
                      <button onClick={() => deleteUser(u.username)} className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]">
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

      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl">
        <form onSubmit={addUser} className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuário"
            disabled={loading}
            required
            className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] text-xs"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            disabled={loading}
            required
            className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] text-xs"
          />
          <button type="submit" disabled={loading} className="w-full btn-primary py-2 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm">save</span>
            <span>Salvar</span>
          </button>
        </form>
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
    if (!window.confirm(`Executar: ${title}?`)) return;

    setLoading(true);
    setOutput('');
    try {
      const data = await apiFetch(`/api/maintenance/${action}`, { method: 'POST' });
      setOutput(data.output || data.message || 'Concluído.');
      if (data.ok) addToast(`${title} executada!`, 'success');
      else addToast('Falha ao executar.', 'error');
    } catch {
      setOutput('Erro de conexão com o servidor.');
      addToast('Erro ao realizar manutenção.', 'error');
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
    if (!window.confirm(`Deseja ${action === 'start' ? 'ativar' : 'desativar'} a VPN?`)) return;
    
    setVpnLoading(true);
    try {
      const data = await apiFetch('/api/vpn/status', {
        method: 'POST',
        body: JSON.stringify({ action: action === 'start' ? 'up' : 'down' })
      });
      if (data.ok) {
        addToast(`Comando VPN enviado!`, 'success');
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
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* VPN Card & Maintenance buttons */}
        <div className="space-y-4">
          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">vpn_lock</span>
                VPN Tailscale
              </span>
              <button onClick={getVpnStatus} disabled={vpnLoading} className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-base">refresh</span>
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => toggleVpn('start')} disabled={vpnLoading} className="btn-primary py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-sm">vpn_lock</span>
                <span>Ligar</span>
              </button>
              <button onClick={() => toggleVpn('stop')} disabled={vpnLoading} className="btn-danger py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-sm">link_off</span>
                <span>Desligar</span>
              </button>
            </div>

            <pre className="p-3 bg-black text-green-400 font-mono text-[10px] rounded-xl max-h-[100px] overflow-auto whitespace-pre-wrap">
              {vpnLoading ? 'Carregando status...' : vpnStatus}
            </pre>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
            <span className="font-semibold text-xs flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">build</span>
              Manutenção
            </span>
            <div className="flex gap-2">
              <button onClick={() => runMaintenance('clean', 'Limpar Lixo')} disabled={loading} className="btn-ghost py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1 text-[var(--md-sys-color-error)] border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)]">
                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                <span>Limpar</span>
              </button>
              <button onClick={() => runMaintenance('update', 'Atualizar Servidor')} disabled={loading} className="btn-ghost py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1">
                <span className="material-symbols-outlined text-sm">system_update</span>
                <span>Atualizar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Output */}
        <div className="flex flex-col bg-black text-green-400 p-3 rounded-2xl font-mono text-[11px] min-h-[200px] max-h-[300px] overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 animate-pulse">
              <span className="animate-spin material-symbols-outlined text-sm">sync</span>
              <span>Executando...</span>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap">{output || 'Saída do console...'}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SSH SANDBOX HELPER VIEW ────────────────────────────────────────────────
function AntigravitySshView({ host, addToast }) {
  const [copied, setCopied] = useState(false);
  const sshCmd = `ssh root@${host || '100.119.122.10'} -p 2222`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sshCmd);
    setCopied(true);
    addToast('Copiado!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center max-w-sm mx-auto space-y-4">
      <h3 className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
        Antigravity SSH
      </h3>
      <div className="w-full bg-black text-green-400 p-3 rounded-xl font-mono text-[11px] text-left border border-gray-800 flex items-center justify-between select-all">
        <span className="truncate">{sshCmd}</span>
        <button 
          onClick={copyToClipboard}
          className="ml-2 bg-gray-900 hover:bg-gray-800 text-green-400 border border-gray-700 p-1.5 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
          title="Copiar"
        >
          <span className="material-symbols-outlined text-xs">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
      </div>
    </div>
  );
}
