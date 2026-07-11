/**
 * SSH utility — usado por todas as API routes
 * Suporta autenticação por senha (SSH_PASSWORD) ou chave privada (SSH_PRIVATE_KEY_B64)
 */
import { NodeSSH } from 'node-ssh';

/**
 * Retorna o IP alvo do servidor.
 * Usa LAN_IP por padrão; fallback para VPN.
 */
// Variável em memória para guardar a última conexão bem-sucedida
let cachedHost = null;

/**
 * Retorna o IP alvo do servidor (LAN ou VPN).
 * Prioriza o host da última conexão bem-sucedida.
 */
export function getTargetHost() {
  return cachedHost || process.env.SSH_HOST || process.env.SSH_HOST_VPN;
}

/**
 * Executa um comando SSH no servidor remoto.
 * Suporta fallback automático entre LAN e VPN com cache em memória.
 * @param {string} command - Comando a ser executado
 * @returns {Promise<{stdout: string, stderr: string, code: number, host: string}>}
 */
export async function runSSH(command) {
  const ssh = new NodeSSH();
  
  const hostLAN = process.env.SSH_HOST;
  const hostVPN = process.env.SSH_HOST_VPN;

  // Monta a lista de hosts para tentar, colocando o cachedHost primeiro.
  // Prioriza a VPN (Tailscale) para maior velocidade e segurança, usando LAN (Bore) como fallback.
  const hostsToTry = [];
  if (cachedHost) {
    hostsToTry.push(cachedHost);
  }
  if (hostVPN && hostVPN !== cachedHost) {
    hostsToTry.push(hostVPN);
  }
  if (hostLAN && hostLAN !== cachedHost) {
    hostsToTry.push(hostLAN);
  }

  if (hostsToTry.length === 0) {
    throw new Error('Configure SSH_HOST ou SSH_HOST_VPN nas variáveis de ambiente.');
  }

  const connectConfig = {
    port: process.env.SSH_PORT ? parseInt(process.env.SSH_PORT, 10) : 22,
    username: process.env.SSH_USER || 'rodrigo',
    readyTimeout: 5000, // Timeout de 5s para fallback rápido se o primeiro host estiver offline
    algorithms: {
      serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-ed25519'],
    },
  };

  // Prioridade 1: senha simples
  if (process.env.SSH_PASSWORD) {
    connectConfig.password = process.env.SSH_PASSWORD;
  }
  // Prioridade 2: chave privada em base64
  else if (process.env.SSH_PRIVATE_KEY_B64) {
    const keyBuffer = Buffer.from(process.env.SSH_PRIVATE_KEY_B64, 'base64');
    connectConfig.privateKey = keyBuffer.toString('utf-8');
  }
  else {
    throw new Error('Configure SSH_PASSWORD ou SSH_PRIVATE_KEY_B64 nas variáveis de ambiente.');
  }

  let successfulHost = null;
  let lastError = null;

  for (const host of hostsToTry) {
    try {
      // Resolve host to IPv4 to prevent IPv6 handshake issues on Vercel (e.g. bore.pub IPv6 resolving but closed)
      let targetIp = host;
      try {
        const dns = await import('dns');
        const lookup = await dns.promises.lookup(host, { family: 4 });
        targetIp = lookup.address;
      } catch (_) {}

      // If we are connecting to the VPN host, use standard port 22.
      const currentPort = host === hostVPN ? 22 : connectConfig.port;

      await ssh.connect({ ...connectConfig, host: targetIp, port: currentPort });
      successfulHost = host;
      cachedHost = host; // Salva no cache para as próximas chamadas
      break;
    } catch (err) {
      const portUsed = host === hostVPN ? 22 : connectConfig.port;
      console.warn(`[SSH Fallback] Falha ao conectar em ${host} na porta ${portUsed}: ${err.message}`);
      lastError = err;
    }
  }

  if (!successfulHost) {
    throw new Error(`Não foi possível conectar ao servidor via SSH (tentou: ${hostsToTry.join(', ')}). Erro: ${lastError.message}`);
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
    host: successfulHost,
  };
}

import { validateToken, extractToken, AuthError } from './auth';
import { checkRateLimit, RateLimitError } from './rateLimit';
import { logRequest, logError } from './logger';

/**
 * Wrapper padrão para API routes — captura erros, autenticação, rate limit e logging.
 */
export async function apiHandler(fn, request = null, routeName = 'unknown') {
  const startTime = Date.now();
  let status = 500;
  let error = null;
  let token = null;
  let username = 'anonymous';

  try {
    // Check rate limit
    if (request && !checkRateLimit(request, routeName)) {
      throw new RateLimitError();
    }

    // Check authentication
    if (request) {
      token = extractToken(request);
      if (!token) {
        throw new AuthError('Missing authorization header', 401);
      }
      const user = await validateToken(token);
      username = user.username;
    }

    const data = await fn();
    status = 200;

    // Log successful request
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

    error = err;
    const responseTime = Date.now() - startTime;

    // Log the failed request
    if (request) {
      await logRequest(request.method, routeName, username, status, responseTime, err);
    }

    return Response.json(
      { ok: false, error: err.message },
      { status }
    );
  }
}
