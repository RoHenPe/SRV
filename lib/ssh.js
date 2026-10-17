/**
 * SSH utility — usado por todas as API routes
 * Suporta:
 * - Multi-rota inteligente (LAN, VPN Tailscale, Túnel Público Bore/Cloudflare/Ngrok)
 * - Detecção automática de ambiente Vercel (pula IPs privados inalcançáveis na nuvem)
 * - Override dinâmico de host:porta via header `x-ssh-override` (para quando a porta do túnel mudar)
 * - Autenticação por senha (SSH_PASSWORD) ou chave privada (SSH_PRIVATE_KEY_B64)
 */
import { AsyncLocalStorage } from 'async_hooks';
import { NodeSSH } from 'node-ssh';
import { validateToken, extractToken, AuthError } from './auth';
import { checkRateLimit, RateLimitError } from './rateLimit';
import { logRequest, logError } from './logger';

const sshContext = new AsyncLocalStorage();

// Variável em memória para guardar a última conexão bem-sucedida
let cachedEndpoint = null;

/**
 * Verifica se um endereço IP pertence a uma rede privada local (RFC1918) ou CGNAT Tailscale (100.64.0.0/10),
 * que não são roteáveis diretamente a partir das funções serverless da Vercel na AWS.
 */
function isPrivateOrTailscaleHost(host) {
  if (!host) return false;
  const cleanHost = host.split(':')[0].trim().toLowerCase();
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost.endsWith('.local') || cleanHost.endsWith('.ts.net')) {
    return true;
  }
  if (/^192\.168\./.test(cleanHost) || /^10\./.test(cleanHost) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanHost)) {
    return true;
  }
  // Faixa CGNAT usada pelo Tailscale (100.64.0.0/10 -> 100.64.x.x a 100.127.x.x)
  const match100 = cleanHost.match(/^100\.(\d+)\./);
  if (match100) {
    const secondOctet = parseInt(match100[1], 10);
    if (secondOctet >= 64 && secondOctet <= 127) return true;
  }
  return false;
}

/**
 * Faz o parse de uma string "host:port" ou "host" com porta padrão.
 */
function parseEndpoint(rawHost, defaultPort = 22) {
  if (!rawHost) return null;
  const trimmed = rawHost.trim().replace(/^tcp:\/\//, '').replace(/^ssh:\/\//, '');
  if (!trimmed) return null;
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon > 0 && !trimmed.includes(']')) {
    const hostPart = trimmed.slice(0, lastColon).trim();
    const portPart = parseInt(trimmed.slice(lastColon + 1).trim(), 10);
    if (hostPart && !Number.isNaN(portPart) && portPart > 0 && portPart <= 65535) {
      return { host: hostPart, port: portPart, key: `${hostPart}:${portPart}` };
    }
  }
  return { host: trimmed, port: defaultPort, key: `${trimmed}:${defaultPort}` };
}

/**
 * Retorna o IP/Host alvo do servidor atualmente ativo.
 */
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

/**
 * Monta a fila ordenada de endpoints SSH a tentar, otimizada para onde o backend está rodando
 * (Vercel Cloud vs Rede Local / Notebook com Tailscale).
 */
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

  // 1. Override enviado em tempo real pelo cabeçalho da requisição (`x-ssh-override`)
  const ctxOverride = sshContext.getStore()?.sshOverride;
  if (ctxOverride) {
    addCandidate(parseEndpoint(ctxOverride, defaultPort), 'override');
  }

  // 2. Último endpoint que funcionou em memória
  if (cachedEndpoint) {
    if (!isVercelCloud || !isPrivateOrTailscaleHost(cachedEndpoint.host)) {
      addCandidate(cachedEndpoint, 'cache');
    }
  }

  const epTunnelOrMain = parseEndpoint(process.env.SSH_TUNNEL_HOST || process.env.SSH_HOST, defaultPort);
  const epVpn = parseEndpoint(process.env.SSH_HOST_VPN, 22);
  const epLan = parseEndpoint(process.env.SSH_HOST_LAN || '192.168.15.109', 22);

  if (isVercelCloud) {
    // Na Vercel (AWS), IPs 192.168.x.x e 100.x.x.x (Tailscale) não são roteáveis diretamente.
    // Prioriza imediatamente o host público (Bore / Cloudflare / Ngrok / DDNS) sem desperdiçar 5s de timeout!
    if (epTunnelOrMain && !isPrivateOrTailscaleHost(epTunnelOrMain.host)) {
      addCandidate(epTunnelOrMain, 'public-tunnel');
    }
    if (epVpn && !isPrivateOrTailscaleHost(epVpn.host)) {
      addCandidate(epVpn, 'public-vpn');
    }
    // Se todos os configurados forem privados, ainda adiciona como última tentativa
    addCandidate(epTunnelOrMain, 'fallback-main');
    addCandidate(epVpn, 'fallback-vpn');
  } else {
    // Rodando localmente ou em máquina com Tailscale: prioriza LAN -> Tailscale VPN -> Túnel Público
    addCandidate(epLan, 'lan');
    addCandidate(epVpn, 'tailscale-vpn');
    addCandidate(epTunnelOrMain, 'tunnel');
  }

  return candidates;
}

