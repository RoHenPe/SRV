/**
 * SSH & HTTP Bridge utility — usado por todas as API routes.
 * Suporta:
 * - Multi-rota inteligente (Cloudflare Bridge HTTPS, Bridge Env/LAN, SSH direto LAN/VPN/Túnel)
 * - Autenticação de Bridge via hash SHA-256 (sem trafegar senha em texto claro nos headers)
 * - Semáforo de concorrência SSH e controle RBAC por perfil (roles)
 * - Sanitização automática de qualquer mensagem de erro ou log antes de sair do servidor
 */
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { NodeSSH } from 'node-ssh';
import { requireAuth, AuthError } from './auth';
import { checkRateLimit, RateLimitError, getClientIp, getClientDeviceId, getClientDeviceName } from './rateLimit';
import { logRequest, logAction } from './logger';
import { classifyError, attemptSelfHealing, recordErrorFlow } from './errorFlow';
import { formatClientSafeError, sanitizeSensitiveText } from './sanitize';

const sshContext = new AsyncLocalStorage();

let cachedEndpoint = null;
let cachedCfBridgeUrl = null;
let latestBridgeTunnels = {};

export function getCachedTunnels() {
  return { ...latestBridgeTunnels };
}

export function updateBridgeState({ cfBridgeUrl = null, tunnels = null } = {}) {
  if (cfBridgeUrl && typeof cfBridgeUrl === 'string' && cfBridgeUrl.startsWith('https://')) {
    cachedCfBridgeUrl = cfBridgeUrl;
  }
  if (tunnels && typeof tunnels === 'object') {
    latestBridgeTunnels = { ...latestBridgeTunnels, ...tunnels };
  }
}

export function resetConnectionCache() {
  cachedEndpoint = null;
  cachedCfBridgeUrl = null;
}

function getBridgeAuthHeader() {
  const secret = process.env.BRIDGE_SECRET || process.env.SSH_PASSWORD || '';
  if (!secret) return '';
  return crypto.createHash('sha256').update(secret, 'utf-8').digest('hex');
}

function getRouteLabel(label) {
  switch (label) {
    case 'cf-bridge':
      return 'Cloudflare Bridge';
    case 'env-bridge':
      return 'Bridge Configurado';
    case 'lan-bridge':
      return 'Bridge LAN';
    case 'public-tunnel':
    case 'fallback-main':
    case 'tunnel':
      return 'Túnel Remoto';
    case 'tailscale-vpn':
    case 'public-vpn':
    case 'fallback-vpn':
      return 'VPN Tailscale';
    case 'lan':
      return 'Rede Local';
    default:
      return 'Conexão Segura';
  }
}

async function executeViaHttpBridge(command, customTimeoutMs = null) {
  const isVercelCloud = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const token = getBridgeAuthHeader();
  if (!token) return null;

  const timeoutMs = customTimeoutMs || 12000;
  const bridgeCandidates = [];

  if (cachedCfBridgeUrl) {
    bridgeCandidates.push({
      url: `${cachedCfBridgeUrl.replace(/\/$/, '')}/exec`,
      host: 'cloudflare-bridge',
      port: 443,
      label: 'cf-bridge',
    });
  }
  if (process.env.BRIDGE_URL && process.env.BRIDGE_URL.trim()) {
    bridgeCandidates.push({
      url: `${process.env.BRIDGE_URL.trim().replace(/\/$/, '')}/exec`,
      host: 'env-bridge',
      port: 443,
      label: 'env-bridge',
    });
  }
  if (!isVercelCloud && process.env.SSH_HOST_LAN) {
    const lanHost = process.env.SSH_HOST_LAN.split(':')[0].trim();
    if (lanHost) {
      bridgeCandidates.push({
        url: `http://${lanHost}:18022/exec`,
        host: lanHost,
        port: 18022,
        label: 'lan-bridge',
      });
    }
  }
  if (process.env.SSH_BRIDGE_FALLBACK_URL && process.env.SSH_BRIDGE_FALLBACK_URL.trim()) {
    bridgeCandidates.push({
      url: `${process.env.SSH_BRIDGE_FALLBACK_URL.trim().replace(/\/$/, '')}/exec`,
      host: 'fallback-bridge',
      port: 443,
      label: 'env-bridge',
    });
  }

  for (const cand of bridgeCandidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs + 4000, 65000));
    const reqStart = Date.now();
    try {
      const res = await fetch(cand.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': token,
        },
        body: JSON.stringify({ command, timeoutMs }),
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn('[Bridge] Candidate HTTP error:', cand.label, res.status);
        continue;
      }
      const data = await res.json();
      if (data && typeof data.code === 'number') {
        if (data.cfBridgeUrl && typeof data.cfBridgeUrl === 'string' && data.cfBridgeUrl.startsWith('https://')) {
          cachedCfBridgeUrl = data.cfBridgeUrl;
        }
        if (data.tunnels && typeof data.tunnels === 'object') {
          latestBridgeTunnels = { ...latestBridgeTunnels, ...data.tunnels };
        }
        const store = sshContext.getStore();
        const routeLabel = getRouteLabel(cand.label);
        if (store) {
          store.lastRoute = routeLabel;
        }
        return {
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          code: data.code ?? 0,
          _internalHost: cand.host,
          route: routeLabel,
        };
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn('[Bridge] Candidate unreachable:', cand.label, err?.name || 'error');
      if (cand.label === 'cf-bridge' && Date.now() - reqStart < 8000) {
        cachedCfBridgeUrl = null;
      }
    }
  }
  return null;
}

