'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmModal from './components/ConfirmModal';
import { getOrInitDeviceIdentity } from './hooks/useApi';

// ─── API FETCH WITH DEVICE IDENTITY ─────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('dashboard-token') : null;
  let deviceId = 'default-device';
  let deviceName = 'Navegador Web';
  if (typeof window !== 'undefined') {
    localStorage.removeItem('srv-ssh-override');
    const identity = getOrInitDeviceIdentity();
    deviceId = identity.deviceId;
    deviceName = identity.deviceName;
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    'x-device-id': deviceId,
    'x-device-name': deviceName,
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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 p-3 rounded-xl border border-[var(--md-sys-color-surface-variant)] animate-fade-in ${
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
          <span className="flex-1 font-medium text-xs break-words">{t.message}</span>
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
    const id = Date.now() + Math.random();
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
  const [authChecking, setAuthChecking] = useState(true);
  const [userRole, setUserRole] = useState('admin');
  const [activeTab, setActiveTab] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Confirm modal state (replaces window.confirm for TV/PWA/Mobile compatibility)
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    danger: true,
    onConfirm: null,
  });

  const askConfirm = useCallback(({ title, message, danger = true, onConfirm }) => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      danger,
      onConfirm: () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        if (typeof onConfirm === 'function') onConfirm();
      },
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // States for active iframe app
  const [activeApp, setActiveApp] = useState(null);
  const [iframeUrl, setIframeUrl] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState('');

  // Invisible Xbox Bluetooth Gamepad bridge (forwards controller input on TV/PC/Mobile to Steam & Roblox)
  useEffect(() => {
    if (activeTab !== 'app' || (activeApp?.id !== 'steam' && activeApp?.id !== 'roblox') || !iframeUrl) return;
    let baseOrigin = '';
    try {
      const u = new URL(iframeUrl);
      baseOrigin = u.origin;
    } catch {
      return;
    }
    let lastHash = '';
    const timer = setInterval(() => {
      if (!navigator.getGamepads) return;
      const pads = navigator.getGamepads();
      let pad = null;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
          pad = pads[i];
          break;
        }
      }
      if (!pad) return;
      const buttons = pad.buttons.map((b) => (b && (b.pressed || b.value > 0.5) ? 1 : 0));
      const b6 = pad.buttons[6] ? Math.round(pad.buttons[6].value * 100) / 100 : 0;
      const b7 = pad.buttons[7] ? Math.round(pad.buttons[7].value * 100) / 100 : 0;
      const axes = pad.axes.map((a) => (Math.abs(a) < 0.08 ? 0 : Math.round(a * 100) / 100));
      const hash = `${buttons.join('')}:${b6}:${b7}:${axes.join(',')}`;
      if (hash !== lastHash) {
        lastHash = hash;
        fetch(`${baseOrigin}/__gamepad/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buttons: buttons.map((v, idx) => (idx === 6 ? b6 : idx === 7 ? b7 : v)),
            axes,
          }),
          keepalive: true,
        }).catch(() => {});
      }
    }, 35);
    return () => clearInterval(timer);
  }, [activeTab, activeApp, iframeUrl]);

  // Applications definitions
  const apps = [
    { id: 'vscode',      name: 'VS Code',     icon: 'code',             type: 'sandbox', port: 8443 },
    { id: 'webtop',      name: 'Webtop',      icon: 'desktop_windows',  type: 'sandbox', port: 3000 },
    { id: 'steam',       name: 'Steam',       icon: 'sports_esports',   type: 'sandbox', port: 8083, path: '/web/?autoconnect=true&resize=scale' },
    { id: 'roblox',      name: 'Roblox',      icon: 'videogame_asset',  type: 'sandbox', port: 8083, path: '/web/?autoconnect=true&resize=scale', containerName: 'srv_steam_sandbox' },
    { id: 'erp',         name: 'ERP',         icon: 'storefront',       type: 'service', serviceName: 'srv_erp_mercados', containerName: 'srv_erp_mercados', port: 8090 },
    { id: 'filebrowser', name: 'Arquivos',    icon: 'folder_open',      type: 'sandbox', port: 8089, path: '/files/SRV_Storage/' },
    { id: 'kdenlive',    name: 'Kdenlive',    icon: 'movie',            type: 'sandbox', port: 3005 },
    { id: 'neovim',      name: 'Neovim',      icon: 'edit_note',        type: 'sandbox', port: 7683 },
    { id: 'antigravity', name: 'Antigravity', icon: 'vpn_key',          type: 'sandbox', port: 7685 },
    { id: 'terminal',    name: 'Terminal',    icon: 'terminal',         type: 'sandbox', port: 7682 },
    { id: 'ttyd',        name: 'Monitor',     icon: 'monitoring',       type: 'service', serviceName: 'ttyd', containerName: 'srv_monitor', port: 7681 },
    { id: 'cockpit',     name: 'Cockpit',     icon: 'web',              type: 'static',  port: 9090, protocol: 'https:' },
    { id: 'cups',        name: 'Impressora',  icon: 'print',            type: 'service', serviceName: 'cups', containerName: 'cupsd', port: 631 },
    { id: 'scanner',     name: 'Scanner',     icon: 'document_scanner', type: 'service', serviceName: 'scanner', containerName: 'scanservjs', port: 8080 },
    { id: 'metabase',    name: 'Metabase',    icon: 'analytics',        type: 'service', serviceName: 'srv_metabase', containerName: 'srv_metabase', port: 3003 },
    { id: 'jupyter',     name: 'Jupyter',     icon: 'science',          type: 'service', serviceName: 'srv_jupyter_spark', containerName: 'srv_jupyter_spark', port: 8888, path: '/lab', requiresAuthResolve: true },
    { id: 'onlyoffice',  name: 'Documentos',  icon: 'description',      type: 'service', serviceName: 'srv_onlyoffice', containerName: 'srv_onlyoffice', port: 8086, path: '/example/' },
    { id: 'emulator',    name: 'Android',     icon: 'phone_android',    type: 'service', serviceName: 'emulator', containerName: 'emulator-android-container-1', port: 6081, path: '/?autoconnect=true&resize=scale' },
    { id: 'jarvis',      name: 'Jarvis',      icon: 'smart_toy',        type: 'service', serviceName: 'jarvis', containerName: 'open-webui', port: 3010 },
    { id: 'windows',     name: 'Windows',     icon: 'window',           type: 'service', serviceName: 'win10', containerName: 'win10_teste', port: 8006 },
  ];

  // Auth check (only kicks to /login on explicit 401 or missing token — survives brief network hiccups)
  useEffect(() => {
    const validateAuth = async () => {
      const token = localStorage.getItem('dashboard-token');
      if (!token) {
        window.location.href = '/login';
        return;
      }

      try {
        const { deviceId, deviceName } = getOrInitDeviceIdentity();
        const res = await fetch('/api/auth/validate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-device-id': deviceId,
            'x-device-name': deviceName,
          },
          body: JSON.stringify({ deviceId, deviceName, activeView: 'home' }),
        });

        if (res.status === 401) {
          localStorage.removeItem('dashboard-token');
          window.location.href = '/login';
          return;
        }

        const data = await res.json();
        if (data.ok) {
          setUserRole(data.role || 'admin');
          setAuthValid(true);
        } else {
          localStorage.removeItem('dashboard-token');
          window.location.href = '/login';
        }
      } catch {
        // Transient network error: keep token locally and allow UI to retry
        setAuthValid(true);
      } finally {
        setAuthChecking(false);
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
          setServerStatus((prev) => ({ ...(prev || {}), online: false }));
        }
      })
      .catch(() => setServerStatus((prev) => ({ ...(prev || {}), online: false })));
  }, []);

  useEffect(() => {
    if (!authValid) return;
    fetchStatus();
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) {
        fetchStatus();
      }
    }, 10000);
    const onVisibility = () => {
      if (!document.hidden) fetchStatus();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authValid, fetchStatus]);

  const handleLogout = () => {
    localStorage.removeItem('dashboard-token');
    fetch('/api/auth/validate', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
  };

  const isRunning = useCallback(
    (app) => {
      if (!serverStatus?.runningContainers) return false;
      if (app.type === 'static') return Boolean(serverStatus?.online);
      const containerName = app.containerName || `srv_${app.id}_sandbox`;
      return serverStatus.runningContainers.some(
        (c) => c.toLowerCase() === containerName.toLowerCase() || c.toLowerCase().includes(containerName.toLowerCase())
      );
    },
    [serverStatus]
  );

  // Sandbox/Service Launcher
  const selectApp = async (app) => {
    if (!app) return;
    setActiveTab('app');
    setActiveApp(app);
    setIframeUrl('');
    setMobileMenuOpen(false);

    const directHost = typeof window !== 'undefined' ? window.location.hostname : '';
    const protocol = app.protocol || 'http:';
    const path = app.path || '';
    const targetUrl = directHost ? `${protocol}//${directHost}:${app.port}${path}` : '';

    const isContainerRunning = (name) => {
      if (!serverStatus?.runningContainers) return false;
      return serverStatus.runningContainers.some(
        (c) => c.toLowerCase() === name.toLowerCase() || c.toLowerCase().includes(name.toLowerCase())
      );
    };

    const isIPOrLocalhost = (h) => {
      if (h === 'localhost' || h === '127.0.0.1') return true;
      return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(h) || h.endsWith('.local');
    };
    const isLocal = isIPOrLocalhost(directHost);
    const isLocalHttp = isLocal && window.location.protocol === 'http:';

    // Fast path: if app is already running and pre-warmed tunnel URL exists, open immediately
    const prewarmedTunnel = !isLocalHttp && !app.requiresAuthResolve ? serverStatus?.activeTunnels?.[String(app.port)] : null;
    const appAlreadyUp = app.type === 'static' || isRunning(app);
    if (appAlreadyUp && prewarmedTunnel && app.id !== 'roblox' && app.id !== 'steam') {
      const base = prewarmedTunnel.replace(/\/$/, '');
      setIframeUrl(base + path);
      setLaunching(false);
      apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ action: 'update_device', activeView: 'app', activeApp: `${app.name}` }),
      }).catch(() => {});
      if (app.type === 'sandbox') {
        apiFetch(`/api/sandbox/${app.id}`, { method: 'POST' }).catch(() => {});
      }
      return;
    }

    const resolveUrl = async () => {
      setLaunchMessage('Conectando túnel seguro...');
      try {
        const tunRes = await apiFetch('/api/tunnel', {
          method: 'POST',
          body: JSON.stringify({
            port: app.port,
            protocol: app.protocol || 'http:',
            mode: isLocalHttp ? 'local_http' : 'tunnel',
            localHost: isLocalHttp ? directHost : undefined,
            path,
            appName: app.name,
          }),
        });
        if (tunRes.ok && tunRes.url) {
          return tunRes.url;
        } else if (tunRes.error) {
          throw new Error(tunRes.error);
        }
      } catch (e) {
        if (isLocalHttp && targetUrl) return targetUrl;
        throw e;
      }
      return targetUrl;
    };

    if (app.type === 'sandbox') {
      setLaunching(true);
      setLaunchMessage(`Iniciando ${app.name}...`);
      try {
        const res = await apiFetch(`/api/sandbox/${app.id}`, { method: 'POST' });
        if (res.ok) {
          const finalUrl = await resolveUrl();
          setIframeUrl(finalUrl);
          setLaunching(false);
          fetchStatus();
        } else {
          addToast(res.error || 'Erro ao iniciar aplicativo.', 'error');
          setLaunching(false);
          setActiveTab('home');
        }
      } catch (err) {
        addToast(err?.message || 'Erro de conexão.', 'error');
        setLaunching(false);
        setActiveTab('home');
      }
    } else if (app.type === 'service') {
      const containerName = app.containerName || `srv_${app.id}`;
      const running = isContainerRunning(containerName);

      if (running) {
        setLaunching(true);
        setLaunchMessage(`Conectando ${app.name}...`);
        try {
          const finalUrl = await resolveUrl();
          setIframeUrl(finalUrl);
        } catch (err) {
          addToast(err?.message || 'Erro ao conectar ao serviço.', 'error');
          setActiveTab('home');
        } finally {
          setLaunching(false);
        }
      } else {
        setLaunching(true);
        setLaunchMessage(`Iniciando serviço ${app.name}...`);
        try {
          const res = await apiFetch('/api/services', {
            method: 'POST',
            body: JSON.stringify({ service: app.serviceName, action: 'start' }),
          });
          if (res.ok) {
            setLaunchMessage(`Aguardando ${app.name} responder...`);
            setTimeout(async () => {
              try {
                const finalUrl = await resolveUrl();
                setIframeUrl(finalUrl);
              } catch (err) {
                addToast(err?.message || 'Erro ao conectar ao serviço.', 'error');
                setActiveTab('home');
              } finally {
                setLaunching(false);
                fetchStatus();
              }
            }, 3000);
          } else {
            addToast(res.error || 'Erro ao iniciar serviço.', 'error');
            setLaunching(false);
            setActiveTab('home');
          }
        } catch (err) {
          addToast(err?.message || 'Erro de conexão.', 'error');
          setLaunching(false);
          setActiveTab('home');
        }
      }
    } else {
      setLaunching(true);
      setLaunchMessage(`Conectando ${app.name}...`);
      try {
        const finalUrl = await resolveUrl();
        setIframeUrl(finalUrl);
      } catch (err) {
        addToast(err?.message || 'Erro ao conectar ao aplicativo.', 'error');
        setActiveTab('home');
      } finally {
        setLaunching(false);
      }
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
      apiFetch('/api/tunnel', { method: 'POST', body: JSON.stringify({ action: 'stop' }) }).catch(() => {});
    }
  };

  const reloadIframe = () => {
    const prev = iframeUrl;
    setIframeUrl('');
    setTimeout(() => setIframeUrl(prev), 100);
  };

  const stopActiveAppContainer = () => {
    if (!activeApp || activeApp.type === 'static') return;
    askConfirm({
      title: `Parar ${activeApp.name}`,
      message: `Deseja realmente parar o contêiner do aplicativo ${activeApp.name}?`,
      danger: true,
      onConfirm: async () => {
        setLaunching(true);
        setLaunchMessage(`Parando ${activeApp.name}...`);
        try {
          let endpoint = '';
          let body = {};

          if (activeApp.type === 'sandbox') {
            endpoint = '/api/docker/stop';
            let name = activeApp.containerName || `srv_${activeApp.id}_sandbox`;
            if (activeApp.id === 'filebrowser') name = 'srv_filebrowser';
            else if (activeApp.id === 'antigravity') name = 'srv_ag_sandbox';
            else if (activeApp.id === 'neovim') name = 'srv_nvim_sandbox';
            else if (activeApp.id === 'roblox') name = 'srv_steam_sandbox';
            body = { name };
          } else if (activeApp.type === 'service') {
            endpoint = '/api/services';
            body = { service: activeApp.serviceName, action: 'stop' };
          }

          if (endpoint) {
            const res = await apiFetch(endpoint, {
              method: 'POST',
              body: JSON.stringify(body),
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
      },
    });
  };

  if (authChecking || !authValid) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-background)] flex items-center justify-center text-xs text-[var(--md-sys-color-on-surface-variant)] gap-2">
        <span className="material-symbols-outlined animate-spin text-base text-[var(--md-sys-color-primary)]">autorenew</span>
        <span>Validando sessão...</span>
      </div>
    );
  }

  const allNavTabs = [
    { id: 'home', name: 'Início', icon: 'home' },
    { id: 'docker', name: 'Docker', icon: 'view_in_ar' },
    { id: 'vm', name: 'VM', icon: 'computer' },
    { id: 'ia', name: 'IA', icon: 'psychology' },
    { id: 'backup', name: 'Backup', icon: 'cloud_sync' },
    { id: 'users', name: 'Contas', icon: 'group' },
    { id: 'maintenance', name: 'Ajustes', icon: 'build', adminOnly: true },
  ];
  const isAdmin = userRole === 'admin';
  const navTabs = allNavTabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="flex flex-col h-screen bg-[var(--md-sys-color-background)] overflow-hidden text-[var(--md-sys-color-on-background)] relative">
      {/* Barra de Cabeçalho Superior para Celular */}
      <header
        className={`md:hidden h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] border-b border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex items-center justify-between pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] flex-shrink-0 z-20 ${
          activeTab === 'app' ? 'hidden' : 'flex'
        }`}
      >
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${serverStatus?.online ? 'bg-[var(--md-sys-color-tertiary)]' : 'bg-[var(--md-sys-color-error)]'}`} />
          <span className="font-bold tracking-tight text-sm google-sans">SRV</span>
        </div>
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5"
          title="Alternar tema"
        >
          <span className="material-symbols-outlined text-lg">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
        </button>
      </header>

      <div className={`flex flex-1 h-full overflow-hidden relative ${mobileMenuOpen ? 'z-50' : 'z-10'}`}>
        {/* ─── SIDEBAR ──────────────────────────────────────────────────────── */}
        <aside
          className={`border-r border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex flex-col justify-between flex-shrink-0 z-50 transition-all duration-200 w-[calc(4rem+env(safe-area-inset-left))] pl-[env(safe-area-inset-left)] ${
            mobileMenuOpen ? 'fixed inset-y-0 left-0' : 'hidden md:flex'
          }`}
        >
          <div className="flex flex-col flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-center py-4 border-b border-[var(--md-sys-color-surface-variant)] relative">
              <div className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-primary-container)] flex items-center justify-center relative">
                <span className="material-symbols-outlined text-[var(--md-sys-color-on-primary-container)] text-lg icon-filled">dns</span>
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--md-sys-color-surface)] ${
                    serverStatus?.online ? 'bg-[var(--md-sys-color-tertiary)]' : 'bg-[var(--md-sys-color-error)]'
                  }`}
                />
              </div>
            </div>

            <div className="px-2 py-4 flex flex-col items-center gap-1.5 overflow-y-auto flex-1 w-full">
              {navTabs.map((tab) => (
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

              <div className="w-6 border-t border-[var(--md-sys-color-surface-variant)] my-1" />

              {apps.map((app) => {
                const active = isRunning(app);
                return (
                  <button
                    key={app.id}
                    onClick={() => selectApp(app)}
                    title={`${app.name}${active ? ' (Ativo)' : ''}`}
                    className={`w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all relative ${
                      activeTab === 'app' && activeApp?.id === app.id
                        ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]'
                        : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{app.icon}</span>
                    {active && app.type !== 'static' && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--md-sys-color-tertiary)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 border-t border-[var(--md-sys-color-surface-variant)] flex flex-col items-center gap-2">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
              className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]"
            >
              <span className="material-symbols-outlined text-base">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </button>

            <button
              onClick={handleLogout}
              title="Sair"
              className="w-10 h-10 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-base">logout</span>
            </button>
          </div>
        </aside>

        {mobileMenuOpen && <div onClick={() => setMobileMenuOpen(false)} className="fixed inset-0 z-40 bg-black/30 md:hidden" />}

        {/* ─── MAIN WORKSPACE ───────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden pl-[env(safe-area-inset-left)] md:pl-0 pr-[env(safe-area-inset-right)]">
          <main className={`flex-1 overflow-y-auto relative ${activeTab === 'app' ? 'p-0' : 'p-4 md:p-6'}`}>
            {activeTab === 'home' && (
              <HomeView
                apps={apps}
                selectApp={selectApp}
                serverStatus={serverStatus}
                addToast={addToast}
                fetchStatus={fetchStatus}
                isRunning={isRunning}
                askConfirm={askConfirm}
                isAdmin={isAdmin}
              />
            )}
            {activeTab === 'docker' && <DockerView addToast={addToast} askConfirm={askConfirm} isAdmin={isAdmin} />}
            {activeTab === 'vm' && (
              <VmView
                addToast={addToast}
                askConfirm={askConfirm}
                isAdmin={isAdmin}
                openWindowsApp={() => selectApp(apps.find((a) => a.id === 'windows'))}
              />
            )}
            {activeTab === 'ia' && <IaHubView addToast={addToast} askConfirm={askConfirm} isAdmin={isAdmin} />}
            {activeTab === 'backup' && <BackupView serverStatus={serverStatus} addToast={addToast} />}
            {activeTab === 'users' && <UsersView addToast={addToast} askConfirm={askConfirm} isAdmin={isAdmin} />}
            {activeTab === 'maintenance' && isAdmin && (
              <MaintenanceView serverStatus={serverStatus} addToast={addToast} fetchStatus={fetchStatus} askConfirm={askConfirm} />
            )}

            {activeTab === 'app' && activeApp && (
              <div className="w-full h-full flex flex-col bg-[var(--md-sys-color-surface)] md:border md:border-[var(--md-sys-color-surface-variant)] md:rounded-2xl overflow-hidden">
                {/* App Iframe Controls */}
                <div className="h-10 px-4 bg-[var(--md-sys-color-surface-variant)] flex items-center justify-between border-b border-[var(--md-sys-color-surface-variant)] flex-shrink-0 text-xs">
                  <div className="flex items-center gap-2 max-w-[65%] overflow-hidden">
                    <button
                      onClick={closeActiveApp}
                      title="Voltar"
                      className="h-7 px-2 rounded-lg hover:bg-black/5 flex items-center gap-1 text-[var(--md-sys-color-on-surface-variant)] font-semibold flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      <span className="hidden sm:inline">Voltar</span>
                    </button>
                    <span className="material-symbols-outlined text-[16px] text-[var(--md-sys-color-primary)] flex-shrink-0">
                      {activeApp.icon}
                    </span>
                    <span className="font-semibold text-[var(--md-sys-color-on-surface)] truncate">{activeApp.name}</span>
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
                    <button
                      onClick={reloadIframe}
                      title="Recarregar"
                      className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]"
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                    </button>
                    {activeApp.type !== 'static' && (
                      <button
                        onClick={stopActiveAppContainer}
                        title="Parar"
                        className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center text-[var(--md-sys-color-error)]"
                      >
                        <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 bg-[var(--md-sys-color-background)] relative">
                  {iframeUrl && !launching ? (
                    <iframe
                      src={
                        typeof window !== 'undefined' &&
                        window.location.protocol === 'https:' &&
                        iframeUrl.startsWith('http://')
                          ? `/api/proxy?url=${encodeURIComponent(iframeUrl)}`
                          : iframeUrl
                      }
                      className="w-full h-full border-0"
                      allow="autoplay; clipboard-read; clipboard-write; fullscreen; gamepad"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                      <span className="material-symbols-outlined animate-spin text-2xl text-[var(--md-sys-color-primary)]">autorenew</span>
                      <span>{launchMessage || 'Iniciando aplicação...'}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Bottom Navigation for Mobile */}
      <nav
        className={`md:hidden border-t border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] flex items-center justify-around flex-shrink-0 z-20 pb-[env(safe-area-inset-bottom)] pt-1.5 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${
          activeTab === 'app' || mobileMenuOpen ? 'hidden' : 'flex'
        }`}
      >
        {navTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeApp) {
                closeActiveApp();
              }
              setActiveTab(tab.id);
            }}
            title={tab.name}
            className="flex items-center justify-center flex-1 py-1.5 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-primary)] transition-all"
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                activeTab === tab.id ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]' : ''
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg ${
                  activeTab === tab.id ? 'icon-filled text-[var(--md-sys-color-on-primary-container)]' : ''
                }`}
              >
                {tab.icon}
              </span>
            </div>
          </button>
        ))}
      </nav>

      <ConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        danger={confirmState.danger}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

// ─── HOME VIEW ──────────────────────────────────────────────────────────────
function HomeView({ apps, selectApp, serverStatus, addToast, fetchStatus, isRunning, askConfirm, isAdmin }) {
  const [loading, setLoading] = useState(false);

  const triggerPower = (action) => {
    const label = action === 'reboot' ? 'Reiniciar' : 'Desligar';
    askConfirm({
      title: `${label} servidor`,
      message: `Deseja realmente ${label.toLowerCase()} o servidor remoto agora?`,
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const data = await apiFetch(`/api/power/${action}`, { method: 'POST' });
          if (data.ok) addToast('Comando de energia executado com sucesso.', 'success');
          else addToast(data.error || 'Erro ao executar comando.', 'error');
        } catch {
          addToast('Erro ao conectar.', 'error');
        }
        setLoading(false);
      },
    });
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

  const mem = serverStatus?.memory || { total: 0, used: 0, percent: 0 };
  const tunnelCount = serverStatus?.activeTunnels ? Object.keys(serverStatus.activeTunnels).filter((k) => Number(k) < 10000).length : 0;

  return (
    <div className="space-y-5">
      {/* Top Quick Controls Bar */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-lg text-[var(--md-sys-color-primary)]">dns</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                  {serverStatus?.online ? 'Servidor Online' : 'Servidor Offline'}
                </span>
                {serverStatus?.route && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    {serverStatus.route}
                  </span>
                )}
              </div>
              {serverStatus?.uptime && (
                <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                  Ativo há {serverStatus.uptime} • {serverStatus.runningContainers?.length || 0} containers • {tunnelCount} túneis
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchStatus}
              title="Atualizar status"
              className="w-9 h-9 rounded-xl border border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
            {isAdmin && !serverStatus?.online && (
              <button
                onClick={triggerWol}
                disabled={loading}
                title="Ligar (WOL na rede local)"
                className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-primary)] text-white flex items-center justify-center transition-opacity hover:opacity-90"
              >
                <span className="material-symbols-outlined text-base">bolt</span>
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={() => triggerPower('reboot')}
                  disabled={loading || !serverStatus?.online}
                  title="Reiniciar"
                  className="w-9 h-9 rounded-xl border border-[var(--md-sys-color-warning)]/20 text-[var(--md-sys-color-warning)] bg-transparent hover:bg-[var(--md-sys-color-warning-container)]/10 flex items-center justify-center disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">restart_alt</span>
                </button>
                <button
                  onClick={() => triggerPower('shutdown')}
                  disabled={loading || !serverStatus?.online}
                  title="Desligar"
                  className="w-9 h-9 rounded-xl bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] hover:bg-[var(--md-sys-color-error-container)]/80 flex items-center justify-center disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">power_off</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Telemetry Summary Cards */}
      {serverStatus?.online && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3.5 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>CPU / Carga</span>
              <span className="material-symbols-outlined text-base text-[var(--md-sys-color-primary)]">memory</span>
            </div>
            <div className="text-base font-bold">{serverStatus.cpu ?? 0}%</div>
            <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
              <div className="bg-[var(--md-sys-color-primary)] h-full transition-all" style={{ width: `${Math.min(serverStatus.cpu ?? 0, 100)}%` }} />
            </div>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3.5 rounded-2xl space-y-1.5">
            <div className="flex items-center justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>Memória RAM</span>
              <span className="material-symbols-outlined text-base text-[var(--md-sys-color-primary)]">developer_board</span>
            </div>
            <div className="text-base font-bold">
              {mem.percent}% <span className="text-[10px] font-normal text-[var(--md-sys-color-on-surface-variant)]">({mem.used} / {mem.total} GB)</span>
            </div>
            <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
              <div className="bg-[var(--md-sys-color-primary)] h-full transition-all" style={{ width: `${Math.min(mem.percent, 100)}%` }} />
            </div>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3.5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>Containers Ativos</span>
              <span className="material-symbols-outlined text-base text-[var(--md-sys-color-tertiary)]">view_in_ar</span>
            </div>
            <div className="text-base font-bold">{serverStatus.runningContainers?.length || 0}</div>
            <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{tunnelCount} túneis HTTPS ativos</div>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3.5 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-[var(--md-sys-color-on-surface-variant)]">
              <span>Dispositivos Conectados</span>
              <span className="material-symbols-outlined text-base text-[var(--md-sys-color-primary)]">devices</span>
            </div>
            <div className="text-base font-bold">{serverStatus.activeDevices ?? 1}</div>
            <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">{serverStatus.route || 'Conexão Segura'}</div>
          </div>
        </div>
      )}

      {/* Quick Launch App Grid */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {apps.map((app) => {
            const running = isRunning(app);
            return (
              <button
                key={app.id}
                onClick={() => selectApp(app)}
                className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:border-[var(--md-sys-color-primary)] relative group"
              >
                {app.type !== 'static' && (
                  <span
                    title={running ? 'Em execução' : 'Parado (inicia ao abrir)'}
                    className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${
                      running ? 'bg-[var(--md-sys-color-tertiary)]' : 'bg-[var(--md-sys-color-surface-variant)]'
                    }`}
                  />
                )}
                <span className="material-symbols-outlined text-xl mb-1.5 text-[var(--md-sys-color-on-surface-variant)] group-hover:text-[var(--md-sys-color-primary)]">
                  {app.icon}
                </span>
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
                <span className="text-[var(--md-sys-color-on-surface-variant)] font-semibold">
                  {d.used} / {d.total}
                </span>
              </div>
              <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
                <div className="bg-[var(--md-sys-color-primary)] h-full transition-all" style={{ width: `${d.percent}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-[var(--md-sys-color-on-surface-variant)]">
                <span>{d.label || d.mount}</span>
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
function DockerView({ addToast, askConfirm, isAdmin }) {
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [logs, setLogs] = useState('');
  const [logsContainer, setLogsContainer] = useState('');
  const [tab, setTab] = useState('containers');
  const [loading, setLoading] = useState(false);
  const [filterAll, setFilterAll] = useState(false);
  const [search, setSearch] = useState('');

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

  const execDockerAction = async (action, name) => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/docker/${action}`, {
        method: 'POST',
        body: JSON.stringify({ name }),
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

  const triggerAction = (action, name) => {
    if (action === 'rm') {
      askConfirm({
        title: 'Remover contêiner',
        message: `Deseja realmente remover o contêiner ${name}?`,
        danger: true,
        onConfirm: () => execDockerAction('rm', name),
      });
      return;
    }
    execDockerAction(action, name);
  };

  const showLogs = async (name) => {
    setLogsContainer(name);
    setTab('logs');
    setLogs('');
    setLoading(true);
    try {
      const data = await apiFetch(`/api/docker/logs?name=${encodeURIComponent(name)}`);
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

  const restartDockerService = () => {
    askConfirm({
      title: 'Reiniciar Docker Daemon',
      message: 'Deseja reiniciar o serviço Docker no servidor remoto? Todos os contêineres serão reiniciados.',
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const data = await apiFetch('/api/docker/restart-service', { method: 'POST' });
          if (data.ok) addToast('Serviço Docker reiniciado!', 'success');
          else addToast(data.error || 'Falha ao reiniciar.', 'error');
        } catch {
          addToast('Erro de rede.', 'error');
        }
        setLoading(false);
      },
    });
  };

  const q = search.trim().toLowerCase();
  const filteredContainers = useMemo(
    () => (q ? containers.filter((c) => `${c.Names || ''} ${c.Image || ''} ${c.Status || ''}`.toLowerCase().includes(q)) : containers),
    [containers, q]
  );
  const filteredImages = useMemo(
    () => (q ? images.filter((i) => `${i.Repository || ''} ${i.Tag || ''}`.toLowerCase().includes(q)) : images),
    [images, q]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2.5 rounded-2xl text-xs">
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
            <span className="hidden sm:inline">Contêineres ({containers.length})</span>
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

        <div className="flex flex-wrap items-center gap-2">
          {tab !== 'logs' && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar..."
              className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2.5 py-1 text-[11px] outline-none w-32 sm:w-44"
            />
          )}
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
          <button
            onClick={tab === 'images' ? fetchImages : fetchContainers}
            disabled={loading}
            title="Atualizar"
            className="w-8 h-8 rounded-lg border border-[var(--md-sys-color-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)] flex items-center justify-center"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
          {isAdmin && (
            <button
              onClick={restartDockerService}
              disabled={loading}
              title="Reiniciar Serviço Docker"
              className="w-8 h-8 rounded-lg border border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-error)] flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-base">restart_alt</span>
            </button>
          )}
        </div>
      </div>

      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden min-h-[250px] flex flex-col">
        {loading && (
          <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-center gap-2 flex-1">
            <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
            <span>Carregando...</span>
          </div>
        )}

        {!loading && tab === 'containers' && (
          filteredContainers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)]/50 border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="text-left py-2.5 px-4 font-semibold">Nome</th>
                    <th className="text-left py-2.5 px-4 font-semibold">Estado</th>
                    <th className="text-left py-2.5 px-4 font-semibold hidden md:table-cell">Imagem</th>
                    <th className="text-left py-2.5 px-4 font-semibold hidden lg:table-cell">Portas</th>
                    <th className="text-right py-2.5 px-4 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {filteredContainers.map((c, idx) => {
                    const statusStr = c.Status || '';
                    const active = statusStr.includes('Up');
                    const paused = statusStr.includes('Paused');
                    const unhealthy = statusStr.includes('unhealthy');
                    return (
                      <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                        <td className="py-2.5 px-4 font-mono truncate max-w-[160px]">{c.Names}</td>
                        <td className="py-2.5 px-4">
                          <span
                            title={statusStr}
                            className={`font-medium ${
                              unhealthy
                                ? 'text-[var(--md-sys-color-warning)]'
                                : paused
                                ? 'text-[var(--md-sys-color-warning)]'
                                : active
                                ? 'text-[var(--md-sys-color-tertiary)]'
                                : 'text-[var(--md-sys-color-error)]'
                            }`}
                          >
                            {unhealthy ? 'Alerta' : paused ? 'Pausado' : active ? 'Ativo' : 'Parado'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 hidden md:table-cell font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] max-w-[180px] truncate">
                          {c.Image || '—'}
                        </td>
                        <td className="py-2.5 px-4 hidden lg:table-cell font-mono text-[10px] text-[var(--md-sys-color-on-surface-variant)] max-w-[200px] truncate">
                          {c.Ports || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right space-x-0.5 whitespace-nowrap">
                          {!active || paused ? (
                            <button
                              onClick={() => triggerAction('start', c.Names)}
                              title="Iniciar"
                              className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-primary)]"
                            >
                              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => triggerAction('stop', c.Names)}
                              title="Parar"
                              className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]"
                            >
                              <span className="material-symbols-outlined text-[16px]">stop</span>
                            </button>
                          )}
                          <button
                            onClick={() => triggerAction('restart', c.Names)}
                            title="Reiniciar"
                            className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-warning)]"
                          >
                            <span className="material-symbols-outlined text-[16px]">autorenew</span>
                          </button>
                          <button
                            onClick={() => showLogs(c.Names)}
                            title="Logs"
                            className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)]"
                          >
                            <span className="material-symbols-outlined text-[16px]">notes</span>
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => triggerAction('rm', c.Names)}
                              title="Remover"
                              className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">
              Nenhum contêiner encontrado.
            </div>
          )
        )}

        {!loading && tab === 'images' && (
          filteredImages.length > 0 ? (
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
                  {filteredImages.map((img, idx) => (
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
            <div className="p-8 text-center text-xs text-[var(--md-sys-color-on-surface-variant)] flex-1 flex items-center justify-center">
              Nenhuma imagem encontrada.
            </div>
          )
        )}

        {!loading && tab === 'logs' && (
          <div className="flex-1 flex flex-col p-3 bg-black text-green-400 font-mono text-xs overflow-hidden h-[380px]">
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
function IaHubView({ addToast, askConfirm, isAdmin }) {
  const [subTab, setSubTab] = useState('chat');
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [chatModel, setChatModel] = useState('');

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentEngine, setAgentEngine] = useState('antigravity');
  const [agentMode, setAgentMode] = useState('autonomous');
  const [agentOutput, setAgentOutput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);

  const [ollamaStatus, setOllamaStatus] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [pullModelName, setPullModelName] = useState('');
  const [pullLoading, setPullLoading] = useState(false);

  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await apiFetch('/api/ia/models');
      if (data.ok) {
        const lines = (data.output || '').split('\n').map((l) => l.trim()).filter(Boolean);
        const parsed = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/\s{2,}/);
          if (parts.length >= 3) {
            parsed.push({ name: parts[0], id: parts[1], size: parts[2] });
          }
        }
        if (data.gatewayModels && Array.isArray(data.gatewayModels)) {
          parsed.push(...data.gatewayModels);
        }
        setModels(parsed);
        setChatModel((prev) => prev || (parsed.length > 0 ? parsed[0].name : ''));
      } else {
        addToast(data.error || 'Erro ao carregar modelos da IA.', 'error');
      }
    } catch {
      addToast('Erro de rede ao carregar modelos da IA.', 'error');
    }
    setModelsLoading(false);
  }, [addToast]);

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
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const requestMsgs = [...messages, userMsg];
      const data = await apiFetch('/api/ia/chat', {
        method: 'POST',
        body: JSON.stringify({ model: chatModel, messages: requestMsgs }),
      });

      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else {
        const errTxt = data.error || 'Erro ao obter resposta da IA.';
        addToast(errTxt, 'error');
        setMessages((prev) => [...prev, { role: 'assistant', content: `Erro: ${errTxt}` }]);
      }
    } catch (err) {
      addToast(err?.message || 'Erro ao se conectar.', 'error');
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
        body: JSON.stringify({ prompt: agentPrompt, mode: agentMode, engine: agentEngine }),
      });
      if (data.ok) {
        setAgentOutput(data.output || 'Concluído.');
        addToast('Agente concluído.', 'success');
      } else {
        setAgentOutput(`Erro: ${data.error}`);
        addToast(data.error || 'Falha no agente.', 'error');
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
        body: JSON.stringify({ model: pullModelName }),
      });
      if (data.ok) {
        addToast(`Modelo ${pullModelName} baixado!`, 'success');
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

  const removeModel = (name) => {
    if (name.includes('/') || name === 'antigravity') {
      addToast('Modelos integrados de nuvem/CLI não podem ser removidos aqui.', 'info');
      return;
    }
    askConfirm({
      title: 'Remover modelo Ollama',
      message: `Deseja realmente remover o modelo ${name} do servidor?`,
      danger: true,
      onConfirm: async () => {
        try {
          const data = await apiFetch('/api/ia/remove', {
            method: 'POST',
            body: JSON.stringify({ model: name }),
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
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2 rounded-2xl text-xs gap-1.5">
        <button
          onClick={() => setSubTab('chat')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
            subTab === 'chat' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">forum</span>
          <span>Conversar</span>
        </button>
        {isAdmin && (
          <button
            onClick={() => setSubTab('agent')}
            className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
              subTab === 'agent' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
            <span>Agente</span>
          </button>
        )}
        <button
          onClick={() => setSubTab('manage')}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
            subTab === 'manage' ? 'bg-[var(--md-sys-color-primary)] text-white' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">settings</span>
          <span>Gerenciar</span>
        </button>
      </div>

      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl p-4 min-h-[300px] flex flex-col justify-between text-xs">
        {subTab === 'chat' && (
          <div className="flex-1 flex flex-col h-[420px]">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--md-sys-color-surface-variant)] mb-3 text-xs">
              <span className="font-semibold text-[var(--md-sys-color-on-surface-variant)] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">psychology</span>
                Modelo
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2.5 py-1 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] font-medium text-[11px]"
                >
                  {models.length > 0 ? (
                    models.map((m, idx) => (
                      <option key={idx} value={m.name}>
                        {m.name} ({m.size})
                      </option>
                    ))
                  ) : (
                    <option value="">Sem modelos</option>
                  )}
                </select>
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    title="Limpar conversa"
                    className="px-2 py-1 rounded-lg border border-[var(--md-sys-color-surface-variant)] text-[10px] hover:bg-[var(--md-sys-color-surface-variant)]"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pb-3 pr-1 text-xs">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[var(--md-sys-color-on-surface-variant)] opacity-60">
                  Envie uma mensagem.
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl border ${
                        m.role === 'user'
                          ? 'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] border-[var(--md-sys-color-primary)]/10 rounded-br-none'
                          : 'bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border-transparent rounded-bl-none'
                      }`}
                    >
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

        {subTab === 'agent' && (
          <div className="flex-1 flex flex-col h-[420px]">
            <form onSubmit={triggerAgent} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="Missão para o agente (ex: diagnostique o uso de RAM e containers ativos)..."
                className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3.5 py-2 text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)]"
                disabled={agentLoading}
              />
              <div className="flex flex-wrap gap-2">
                <select
                  value={agentEngine}
                  onChange={(e) => setAgentEngine(e.target.value)}
                  className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2.5 py-2 outline-none text-[11px] font-medium"
                >
                  <option value="antigravity">Antigravity (Gemini 4 Argon)</option>
                  <option value="gemma4">Gemma 4 (Ollama Servidor)</option>
                  <option value="crewai">CrewAI (Software House)</option>
                  <option value="interpreter">Open Interpreter</option>
                </select>
                <select
                  value={agentMode}
                  onChange={(e) => setAgentMode(e.target.value)}
                  className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2 py-2 outline-none text-[11px] font-medium"
                >
                  <option value="autonomous">Autônomo</option>
                  <option value="safe">Seguro</option>
                </select>
                <button type="submit" disabled={agentLoading || !agentPrompt.trim()} className="btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">{agentLoading ? 'autorenew' : 'play_arrow'}</span>
                  <span>{agentLoading ? 'Rodando...' : 'Executar'}</span>
                </button>
              </div>
            </form>

            <div className="flex-1 mt-4 flex flex-col bg-black text-green-400 font-mono text-[11px] p-3 rounded-xl overflow-hidden">
              <pre className="flex-1 overflow-auto whitespace-pre-wrap">{agentOutput || 'Console do Agente (Antigravity + Gemma 4 + CrewAI)...'}</pre>
            </div>
          </div>
        )}

        {subTab === 'manage' && (
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                              {m.name.includes('/') || m.name === 'antigravity' ? (
                                <span className="inline-block px-2 py-0.5 text-[10px] rounded-full bg-[var(--md-sys-color-primary)]/10 text-[var(--md-sys-color-primary)] font-semibold">
                                  {m.name === 'antigravity' ? 'CLI' : 'Cloud'}
                                </span>
                              ) : isAdmin ? (
                                <button
                                  onClick={() => removeModel(m.name)}
                                  title="Remover"
                                  className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]"
                                >
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              ) : null}
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

              <div className="space-y-4">
                {isAdmin && (
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
                      <span>{pullLoading ? 'Baixando...' : 'Baixar'}</span>
                    </button>
                  </form>
                )}

                <pre className="p-3 bg-black text-green-400 font-mono text-[10px] rounded-xl whitespace-pre-wrap overflow-auto max-h-[220px]">
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
  const [photosLoading, setPhotosLoading] = useState(false);
  const [externalMounted, setExternalMounted] = useState(null);

  const fetchBackupStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/backup/status');
      if (data.ok) {
        setOutput(data.log || '');
        setLoading(Boolean(data.running));
      }
    } catch {}
  }, []);

  const fetchStorageMount = useCallback(async () => {
    try {
      const data = await apiFetch('/api/backup/storage');
      if (data.ok) setExternalMounted(Boolean(data.externalMounted));
    } catch {}
  }, []);

  useEffect(() => {
    fetchBackupStatus();
    fetchStorageMount();
  }, [fetchBackupStatus, fetchStorageMount]);

  useEffect(() => {
    const interval = setInterval(fetchBackupStatus, loading ? 3000 : 15000);
    return () => clearInterval(interval);
  }, [loading, fetchBackupStatus]);

  const runBackup = async () => {
    setOutput('Iniciando backup no servidor...');
    try {
      const data = await apiFetch('/api/backup/full', { method: 'POST' });
      if (data.ok) {
        addToast(data.message || 'Backup iniciado!', 'success');
        fetchBackupStatus();
      } else {
        addToast(data.error || 'Falha ao iniciar o backup.', 'error');
        setOutput(data.error || 'Falha ao iniciar o backup.');
      }
    } catch {
      addToast('Erro ao iniciar o backup.', 'error');
    }
  };

  const stopBackup = async () => {
    try {
      const data = await apiFetch('/api/backup/full', {
        method: 'POST',
        body: JSON.stringify({ action: 'stop' }),
      });
      if (data.ok) addToast(data.message || 'Sinal de parada enviado.', 'info');
      else addToast(data.error || 'Falha ao parar backup.', 'error');
    } catch {
      addToast('Erro ao enviar sinal de parada.', 'error');
    }
  };

  const runPhotosBackup = async () => {
    setPhotosLoading(true);
    setOutput('');
    try {
      const data = await apiFetch('/api/backup/photos', { method: 'POST' });
      setOutput(data.output || data.message || data.error || 'Concluído.');
      if (data.ok) {
        addToast('Sincronização de fotos iniciada!', 'success');
        if (data.url) {
          window.open(data.url, '_blank');
        }
      } else {
        addToast(data.error || 'Falha na sincronização.', 'error');
      }
    } catch {
      setOutput('Erro de processamento no servidor remoto.');
      addToast('Erro na sincronização de fotos.', 'error');
    }
    setPhotosLoading(false);
  };

  return (
    <div className="space-y-4 text-xs">
      {externalMounted === false && (
        <div className="border border-[var(--md-sys-color-warning)]/30 bg-[var(--md-sys-color-warning-container)] text-[var(--md-sys-color-on-warning-container)] p-3 rounded-2xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">usb_off</span>
            <span>HD Externo (/mnt/hd_externo) desconectado. Conecte o disco para executar backups na nuvem.</span>
          </div>
          <button onClick={fetchStorageMount} className="px-2.5 py-1 rounded-lg bg-black/10 font-semibold">
            Verificar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">cloud_sync</span>
            <div>
              <span className="font-semibold text-xs block">Backup Geral</span>
              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                Destino: /mnt/hd_externo/Nuvem ({externalMounted ? 'Montado' : 'Desconectado'})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <button onClick={stopBackup} className="btn-danger py-2 px-3 rounded-xl font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-base">stop</span>
                <span>Parar</span>
              </button>
            )}
            <button onClick={runBackup} disabled={loading || photosLoading} className="btn-primary py-2 px-4 rounded-xl font-bold flex items-center gap-1 disabled:opacity-50">
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
        </div>

        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">photo_library</span>
            <div className="flex flex-col">
              <span className="font-semibold text-xs">Sincronização Google Fotos</span>
              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Requer autenticação via Webtop</span>
            </div>
          </div>
          <button onClick={runPhotosBackup} disabled={loading || photosLoading} className="btn-primary py-2 px-4 rounded-xl font-bold flex items-center gap-1 disabled:opacity-50">
            {photosLoading ? (
              <span className="animate-spin material-symbols-outlined text-base">autorenew</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">sync</span>
                <span>Sincronizar</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {serverStatus?.disks && serverStatus.disks.length > 0 && (
          <div className="space-y-3">
            {serverStatus.disks.map((d, idx) => (
              <div key={idx} className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-3 rounded-2xl space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="truncate">{d.mount}</span>
                  <span className="text-[var(--md-sys-color-on-surface-variant)]">
                    {d.used} / {d.total}
                  </span>
                </div>
                <div className="w-full bg-[var(--md-sys-color-surface-variant)] h-1 rounded-full overflow-hidden">
                  <div className="bg-[var(--md-sys-color-primary)] h-full transition-all" style={{ width: `${d.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col bg-black text-green-400 p-3 rounded-2xl font-mono text-[11px] min-h-[150px] max-h-[250px] overflow-auto relative">
          {loading && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-black/80 px-2 py-1 rounded-lg border border-green-500/20 text-[10px] animate-pulse">
              <span className="animate-spin material-symbols-outlined text-[10px]">sync</span>
              <span>Sincronizando...</span>
            </div>
          )}
          <pre className="whitespace-pre-wrap">{output || 'Logs do backup...'}</pre>
        </div>
      </div>
    </div>
  );
}

// ─── USERS & SESSIONS VIEW ──────────────────────────────────────────────────
function UsersView({ addToast, askConfirm, isAdmin }) {
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/users');
      if (data.ok) {
        setUsers(data.users || []);
        setSessions(data.sessions || []);
        setCurrentDeviceId(data.currentDeviceId || '');
        if (typeof window !== 'undefined') {
          setDeviceNameInput(localStorage.getItem('srv-device-name') || '');
        }
      } else {
        addToast(data.error || 'Erro ao carregar usuários.', 'error');
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
        body: JSON.stringify({ username: username.trim(), password: password.trim(), role }),
      });
      if (data.ok) {
        addToast(data.updated ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
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

  const deleteUser = (name) => {
    if (name === 'admin') return;
    askConfirm({
      title: 'Excluir usuário',
      message: `Deseja remover o usuário ${name}?`,
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const data = await apiFetch(`/api/users?username=${encodeURIComponent(name)}`, {
            method: 'DELETE',
          });
          if (data.ok) {
            addToast('Usuário removido!', 'success');
            fetchUsers();
          } else {
            addToast(data.error || 'Erro ao excluir.', 'error');
          }
        } catch {
          addToast('Erro de conexão.', 'error');
        }
        setLoading(false);
      },
    });
  };

  const updateDeviceName = async (e) => {
    e.preventDefault();
    const cleanName = deviceNameInput.trim();
    if (!cleanName) return;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('srv-device-name', cleanName);
      }
      const data = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ action: 'update_device', deviceName: cleanName }),
      });
      if (data.ok) {
        addToast('Nome do dispositivo atualizado!', 'success');
        fetchUsers();
      } else {
        addToast(data.error || 'Erro ao atualizar dispositivo.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
  };

  const revokeSession = (sessionId, label) => {
    askConfirm({
      title: 'Revogar sessão',
      message: `Desconectar remotamente o dispositivo "${label}"?`,
      danger: true,
      onConfirm: async () => {
        try {
          const data = await apiFetch(`/api/users?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
          });
          if (data.ok) {
            addToast('Sessão encerrada.', 'success');
            fetchUsers();
          } else {
            addToast(data.error || 'Erro ao encerrar sessão.', 'error');
          }
        } catch {
          addToast('Erro de rede.', 'error');
        }
      },
    });
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--md-sys-color-surface-variant)] font-semibold flex items-center justify-between">
            <span>Contas do Painel</span>
            <button onClick={fetchUsers} className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center">
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>
          </div>
          {loading && users.length === 0 ? (
            <div className="p-6 text-center">Carregando...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--md-sys-color-surface-variant)]/50 border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                  <th className="text-left py-2 px-3 font-semibold">Usuário</th>
                  <th className="text-left py-2 px-3 font-semibold">Perfil</th>
                  <th className="text-center py-2 px-3 font-semibold">Sessões</th>
                  <th className="text-right py-2 px-3 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                {users.map((u, idx) => (
                  <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30 transition-colors">
                    <td className="py-2 px-3 font-mono font-medium">{u.username}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--md-sys-color-surface-variant)]">
                        {u.role || 'operator'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-mono">{u.activeSessions || 0}</td>
                    <td className="py-2 px-3 text-right">
                      {isAdmin && u.username !== 'admin' ? (
                        <button
                          onClick={() => deleteUser(u.username)}
                          className="w-7 h-7 rounded-lg hover:bg-black/5 inline-flex items-center justify-center text-[var(--md-sys-color-error)]"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] italic pr-2 select-none">
                          {u.username === 'admin' ? 'Mestre' : 'Ativo'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-4">
          {isAdmin && (
            <>
              <span className="font-semibold block">Criar ou Atualizar Usuário</span>
              <form onSubmit={addUser} className="space-y-3">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Usuário (2-32 chars)"
                  disabled={loading}
                  required
                  className="w-full bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    disabled={loading}
                    required
                    className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none border border-transparent focus:border-[var(--md-sys-color-primary)] text-xs"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none text-xs"
                  >
                    <option value="operator">Operador</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" disabled={loading} className="w-full btn-primary py-2 px-4 rounded-xl font-bold flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>Salvar Usuário</span>
                </button>
              </form>
            </>
          )}

          <form onSubmit={updateDeviceName} className={`${isAdmin ? 'pt-3 border-t border-[var(--md-sys-color-surface-variant)]' : ''} space-y-2`}>
            <span className="font-semibold block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">Nome deste dispositivo</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="Ex: TV Sala / Notebook"
                className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-2 outline-none text-xs"
              />
              <button type="submit" className="btn-ghost px-3 py-2 rounded-xl font-semibold">
                Renomear
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Dispositivos e Sessões Conectadas */}
      <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--md-sys-color-surface-variant)] font-semibold flex items-center justify-between">
          <span>Dispositivos & Sessões ({sessions.length})</span>
        </div>
        {sessions.length === 0 ? (
          <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)]">Nenhuma sessão de dispositivo registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--md-sys-color-surface-variant)]/50 border-b border-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface-variant)]">
                  <th className="text-left py-2 px-3 font-semibold">Dispositivo</th>
                  <th className="text-left py-2 px-3 font-semibold">Usuário</th>
                  <th className="text-left py-2 px-3 font-semibold hidden sm:table-cell">Rede</th>
                  <th className="text-left py-2 px-3 font-semibold">Status / App</th>
                  <th className="text-right py-2 px-3 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                {sessions.map((s) => (
                  <tr key={s.deviceId} className="hover:bg-[var(--md-sys-color-surface-variant)]/30">
                    <td className="py-2 px-3 font-medium">
                      {s.deviceName}
                      {s.deviceId === currentDeviceId && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] text-[9px] font-bold">
                          Atual
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono">{s.username}</td>
                    <td className="py-2 px-3 text-[10px] text-[var(--md-sys-color-on-surface-variant)] hidden sm:table-cell">
                      {s.networkScope || 'Sessão Segura'}
                    </td>
                    <td className="py-2 px-3">
                      <span className={s.online ? 'text-[var(--md-sys-color-tertiary)] font-semibold' : 'text-[var(--md-sys-color-on-surface-variant)]'}>
                        {s.online ? 'Online' : `Inativo (${s.idleSeconds}s)`}
                      </span>
                      {s.activeApp && <span className="block text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{s.activeApp}</span>}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => revokeSession(s.deviceId, s.deviceName)}
                        title="Desconectar dispositivo"
                        className="px-2 py-1 rounded-lg bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] text-[10px] font-semibold"
                      >
                        Revogar
                      </button>
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

// ─── MAINTENANCE & CONTROL CENTER VIEW ─────────────────────────────────────
function MaintenanceView({ addToast, fetchStatus, askConfirm }) {
  const [subTab, setSubTab] = useState('terminal'); // terminal, system, maintenance, logs
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [vpnLoading, setVpnLoading] = useState(false);
  const [vpnInfo, setVpnInfo] = useState({ output: '', loggedOut: false, authUrl: null });
  const [envInfo, setEnvInfo] = useState(null);

  // Terminal Direto HTTPS states
  const [cmdInput, setCmdInput] = useState('');
  const [cwd, setCwd] = useState('~');
  const [termHistory, setTermHistory] = useState([]);
  const [termRunning, setTermRunning] = useState(false);
  const termEndRef = useRef(null);

  // System Control states
  const [sysData, setSysData] = useState({ processes: [], services: [], listeningPorts: [], activeTunnels: [] });
  const [sysLoading, setSysLoading] = useState(false);

  // Audit logs states
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logLevel, setLogLevel] = useState('all');
  const [logSearch, setLogSearch] = useState('');

  const runDirectCommand = async (customCmd) => {
    const commandToRun = (typeof customCmd === 'string' ? customCmd : cmdInput).trim();
    if (!commandToRun || termRunning) return;
    if (typeof customCmd !== 'string') setCmdInput('');

    setTermRunning(true);
    setTermHistory((prev) => [...prev, { type: 'cmd', cwd, text: commandToRun }]);
    try {
      const data = await apiFetch('/api/terminal/exec', {
        method: 'POST',
        body: JSON.stringify({ command: commandToRun, cwd }),
      });
      if (data.ok) {
        if (data.cwd) setCwd(data.cwd);
        setTermHistory((prev) => [
          ...prev,
          {
            type: 'out',
            text: data.output,
            exitCode: data.exitCode,
            route: data.route || 'Conexão Segura',
          },
        ]);
      } else {
        setTermHistory((prev) => [...prev, { type: 'err', text: data.error || 'Erro ao executar comando.' }]);
      }
    } catch (err) {
      setTermHistory((prev) => [...prev, { type: 'err', text: err?.message || 'Erro de conexão.' }]);
    }
    setTermRunning(false);
  };

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [termHistory, termRunning]);

  const fetchSystemControl = useCallback(async () => {
    setSysLoading(true);
    try {
      const data = await apiFetch('/api/system/control');
      if (data.ok) {
        setSysData({
          processes: data.processes || [],
          services: data.services || [],
          listeningPorts: data.listeningPorts || [],
          activeTunnels: data.activeTunnels || [],
        });
      } else {
        addToast(data.error || 'Erro ao carregar processos e serviços.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
    setSysLoading(false);
  }, [addToast]);

  const handleKillProcess = (pid, comm) => {
    askConfirm({
      title: 'Encerrar processo',
      message: `Deseja encerrar o processo ${comm} (PID ${pid})?`,
      danger: true,
      onConfirm: async () => {
        try {
          const data = await apiFetch('/api/system/control', {
            method: 'POST',
            body: JSON.stringify({ action: 'kill_process', pid }),
          });
          if (data.ok) {
            addToast(data.message || `PID ${pid} encerrado.`, 'success');
            fetchSystemControl();
          } else {
            addToast(data.error || 'Falha ao encerrar processo.', 'error');
          }
        } catch {
          addToast('Erro de rede.', 'error');
        }
      },
    });
  };

  const handleServiceAction = async (service, op) => {
    setSysLoading(true);
    try {
      const data = await apiFetch('/api/system/control', {
        method: 'POST',
        body: JSON.stringify({ action: 'service', service, op }),
      });
      if (data.ok) {
        addToast(`${service}: ${op} concluído!`, 'success');
        fetchSystemControl();
        fetchStatus();
      } else {
        addToast(data.error || 'Erro no serviço.', 'error');
        setSysLoading(false);
      }
    } catch {
      addToast('Erro de rede.', 'error');
      setSysLoading(false);
    }
  };

  const runMaintenance = (action, title) => {
    askConfirm({
      title,
      message: `Deseja executar "${title}" no servidor remoto?`,
      danger: action === 'update',
      onConfirm: async () => {
        setLoading(true);
        setOutput('');
        try {
          const data = await apiFetch(`/api/maintenance/${action}`, { method: 'POST' });
          setOutput(data.output || data.message || 'Concluído.');
          if (data.ok) addToast(`${title} executada!`, 'success');
          else addToast(data.error || 'Falha ao executar.', 'error');
        } catch {
          setOutput('Erro de conexão com o servidor.');
          addToast('Erro ao realizar manutenção.', 'error');
        }
        setLoading(false);
      },
    });
  };

  const getVpnStatus = useCallback(async () => {
    setVpnLoading(true);
    try {
      const data = await apiFetch('/api/vpn/status');
      setVpnInfo({
        output: data.output || 'Não foi possível obter status.',
        loggedOut: Boolean(data.loggedOut),
        authUrl: data.authUrl || null,
      });
    } catch {
      setVpnInfo({ output: 'Erro ao conectar.', loggedOut: false, authUrl: null });
    }
    setVpnLoading(false);
  }, []);

  const fetchDebugEnv = useCallback(async () => {
    try {
      const data = await apiFetch('/api/debug-env');
      if (data.ok) setEnvInfo(data.env || null);
    } catch {}
  }, []);

  const toggleVpn = (action) => {
    askConfirm({
      title: action === 'start' ? 'Ativar VPN Tailscale' : 'Desativar VPN Tailscale',
      message: `Deseja ${action === 'start' ? 'ativar' : 'desativar'} a VPN Tailscale no servidor?`,
      danger: action === 'stop',
      onConfirm: async () => {
        setVpnLoading(true);
        try {
          const data = await apiFetch('/api/vpn/status', {
            method: 'POST',
            body: JSON.stringify({ action: action === 'start' ? 'up' : 'down' }),
          });
          if (data.ok) {
            addToast(data.message || 'Comando VPN enviado!', data.needsAuth ? 'info' : 'success');
            if (data.authUrl) {
              setVpnInfo({ output: data.output || data.message, loggedOut: true, authUrl: data.authUrl });
            } else {
              setTimeout(() => {
                getVpnStatus();
                fetchStatus();
              }, 3000);
            }
          } else {
            addToast(data.error || 'Erro ao executar.', 'error');
          }
        } catch {
          addToast('Erro de rede.', 'error');
        }
        setVpnLoading(false);
      },
    });
  };

  const fetchAuditLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '150',
        level: logLevel,
        ...(logSearch.trim() ? { search: logSearch.trim() } : {}),
      });
      const data = await apiFetch(`/api/logs?${params.toString()}`);
      if (data.ok) {
        setAuditLogs(data.logs || []);
      } else {
        addToast(data.error || 'Erro ao carregar auditoria.', 'error');
      }
    } catch {
      addToast('Erro de rede.', 'error');
    }
    setLogsLoading(false);
  }, [logLevel, logSearch, addToast]);

  const clearLogs = () => {
    askConfirm({
      title: 'Limpar logs de auditoria',
      message: 'Deseja limpar os registros locais e remotos de auditoria?',
      danger: true,
      onConfirm: async () => {
        try {
          const data = await apiFetch('/api/logs', { method: 'DELETE' });
          if (data.ok) {
            addToast('Logs limpos.', 'success');
            fetchAuditLogs();
          }
        } catch {
          addToast('Erro ao limpar logs.', 'error');
        }
      },
    });
  };

  useEffect(() => {
    if (subTab === 'system') fetchSystemControl();
    if (subTab === 'maintenance') {
      getVpnStatus();
      fetchDebugEnv();
    }
    if (subTab === 'logs') fetchAuditLogs();
  }, [subTab, fetchSystemControl, getVpnStatus, fetchDebugEnv, fetchAuditLogs]);

  const quickCommands = [
    { label: 'Status Geral', cmd: 'uptime && free -h && df -h /' },
    { label: 'Containers', cmd: 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"' },
    { label: 'Túnel Bore (Porta 22)', cmd: 'journalctl -u bore-tunnel -n 15 --no-pager' },
    { label: 'Portas Ativas', cmd: 'ss -tulpn | grep LISTEN' },
    { label: 'Modelos Ollama', cmd: 'ollama list' },
    { label: 'Tailscale', cmd: 'tailscale status' },
    { label: 'Top CPU', cmd: 'ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 12' },
    { label: 'Logs Sistema', cmd: 'journalctl -n 30 --no-pager' },
  ];

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-2 rounded-2xl">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'terminal', label: 'Console SSH Direto', icon: 'terminal' },
            { id: 'system', label: 'Processos & Serviços', icon: 'monitoring' },
            { id: 'maintenance', label: 'VPN & Manutenção', icon: 'build' },
            { id: 'logs', label: 'Auditoria & Erros', icon: 'history' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSubTab(item.id)}
              className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 transition-all ${
                subTab === item.id
                  ? 'bg-[var(--md-sys-color-primary)] text-white'
                  : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {subTab === 'system' && (
          <button
            onClick={fetchSystemControl}
            disabled={sysLoading}
            className="px-2.5 py-1.5 rounded-xl border border-[var(--md-sys-color-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)] flex items-center gap-1"
          >
            <span className={`material-symbols-outlined text-sm ${sysLoading ? 'animate-spin' : ''}`}>refresh</span>
            <span>Atualizar</span>
          </button>
        )}
      </div>

      {/* 1. CONSOLE SSH DIRETO */}
      {subTab === 'terminal' && (
        <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {quickCommands.map((q, idx) => (
              <button
                key={idx}
                onClick={() => runDirectCommand(q.cmd)}
                disabled={termRunning}
                className="px-2.5 py-1 rounded-lg bg-[var(--md-sys-color-surface-variant)] hover:bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-primary-container)] font-medium text-[11px] transition-colors"
              >
                {q.label}
              </button>
            ))}
            <button
              onClick={() => setTermHistory([])}
              className="ml-auto px-2.5 py-1 rounded-lg border border-[var(--md-sys-color-surface-variant)] text-[11px] opacity-75 hover:opacity-100"
            >
              Limpar
            </button>
          </div>

          <div className="bg-black text-green-400 font-mono text-[11px] p-3.5 rounded-xl h-[360px] overflow-y-auto space-y-2 border border-gray-800">
            {termHistory.length === 0 ? (
              <div className="text-gray-500">Console SSH Direto via HTTPS (com estado de diretório persistente)</div>
            ) : (
              termHistory.map((item, i) => (
                <div key={i}>
                  {item.type === 'cmd' && (
                    <div className="text-cyan-400 font-bold">
                      srv:{item.cwd}$ <span className="text-white font-normal">{item.text}</span>
                    </div>
                  )}
                  {item.type === 'out' && (
                    <pre className="whitespace-pre-wrap text-green-300 pl-1">
                      {item.text}
                      {item.exitCode !== 0 ? `\n[Exit Code: ${item.exitCode}]` : ''}
                    </pre>
                  )}
                  {item.type === 'err' && <pre className="whitespace-pre-wrap text-red-400 pl-1">{item.text}</pre>}
                </div>
              ))
            )}
            {termRunning && <div className="text-yellow-400 animate-pulse">Executando comando no servidor...</div>}
            <div ref={termEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runDirectCommand();
            }}
            className="flex gap-2"
          >
            <span className="px-2.5 py-2 rounded-xl bg-black text-cyan-400 font-mono text-[11px] flex items-center">{cwd}$</span>
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              placeholder="Digite qualquer comando Linux (ex: systemctl status docker, free -h, ls -la)..."
              disabled={termRunning}
              className="flex-1 bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3.5 py-2 font-mono text-xs outline-none border border-transparent focus:border-[var(--md-sys-color-primary)]"
            />
            <button type="submit" disabled={termRunning || !cmdInput.trim()} className="btn-primary px-4 py-2 rounded-xl font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">send</span>
              <span>Executar</span>
            </button>
          </form>
        </div>
      )}

      {/* 2. PROCESSOS, SERVIÇOS & TÚNEIS */}
      {subTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">settings_applications</span>
                Serviços Críticos do Servidor (systemd)
              </span>
              <div className="divide-y divide-[var(--md-sys-color-surface-variant)] max-h-[340px] overflow-y-auto">
                {sysData.services.map((srv, idx) => (
                  <div key={idx} className="py-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${srv.active ? 'bg-[var(--md-sys-color-tertiary)]' : 'bg-[var(--md-sys-color-error)]'}`} />
                      <span className="font-mono font-semibold">{srv.name}</span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">({srv.state})</span>
                    </div>
                    <div className="flex gap-1">
                      {!srv.active ? (
                        <button onClick={() => handleServiceAction(srv.name, 'start')} className="px-2 py-1 rounded-lg bg-green-600 text-white text-[10px] font-bold">
                          Iniciar
                        </button>
                      ) : (
                        <button onClick={() => handleServiceAction(srv.name, 'stop')} className="px-2 py-1 rounded-lg bg-red-600/80 text-white text-[10px] font-bold">
                          Parar
                        </button>
                      )}
                      <button onClick={() => handleServiceAction(srv.name, 'restart')} className="px-2 py-1 rounded-lg bg-[var(--md-sys-color-surface-variant)] text-[10px] font-semibold">
                        Reiniciar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-2">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">public</span>
                Túneis Remotos & Portas em Escuta
              </span>
              {sysData.activeTunnels.length > 0 && (
                <div className="p-2.5 rounded-xl bg-black text-green-400 font-mono text-[11px] space-y-1 max-h-[180px] overflow-y-auto">
                  {sysData.activeTunnels.map((t, i) => (
                    <div key={i} className="truncate">
                      🔗 {t}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {sysData.listeningPorts.map((p, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-lg bg-[var(--md-sys-color-surface-variant)] font-mono text-[10px]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-[var(--md-sys-color-surface-variant)] font-semibold flex items-center justify-between">
              <span>Top Processos (CPU / RAM)</span>
              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Clique no X para encerrar</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-variant)]/50 text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="text-left py-2 px-3">PID</th>
                    <th className="text-left py-2 px-3">Processo</th>
                    <th className="text-right py-2 px-3">CPU%</th>
                    <th className="text-right py-2 px-3">MEM%</th>
                    <th className="text-right py-2 px-3">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--md-sys-color-surface-variant)]">
                  {sysData.processes.map((proc, idx) => (
                    <tr key={idx} className="hover:bg-[var(--md-sys-color-surface-variant)]/30">
                      <td className="py-1.5 px-3 font-mono text-[10px]">{proc.pid}</td>
                      <td className="py-1.5 px-3 font-mono font-medium truncate max-w-[140px]">{proc.command}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{proc.cpu}%</td>
                      <td className="py-1.5 px-3 text-right font-mono">{proc.mem}%</td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          onClick={() => handleKillProcess(proc.pid, proc.command)}
                          title={`Encerrar PID ${proc.pid}`}
                          className="w-6 h-6 rounded-lg hover:bg-red-500/20 text-[var(--md-sys-color-error)] inline-flex items-center justify-center"
                        >
                          <span className="material-symbols-outlined text-[15px]">close</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. VPN TAILSCALE & MANUTENÇÃO */}
      {subTab === 'maintenance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

              {vpnInfo.authUrl && (
                <a
                  href={vpnInfo.authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-2.5 rounded-xl bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] font-semibold text-center hover:opacity-90"
                >
                  Autenticar Tailscale no Navegador ↗
                </a>
              )}

              <pre className="p-3 bg-black text-green-400 font-mono text-[10px] rounded-xl max-h-[120px] overflow-auto whitespace-pre-wrap">
                {vpnLoading ? 'Carregando status...' : vpnInfo.output}
              </pre>
            </div>

            <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">build</span>
                Manutenção
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => runMaintenance('clean', 'Limpar Lixo')}
                  disabled={loading}
                  className="btn-ghost py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1 text-[var(--md-sys-color-error)] border-[var(--md-sys-color-error)]/20 hover:bg-[var(--md-sys-color-error-container)]"
                >
                  <span className="material-symbols-outlined text-sm">delete_sweep</span>
                  <span>Limpar</span>
                </button>
                <button onClick={() => runMaintenance('update', 'Atualizar Servidor')} disabled={loading} className="btn-ghost py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-sm">system_update</span>
                  <span>Atualizar</span>
                </button>
              </div>
            </div>

            {envInfo && (
              <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-2">
                <span className="font-semibold text-xs flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">verified_user</span>
                  Ambiente Vercel / Integrações
                </span>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {Object.entries(envInfo.CONFIGURED_SECRETS || {}).map(([k, ok]) => (
                    <span
                      key={k}
                      className={`px-2 py-0.5 rounded-full font-mono ${
                        ok ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-500'
                      }`}
                    >
                      {k}: {ok ? 'OK' : 'N/D'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col bg-black text-green-400 p-3 rounded-2xl font-mono text-[11px] min-h-[200px] max-h-[360px] overflow-auto">
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
      )}

      {/* 4. AUDITORIA & ERROS */}
      {subTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-surface-variant)] p-3 rounded-2xl">
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value)}
              className="bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-2.5 py-1.5 text-xs outline-none"
            >
              <option value="all">Todos os níveis</option>
              <option value="info">Info</option>
              <option value="warn">Alertas (Warn)</option>
              <option value="error">Erros</option>
            </select>
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Buscar rota, dispositivo, erro..."
              className="flex-1 min-w-[160px] bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] rounded-xl px-3 py-1.5 text-xs outline-none"
            />
            <button onClick={fetchAuditLogs} disabled={logsLoading} className="btn-primary px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1">
              <span className={`material-symbols-outlined text-sm ${logsLoading ? 'animate-spin' : ''}`}>refresh</span>
              <span>Atualizar</span>
            </button>
            <button onClick={clearLogs} className="btn-danger px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">delete_sweep</span>
              <span>Limpar</span>
            </button>
          </div>

          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] rounded-2xl overflow-hidden max-h-[420px] overflow-y-auto divide-y divide-[var(--md-sys-color-surface-variant)]">
            {logsLoading && auditLogs.length === 0 ? (
              <div className="p-6 text-center">Carregando logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-center text-[var(--md-sys-color-on-surface-variant)]">Nenhum registro encontrado.</div>
            ) : (
              auditLogs.map((item, idx) => (
                <div key={item.id || idx} className="p-3 space-y-1 hover:bg-[var(--md-sys-color-surface-variant)]/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                          item.level === 'error'
                            ? 'bg-red-500/15 text-red-600'
                            : item.level === 'warn'
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}
                      >
                        {item.level || 'info'}
                      </span>
                      <span className="font-semibold truncate">{item.route || item.action || item.message}</span>
                      {item.selfHealed && (
                        <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 text-[9px] font-bold">Auto-corrigido</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : ''}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex flex-wrap gap-x-3 gap-y-0.5">
                    {item.user && <span>Usuário: {item.user}</span>}
                    {item.deviceName && <span>Disp: {item.deviceName}</span>}
                    {item.sshRoute && <span>Rota: {item.sshRoute}</span>}
                    {item.responseTime && <span>Tempo: {item.responseTime}</span>}
                  </div>
                  {item.rootCause && <p className="text-[10px] text-[var(--md-sys-color-error)]">Causa: {item.rootCause}</p>}
                  {item.remediationAction && <p className="text-[10px] text-[var(--md-sys-color-tertiary)]">Ação: {item.remediationAction}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VM VIEW (Windows Update Automation) ────────────────────────────────────
function VmView({ addToast, askConfirm, isAdmin, openWindowsApp }) {
  const [output, setOutput] = useState('');
  const [winStatus, setWinStatus] = useState({ isos: { win10: false, win11: false }, vmRunning: false, reports: [] });
  const [winLoading, setWinLoading] = useState(false);

  const fetchWindowsStatus = useCallback(async () => {
    setWinLoading(true);
    try {
      const data = await apiFetch('/api/maintenance/windows');
      if (data.ok) {
        setWinStatus(data);
      }
    } catch {
      addToast('Erro ao obter status do Windows.', 'error');
    }
    setWinLoading(false);
  }, [addToast]);

  const toggleWinVm = (action) => {
    const title = action === 'start_vm' ? 'Iniciar VM de Testes' : 'Parar VM de Testes';
    askConfirm({
      title,
      message: `Deseja ${title.toLowerCase()} no servidor?`,
      danger: action === 'stop_vm',
      onConfirm: async () => {
        setWinLoading(true);
        try {
          const data = await apiFetch('/api/maintenance/windows', {
            method: 'POST',
            body: JSON.stringify({ action }),
          });
          if (data.ok) {
            addToast(`${title} executado!`, 'success');
            setOutput(data.output || data.message || 'Concluído.');
            setTimeout(fetchWindowsStatus, 3000);
          } else {
            addToast(data.error || 'Erro ao executar.', 'error');
          }
        } catch {
          addToast('Erro de rede.', 'error');
        }
        setWinLoading(false);
      },
    });
  };

  useEffect(() => {
    fetchWindowsStatus();
  }, [fetchWindowsStatus]);

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[var(--md-sys-color-primary)]">desktop_windows</span>
                Automação Windows (VM & Update)
              </span>
              <button onClick={fetchWindowsStatus} disabled={winLoading} className="w-7 h-7 rounded-lg hover:bg-black/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-base">refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="p-2 rounded-xl bg-black/5 flex flex-col items-center justify-center text-center">
                <span className="font-semibold text-gray-500">Win10 ISO</span>
                <span className={`mt-1 px-1.5 py-0.5 rounded font-bold ${winStatus.isos?.win10 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                  {winStatus.isos?.win10 ? 'Disponível' : 'Ausente'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-black/5 flex flex-col items-center justify-center text-center">
                <span className="font-semibold text-gray-500">Win11 ISO</span>
                <span className={`mt-1 px-1.5 py-0.5 rounded font-bold ${winStatus.isos?.win11 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                  {winStatus.isos?.win11 ? 'Disponível' : 'Ausente'}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-black/5 flex flex-col items-center justify-center text-center">
                <span className="font-semibold text-gray-500">VM de Testes</span>
                <span className={`mt-1 px-1.5 py-0.5 rounded font-bold ${winStatus.vmRunning ? 'bg-green-500/10 text-green-600' : 'bg-gray-500/10 text-gray-500'}`}>
                  {winStatus.vmRunning ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>

            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => toggleWinVm('start_vm')}
                  disabled={winLoading || winStatus.vmRunning}
                  className="btn-primary py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  <span>Ligar VM</span>
                </button>
                <button
                  onClick={() => toggleWinVm('stop_vm')}
                  disabled={winLoading || !winStatus.vmRunning}
                  className="btn-danger py-2 px-3 rounded-xl font-bold flex-1 flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-sm">stop</span>
                  <span>Desligar VM</span>
                </button>
              </div>
            )}

            {winStatus.vmRunning && (
              <div className="bg-black/5 p-3 rounded-xl space-y-2 animate-fade-in">
                <button onClick={openWindowsApp} className="w-full btn-primary py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">open_in_browser</span>
                  <span>Abrir Tela do Windows no Painel (HTTPS)</span>
                </button>
                <div className="space-y-1 text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                  <div>
                    Acesso gráfico remoto criptografado pelo túnel seguro do painel
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] p-4 rounded-2xl space-y-3 flex flex-col h-full min-h-[300px]">
            <span className="font-semibold text-xs text-[var(--md-sys-color-on-surface)] block">
              Relatórios de Atualização da Rede ({winStatus.reports?.length || 0})
            </span>
            <div className="flex-1 overflow-y-auto border border-[var(--md-sys-color-surface-variant)] rounded-xl divide-y divide-[var(--md-sys-color-surface-variant)] bg-[var(--md-sys-color-surface)] max-h-[400px]">
              {!winStatus.reports || winStatus.reports.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-xs">Nenhum relatório de máquina encontrado.</div>
              ) : (
                winStatus.reports.map((rep, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between gap-3 hover:bg-black/5 transition-colors">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--md-sys-color-on-surface)] text-xs truncate">{rep.hostname}</span>
                        <span className="text-gray-400 font-mono text-[10px]">({rep.oldBuild})</span>
                      </div>
                      <p className="text-gray-500 text-[10px] truncate max-w-xs">{rep.message}</p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                          rep.status === 'SUCESSO'
                            ? 'bg-green-500/10 text-green-600'
                            : rep.status === 'IGNORADO'
                            ? 'bg-gray-500/10 text-gray-500'
                            : 'bg-red-500/10 text-red-600'
                        }`}
                      >
                        {rep.status}
                      </span>
                      <span className="block text-[9px] text-gray-400 font-mono">
                        {rep.date} {rep.time}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {output && (
        <div className="flex flex-col bg-black text-green-400 p-3 rounded-2xl font-mono text-[11px] max-h-[150px] overflow-auto">
          <pre className="whitespace-pre-wrap">{output}</pre>
        </div>
      )}
    </div>
  );
}