/**
 * Executa um comando SSH no servidor remoto com seleção inteligente de rota e fallback rápido.
 * @param {string} command - Comando a ser executado
 * @returns {Promise<{stdout: string, stderr: string, code: number, host: string, port: number, route: string}>}
 */
export async function runSSH(command) {
  const ssh = new NodeSSH();
  const endpointsToTry = buildEndpointsList();

  if (endpointsToTry.length === 0) {
    throw new Error('Configure SSH_HOST (ex: bore.pub:PORTA) ou SSH_HOST_VPN nas variáveis de ambiente.');
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
    throw new Error('Configure SSH_PASSWORD ou SSH_PRIVATE_KEY_B64 nas variáveis de ambiente.');
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

      // Timeout mais curto para IPs locais/VPN (2.5s) e 5s para túneis públicos
      const timeoutMs = isPrivateOrTailscaleHost(ep.host) ? 2500 : 5000;

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
      console.warn(`[SSH Fallback] Falha em ${ep.host}:${ep.port}: ${err.message}`);
    }
  }

  if (!connectedEndpoint) {
    cachedEndpoint = null;
    throw new Error(
      `Servidor inalcançável via SSH. Tentativas: ${errors.join(' | ')}. ` +
      `Se estiver acessando pela Vercel, verifique se o túnel SSH (bore.pub / Cloudflare) está ativo e na porta correta.`
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

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.code ?? 0,
    host: connectedEndpoint.host,
    port: connectedEndpoint.port,
    route: connectedEndpoint.label,
  };
}

/**
 * Executa comando para inicializar um serviço/container e aguarda até que a porta local esteja ouvindo.
 */
export async function runAndEnsurePort({ startCmd, port, containerName, maxWaitSeconds = 12 }) {
  const checkCmd = `if ss -tln | grep -q ":${port} "; then exit 0; else exit 1; fi`;
  const isListening = await runSSH(checkCmd);
  if (isListening.code === 0) {
    return { alreadyRunning: true };
  }

  const startResult = await runSSH(startCmd);
  if (startResult.code !== 0 && !startResult.stdout) {
    throw new Error(`Falha ao executar comando de inicialização: ${startResult.stderr || startResult.stdout || 'Erro desconhecido'}`);
  }

  const waitAttempts = Math.max(Math.round(maxWaitSeconds * 2), 6);
  const waitCmd = `
    for i in $(seq 1 ${waitAttempts}); do
      if ss -tln | grep -q ":${port} "; then
        exit 0
      fi
      sleep 0.5
    done
    exit 1
  `;
  const waitResult = await runSSH(waitCmd);
  if (waitResult.code !== 0) {
    let logs = '';
    if (containerName) {
      const logsResult = await runSSH(`sudo docker logs --tail 25 ${containerName} 2>&1 || true`);
      logs = logsResult.stdout.trim();
    }
    throw new Error(`Porta ${port} não abriu após ${maxWaitSeconds}s.${logs ? ` Logs:\n${logs}` : ''}`);
  }

  return { started: true };
}

/**
 * Wrapper padrão para API routes — captura erros, autenticação, rate limit, override de SSH e logging.
 */
export async function apiHandler(fn, request = null, routeName = 'unknown') {
  const startTime = Date.now();
  let status = 500;
  let token = null;
  let username = 'anonymous';

  try {
    if (request && !checkRateLimit(request, routeName)) {
      throw new RateLimitError();
    }

    let sshOverride = null;
    if (request) {
      token = extractToken(request);
      if (!token) {
        throw new AuthError('Missing authorization header', 401);
      }
      const user = await validateToken(token);
      username = user.username;
      sshOverride = request.headers?.get?.('x-ssh-override') || null;
    }

    const data = await sshContext.run({ sshOverride }, async () => await fn());
    status = 200;

    if (request) {
      const responseTime = Date.now() - startTime;
      await logRequest(request.method, routeName, username, status, responseTime);
    }

    return Response.json({ ok: true, ...data }, { status });
  } catch (err) {
    console.error('[SSH Error]', err.message);

    if (err instanceof AuthError) {
      status = err.status;
    } else if (err instanceof RateLimitError) {
      status = err.status;
    } else if (err.status) {
      status = err.status;
    }

    const responseTime = Date.now() - startTime;

    if (request) {
      await logRequest(request.method, routeName, username, status, responseTime, err);
    }

    return Response.json(
      { ok: false, error: err.message },
      { status }
    );
  }
}