const MAX_CONCURRENT_SSH = 12;
let activeSshCount = 0;
const sshQueue = [];

function acquireSshSlot() {
  if (activeSshCount < MAX_CONCURRENT_SSH) {
    activeSshCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    sshQueue.push(resolve);
  });
}

function releaseSshSlot() {
  if (sshQueue.length > 0) {
    const next = sshQueue.shift();
    next();
  } else {
    activeSshCount = Math.max(0, activeSshCount - 1);
  }
}

export function getRequestContext() {
  return sshContext.getStore() || {};
}

function isPrivateOrTailscaleHost(host) {
  if (!host) return false;
  const cleanHost = host.split(':')[0].trim().toLowerCase();
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost.endsWith('.local') || cleanHost.endsWith('.ts.net')) {
    return true;
  }
  if (/^192\.168\./.test(cleanHost) || /^10\./.test(cleanHost) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHost)) {
    return true;
  }
  const match100 = cleanHost.match(/^100\.(\d+)\./);
  if (match100) {
    const secondOctet = parseInt(match100[1], 10);
    if (secondOctet >= 64 && secondOctet <= 127) return true;
  }
  return false;
}

function parseEndpoint(rawHost, defaultPort = 22) {
  if (!rawHost || typeof rawHost !== 'string') return null;
  const trimmed = rawHost.trim().replace(/^tcp:\/\//, '').replace(/^ssh:\/\//, '');
  if (!trimmed || /\s/.test(trimmed)) return null;
  const isValidHost = (h) => /^[a-zA-Z0-9.-]+$/.test(h) && !h.startsWith('.') && !h.endsWith('.');
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0 && !trimmed.includes(']')) {
    const hostPart = trimmed.slice(0, lastColon).trim();
    const portPart = parseInt(trimmed.slice(lastColon + 1).trim(), 10);
    if (hostPart && isValidHost(hostPart) && !Number.isNaN(portPart) && portPart > 0 && portPart <= 65535) {
      return { host: hostPart, port: portPart, key: `${hostPart}:${portPart}` };
    }
    return null;
  }
  if (!isValidHost(trimmed)) return null;
  return { host: trimmed, port: defaultPort, key: `${trimmed}:${defaultPort}` };
}

export function getTargetHost() {
  if (process.env.SSH_HOST_LAN) {
    return process.env.SSH_HOST_LAN.split(':')[0].trim();
  }
  if (cachedEndpoint?.host) return cachedEndpoint.host;
  const defaultPort = process.env.SSH_PORT ? parseInt(process.env.SSH_PORT, 10) : 22;
  const primary = parseEndpoint(process.env.SSH_HOST, defaultPort);
  const vpn = parseEndpoint(process.env.SSH_HOST_VPN, 22);
  return primary?.host || vpn?.host || '';
}

