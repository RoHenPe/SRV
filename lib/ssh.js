/**
 * SSH utility — usado por todas as API routes
 * Suporta:
 * - Multi-rota inteligente (LAN, VPN Tailscale, Túnel Público Bore/Cloudflare/Ngrok)
 * - Controle de concorrência para múltiplos dispositivos simultâneos
 * - Detecção automática de ambiente Vercel (pula IPs privados inalcançáveis na nuvem)
 * - Override dinâmico de host:porta via header `x-ssh-override`
 * - Autenticação por senha (SSH_PASSWORD) ou chave privada (SSH_PRIVATE_KEY_B64)
 */
import { AsyncLocalStorage } from 'async_hooks';
import { NodeSSH } from 'node-ssh';
import { requireAuth, AuthError } from './auth';
import { checkRateLimit, RateLimitError, getClientIp, getClientDeviceId, getClientDeviceName } from './rateLimit';
import { logRequest, logAction, logError } from './logger';
import { classifyError, attemptSelfHealing, recordErrorFlow } from './errorFlow';

const sshContext = new AsyncLocalStorage();

// Variável em memória para guardar a última conexão bem-sucedida
let cachedEndpoint = null;
let cachedCfBridgeUrl = null;
let latestBridgeTunnels = {};

export function getCachedTunnels() {
  return { ...latestBridgeTunnels };
}

export function resetConnectionCache() {
  cachedEndpoint = null;
  cachedCfBridgeUrl = null;
}

async function executeViaHttpBridge(command, customTimeoutMs = null) {
  const isVercelCloud = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  const token = process.env.SSH_PASSWORD || '201909';
  const timeoutMs = customTimeoutMs || 12000;

  const bridgeCandidates = [];
  if (cachedCfBridgeUrl) {
    bridgeCandidates.push({ url: `${cachedCfBridgeUrl.replace(/\/$/, '')}/exec`, host: 'cloudflare-bridge', port: 443, label: 'cf-bridge' });
  }
  if (process.env.BRIDGE_URL) {
    bridgeCandidates.push({ url: `${process.env.BRIDGE_URL.replace(/\/$/, '')}/exec`, host: 'env-bridge', port: 443, label: 'env-bridge' });
  }
  if (!isVercelCloud) {
    const lanHost = (process.env.SSH_HOST_LAN || '192.168.15.109').split(':')[0];
    bridgeCandidates.push({ url: `http://${lanHost}:18022/exec`, host: lanHost, port: 18022, label: 'lan-bridge' });
  }
  bridgeCandidates.push({ url: 'http://bore.pub:48022/exec', host: 'bore.pub', port: 48022, label: 'bore-bridge' });

  for (const cand of bridgeCandidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs + 2500, 22000));
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
      if (!res.ok) continue;
      const data = await res.json();
      if (data && typeof data.code === 'number') {
        if (data.cfBridgeUrl && typeof data.cfBridgeUrl === 'string' && data.cfBridgeUrl.startsWith('https://')) {
          cachedCfBridgeUrl = data.cfBridgeUrl;
        }
        if (data.tunnels && typeof data.tunnels === 'object') {
          latestBridgeTunnels = { ...latestBridgeTunnels, ...data.tunnels };
        }
        const store = sshContext.getStore();
        if (store) {
          store.lastHost = `${cand.host}:${cand.port}`;
          store.lastRoute = cand.label;
        }
        return {
          stdout: data.stdout || '',
          stderr: data.stderr || '',
          code: data.code ?? 0,
          host: cand.host === 'bore.pub' || cand.host === 'cloudflare-bridge' ? '192.168.15.109' : cand.host,
          port: cand.port,
          route: cand.label,
        };
      }
    } catch (_) {
      clearTimeout(timer);
      if (cand.label === 'cf-bridge') {
        cachedCfBridgeUrl = null;
      }
    }
  }
  return null;
}

// Semáforo de concorrência SSH para evitar estourar MaxStartups do sshd em acessos simultâneos
const MAX_CONCURRENT_SSH = 8;
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
  const ctxOverride = sshContext.getStore()?.sshOverride;
  if (ctxOverride) {
    const parsed = parseEndpoint(ctxOverride, 22);
    if (parsed) return parsed.host;
  }
  if (cachedEndpoint?.host) return cachedEndpoint.host;
  const defaultPort = process.env.SSH_PORT ? parseInt(process.env.SSH_PORT, 10) : 22;
  const primary = parseEndpoint(process.env.SSH_HOST, defaultPort);
  const vpn = parseEndpoint(process.env.SSH_HOST_VPN, 22);
  return primary?.host || vpn?.host || '192.168.15.109';
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

  const ctxOverride = sshContext.getStore()?.sshOverride;
  if (ctxOverride) {
    const parsedOverride = parseEndpoint(ctxOverride, defaultPort);
    if (parsedOverride && (!isVercelCloud || !isPrivateOrTailscaleHost(parsedOverride.host))) {
      addCandidate(parsedOverride, 'override');
    }
  }

  if (cachedEndpoint) {
    if (!isVercelCloud || !isPrivateOrTailscaleHost(cachedEndpoint.host)) {
      addCandidate(cachedEndpoint, 'cache');
    }
  }

  const epTunnelOrMain = parseEndpoint(process.env.SSH_TUNNEL_HOST || process.env.SSH_HOST, defaultPort);
  const epVpn = parseEndpoint(process.env.SSH_HOST_VPN, 22);
  const epLan = parseEndpoint(process.env.SSH_HOST_LAN || '192.168.15.109', 22);

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
  if (/\bsudo\s+(?!-S\b)/.test(cmd)) {
    const pass = (process.env.SSH_PASSWORD || '201909').replace(/'/g, "'\\''");
    cmd = cmd.replace(/\bsudo\s+(?!-S\b)/g, `echo '${pass}' | sudo -S -p '' `);
  }
  return cmd;
}

