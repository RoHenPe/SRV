/**
 * SSH utility — usado por todas as API routes
 * Suporta autenticação por senha (SSH_PASSWORD) ou chave privada (SSH_PRIVATE_KEY_B64)
 */
import { NodeSSH } from 'node-ssh';

/**
 * Retorna o IP alvo do servidor.
 * Usa LAN_IP por padrão; fallback para VPN.
 */
export function getTargetHost() {
  return process.env.SSH_HOST || process.env.SSH_HOST_VPN;
}

/**
 * Executa um comando SSH no servidor remoto.
 * @param {string} command - Comando a ser executado
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
export async function runSSH(command) {
  const ssh = new NodeSSH();
  const host = getTargetHost();

  if (!host) {
    throw new Error('SSH_HOST não configurado nas variáveis de ambiente.');
  }

  const connectConfig = {
    host,
    username: process.env.SSH_USER || 'rodrigo',
    readyTimeout: 10000,
    // Desabilita verificação de host desconhecido (equivalente ao StrictHostKeyChecking=no)
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

  let result;
  try {
    await ssh.connect(connectConfig);
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
  };
}

/**
 * Wrapper padrão para API routes — captura erros e retorna JSON padronizado.
 */
export async function apiHandler(fn) {
  try {
    const data = await fn();
    return Response.json({ ok: true, ...data });
  } catch (err) {
    console.error('[SSH Error]', err.message);
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