function buildEndpointsList() {
  const defaultPort = process.env.SSH_PORT ? parseInt(process.env.SSH_PORT, 10) : 22;
  const isVercelCloud = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  const candidates = [];
  const seen = new Set();

  const addCandidate = (ep, label) => {
    if (!ep || !ep.host) return;
    if (seen.has(ep.key)) return;
    seen.add(ep.key);
    candidates.push({ ...ep, label });
  };

  if (cachedEndpoint) {
    if (!isVercelCloud || !isPrivateOrTailscaleHost(cachedEndpoint.host)) {
      addCandidate(cachedEndpoint, cachedEndpoint.label || 'cache');
    }
  }

  const epTunnelOrMain = parseEndpoint(process.env.SSH_TUNNEL_HOST || process.env.SSH_HOST, defaultPort);
  const epVpn = parseEndpoint(process.env.SSH_HOST_VPN, 22);
  const epLan = parseEndpoint(process.env.SSH_HOST_LAN, 22);

  if (isVercelCloud) {
    if (epTunnelOrMain && !isPrivateOrTailscaleHost(epTunnelOrMain.host)) {
      addCandidate(epTunnelOrMain, 'public-tunnel');
    }
    if (epVpn && !isPrivateOrTailscaleHost(epVpn.host)) {
      addCandidate(epVpn, 'public-vpn');
    }
    addCandidate(epTunnelOrMain, 'fallback-main');
    addCandidate(epVpn, 'fallback-vpn');
  } else {
    addCandidate(epLan, 'lan');
    addCandidate(epVpn, 'tailscale-vpn');
    addCandidate(epTunnelOrMain, 'tunnel');
  }

  return candidates;
}

function normalizeSshCommand(rawCommand) {
  if (typeof rawCommand !== 'string') return rawCommand;
  let cmd = rawCommand.replace(/\bsudo\s+docker\b/g, 'docker');
  // Usa sudo -n (NOPASSWD configurado no host) sem nunca embutir senha em texto claro na linha de comando
  cmd = cmd.replace(/\bsudo\s+(?!-[nS]\b)/g, 'sudo -n ');
  return cmd;
}

/**
 * Executa um comando SSH no servidor remoto via Bridge HTTP seguro ou conexão SSH direta.
 */
export async function runSSH(rawCommand, customTimeoutMs = null) {
  const command = normalizeSshCommand(rawCommand);
  const bridgeRes = await executeViaHttpBridge(command, customTimeoutMs);
  if (bridgeRes) {
    return bridgeRes;
  }

  await acquireSshSlot();
  try {
    const ssh = new NodeSSH();
    const endpointsToTry = buildEndpointsList();

    if (endpointsToTry.length === 0) {
      throw new Error('Servidor remoto não configurado no ambiente.');
    }

    const baseConnectConfig = {
      username: process.env.SSH_USER || 'rodrigo',
      algorithms: {
        serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-rsa'],
      },
    };

    if (process.env.SSH_PASSWORD) {
      baseConnectConfig.password = process.env.SSH_PASSWORD;
    } else if (process.env.SSH_PRIVATE_KEY_B64) {
      const keyBuffer = Buffer.from(process.env.SSH_PRIVATE_KEY_B64, 'base64');
      baseConnectConfig.privateKey = keyBuffer.toString('utf-8');
    } else {
      const fs = await import('fs');
      const os = await import('os');
      const homeDir = os.default.homedir();
      const candidateKeys = [`${homeDir}/.ssh/id_ed25519`, `${homeDir}/.ssh/id_rsa`];
      let foundKey = null;
      for (const kp of candidateKeys) {
        try {
          foundKey = fs.default.readFileSync(/*turbopackIgnore: true*/ kp, 'utf-8');
          if (foundKey) break;
        } catch (_) {}
      }
      if (foundKey) {
        baseConnectConfig.privateKey = foundKey;
      } else {
        throw new Error('Credenciais SSH não configuradas no servidor de aplicação.');
      }
    }

    let connectedEndpoint = null;
    const failureReasons = [];

    for (const ep of endpointsToTry) {
      try {
        let targetIp = ep.host;
        try {
          const dns = await import('dns');
          const lookup = await dns.promises.lookup(ep.host, { family: 4 });
          targetIp = lookup.address;
        } catch (_) {}

        const timeoutMs = customTimeoutMs || (isPrivateOrTailscaleHost(ep.host) ? 2500 : 5000);

        await ssh.connect({
          ...baseConnectConfig,
          host: targetIp,
          port: ep.port,
          readyTimeout: timeoutMs,
        });

        connectedEndpoint = ep;
        cachedEndpoint = ep;
        break;
      } catch (err) {
        failureReasons.push(`${ep.label}:${err.code || 'ERR'}`);
      }
    }

    if (!connectedEndpoint) {
      cachedEndpoint = null;
      throw new Error(`Servidor inalcançável via SSH (${failureReasons.join(', ')}).`);
    }

    let result;
    try {
      result = await ssh.execCommand(command);
      ssh.dispose();
    } catch (err) {
      try { ssh.dispose(); } catch (_) {}
      throw err;
    }

    const routeLabel = getRouteLabel(connectedEndpoint.label);
    const store = sshContext.getStore();
    if (store) {
      store.lastRoute = routeLabel;
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code ?? 0,
      _internalHost: connectedEndpoint.host,
      route: routeLabel,
    };
  } finally {
    releaseSshSlot();
  }
}