/**
 * Executa um comando SSH no servidor remoto com seleção inteligente de rota, semáforo de concorrência e fallback rápido.
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
      throw new Error('Configure SSH_HOST ou SSH_HOST_VPN nas variáveis de ambiente.');
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
      const candidateKeys = [
        `${homeDir}/.ssh/id_ed25519`,
        `${homeDir}/.ssh/id_rsa`,
      ];
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
        throw new Error('Configure SSH_PASSWORD ou SSH_PRIVATE_KEY_B64 nas variáveis de ambiente.');
      }
    }

    let connectedEndpoint = null;
    const errors = [];

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
        errors.push(`${ep.host}:${ep.port} (${err.message})`);
      }
    }

    if (!connectedEndpoint) {
      cachedEndpoint = null;
      throw new Error(
        `Servidor inalcançável via SSH. Tentativas: ${errors.join(' | ')}.`
      );
    }

    let result;
    try {
      result = await ssh.execCommand(command);
      ssh.dispose();
    } catch (err) {
      try { ssh.dispose(); } catch (_) {}
      throw err;
    }

    const store = sshContext.getStore();
    if (store) {
      store.lastHost = `${connectedEndpoint.host}:${connectedEndpoint.port}`;
      store.lastRoute = connectedEndpoint.label;
    }

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code ?? 0,
      host: connectedEndpoint.host,
      port: connectedEndpoint.port,
      route: connectedEndpoint.label,
    };
  } finally {
    releaseSshSlot();
  }
}

/**
 * Executa comando para inicializar um serviço/container de forma concorrente-segura (com flock por porta)
 * e aguarda até que a porta local esteja ouvindo. Múltiplos aparelhos acionando o mesmo módulo simultaneamente
 * reutilizam a instância ativa sem derrubar nem reiniciar o container um do outro.
 */
export async function runAndEnsurePort({ startCmd, port, containerName, maxWaitSeconds = 14 }) {
  const unpausePrefix = containerName ? `docker unpause ${containerName} >/dev/null 2>&1 || true; ` : '';
  const checkCmd = `${unpausePrefix}if ss -tln | grep -q ":${port} "; then exit 0; else exit 1; fi`;
  const isListening = await runSSH(checkCmd);
  if (isListening.code === 0) {
    return { alreadyRunning: true, port };
  }

  const waitAttempts = Math.max(Math.round(maxWaitSeconds * 2), 8);
  const cleanStartCmd = `${unpausePrefix}${startCmd.replace(/\bsudo\s+docker\b/g, 'docker')}`;
  const startB64 = Buffer.from(cleanStartCmd, 'utf-8').toString('base64');

  const atomicEnsureScript = `
    (
      flock -x -w 25 200 || exit 1
      if ss -tln | grep -q ":${port} "; then
        echo "ALREADY_RUNNING"
        exit 0
      fi
      eval "$(echo '${startB64}' | base64 -d)"
      for i in $(seq 1 ${waitAttempts}); do
        if ss -tln | grep -q ":${port} "; then
          echo "STARTED_OK"
          exit 0
        fi
        sleep 0.5
      done
      exit 1
    ) 200>/tmp/srv_port_${port}.lock
  `;

  const ensureResult = await runSSH(atomicEnsureScript, 20000);
  if (ensureResult.code !== 0) {
    let logs = '';
    if (containerName) {
      const logsResult = await runSSH(`docker logs --tail 25 ${containerName} 2>&1 || true`);
      logs = logsResult.stdout.trim();
    }
    throw new Error(
      `Porta ${port} não ficou disponível após ${maxWaitSeconds}s.${logs ? ` Logs:\n${logs}` : (ensureResult.stderr ? ` Erro: ${ensureResult.stderr}` : '')}`
    );
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
 * Wrapper padrão para API routes — captura erros, autenticação multi-dispositivo, rate limit, override de SSH e logging completo.
 */
export async function apiHandler(fn, request = null, routeName = 'unknown') {
  const startTime = Date.now();
  let status = 500;
  let username = 'anonymous';
  const deviceId = request ? getClientDeviceId(request) : 'server-internal';
  const deviceName = request ? getClientDeviceName(request) : 'Internal';
  const clientIp = request ? getClientIp(request) : '127.0.0.1';
  const sshOverride = request?.headers?.get?.('x-ssh-override') || null;

  const store = {
    sshOverride,
    deviceId,
    deviceName,
    clientIp,
    username,
    lastHost: null,
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
        clientIp,
        sshHost: store.lastHost,
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
              sshHost: store.lastHost,
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
        sshHost: store.lastHost,
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
      clientIp,
      sshHost: store.lastHost,
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

    console.error(`[API Error] ${routeName} [${diagnosis.errorId}/${diagnosis.category}]:`, err.message);

    await recordErrorFlow({
      diagnosis,
      err,
      context: {
        route: routeName,
        username,
        deviceId,
        deviceName,
        clientIp,
        sshHost: store.lastHost,
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
        sshHost: store.lastHost,
        sshRoute: store.lastRoute,
      });
    }

    return Response.json(
      {
        ok: false,
        error: err.message,
        errorId: diagnosis.errorId,
        category: diagnosis.category,
        rootCause: diagnosis.rootCause,
      },
      { status }
    );
  }
}