/**
 * Executa comando para inicializar um serviço/container de forma concorrente-segura (com flock por porta).
 */
export async function runAndEnsurePort({ startCmd, port, containerName, maxWaitSeconds = 14 }) {
  const unpausePrefix = containerName ? `docker unpause ${containerName} >/dev/null 2>&1 || true; ` : '';
  const checkCmd = `${unpausePrefix}if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .; then exit 0; else exit 1; fi`;
  const isListening = await runSSH(checkCmd);
  if (isListening.code === 0) {
    return { alreadyRunning: true, port };
  }

  const waitAttempts = Math.max(Math.round(maxWaitSeconds * 2), 8);
  const cleanStartCmd = `${unpausePrefix}${startCmd.replace(/\bsudo\s+docker\b/g, 'docker')}`;
  const startB64 = Buffer.from(cleanStartCmd, 'utf-8').toString('base64');

  const atomicEnsureScript = `
    mkdir -p /tmp/srv_locks_rodrigo 2>/dev/null || true
    (
      flock -x -w 25 200 || exit 1
      if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .; then
        echo "ALREADY_RUNNING"
        exit 0
      fi
      eval "$(echo '${startB64}' | base64 -d)"
      for i in $(seq 1 ${waitAttempts}); do
        if ss -tlnH "sport = :${port}" 2>/dev/null | grep -q .; then
          echo "STARTED_OK"
          exit 0
        fi
        sleep 0.5
      done
      exit 1
    ) 200>/tmp/srv_locks_rodrigo/srv_port_${port}.lock
  `;

  const ensureResult = await runSSH(atomicEnsureScript, 20000);
  if (ensureResult.code !== 0) {
    throw new Error(`Porta ${port} não ficou disponível após ${maxWaitSeconds}s.`);
  }

  const ctx = getRequestContext();
  await logAction('ensure_port', ensureResult.stdout.includes('ALREADY_RUNNING') ? 'reused' : 'started', {
    port,
    containerName: containerName || null,
    user: ctx.username || 'admin',
    deviceId: ctx.deviceId || 'default-device',
    deviceName: ctx.deviceName || 'Dispositivo Web',
  });

  return {
    alreadyRunning: ensureResult.stdout.includes('ALREADY_RUNNING'),
    started: ensureResult.stdout.includes('STARTED_OK'),
    port,
  };
}

/**
 * Wrapper padrão para API routes — RBAC por perfil, rate limit, self-healing, auditoria sanitizada e respostas seguras.
 */
export async function apiHandler(fn, request = null, routeName = 'unknown', options = {}) {
  const startTime = Date.now();
  let status = 500;
  let username = 'anonymous';
  const deviceId = request ? getClientDeviceId(request) : 'server-internal';
  const deviceName = request ? getClientDeviceName(request) : 'Internal';
  const clientIp = request ? getClientIp(request) : '127.0.0.1';

  const store = {
    deviceId,
    deviceName,
    clientIp,
    username,
    userRole: 'anonymous',
    lastRoute: null,
  };

  try {
    if (request && !checkRateLimit(request, routeName)) {
      throw new RateLimitError();
    }

    if (request) {
      const user = await requireAuth(request);
      username = user.username;
      store.username = username;
      store.userRole = user.role || 'operator';
      if (Array.isArray(options?.roles) && options.roles.length > 0) {
        if (!options.roles.includes(store.userRole)) {
          throw new AuthError('Acesso restrito a administradores.', 403);
        }
      }
    }

    if (request) {
      if (typeof request.json === 'function') {
        let jsonPromise = null;
        const origJson = request.json.bind(request);
        request.json = () => {
          if (!jsonPromise) jsonPromise = origJson();
          return jsonPromise;
        };
      }
      if (typeof request.text === 'function') {
        let textPromise = null;
        const origText = request.text.bind(request);
        request.text = () => {
          if (!textPromise) textPromise = origText();
          return textPromise;
        };
      }
    }

    let data;
    try {
      data = await sshContext.run(store, async () => await fn(store));
    } catch (firstErr) {
      const diagnosis = classifyError(firstErr, {
        route: routeName,
        username,
        deviceId,
        deviceName,
        networkScope: describeNetworkScope(clientIp),
        sshRoute: store.lastRoute,
      });

      if (diagnosis.recoverable) {
        const healing = await attemptSelfHealing(diagnosis, { route: routeName }, runSSH, resetConnectionCache);
        if (healing.healed) {
          data = await sshContext.run(store, async () => await fn(store));
          await recordErrorFlow({
            diagnosis,
            err: firstErr,
            context: {
              route: routeName,
              username,
              deviceId,
              deviceName,
              clientIp,
              sshRoute: store.lastRoute,
              responseTime: Date.now() - startTime,
            },
            selfHealed: true,
            healingDetails: healing,
          });
        } else {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    status = 200;

    if (request) {
      const responseTime = Date.now() - startTime;
      const isPollingRoute = routeName === 'GET /api/status' || routeName === 'GET /api/logs';
      await logRequest(request.method, routeName, username, status, responseTime, null, {
        deviceId,
        deviceName,
        ip: clientIp,
        sshRoute: store.lastRoute,
        _skipRemoteLog: isPollingRoute,
      });
    }

    return Response.json({ ok: true, ...data }, { status });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const diagnosis = classifyError(err, {
      route: routeName,
      username,
      deviceId,
      deviceName,
      networkScope: describeNetworkScope(clientIp),
      sshRoute: store.lastRoute,
      responseTime,
    });

    if (err instanceof AuthError) {
      status = err.status;
    } else if (err instanceof RateLimitError) {
      status = err.status;
    } else if (err.status) {
      status = err.status;
    } else if (diagnosis.status) {
      status = diagnosis.status;
    }

    const safeConsoleMsg = sanitizeSensitiveText(err?.message || '');
    console.error(`[API Error] ${routeName} [${diagnosis.errorId}/${diagnosis.category}]:`, safeConsoleMsg);

    await recordErrorFlow({
      diagnosis,
      err,
      context: {
        route: routeName,
        username,
        deviceId,
        deviceName,
        clientIp,
        sshRoute: store.lastRoute,
        responseTime,
      },
      selfHealed: false,
    });

    if (request) {
      await logRequest(request.method, routeName, username, status, responseTime, err, {
        errorId: diagnosis.errorId,
        category: diagnosis.category,
        rootCause: diagnosis.rootCause,
        deviceId,
        deviceName,
        ip: clientIp,
        sshRoute: store.lastRoute,
      });
    }

    return Response.json(
      {
        ok: false,
        error: formatClientSafeError(err, diagnosis),
        errorId: diagnosis.errorId,
        category: diagnosis.category,
      },
      { status }
    );
  }
}
