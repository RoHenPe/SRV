import { promises as fs } from 'fs';
import path from 'path';

const LOG_DIR = '/tmp';
const LOG_FILE = path.join(LOG_DIR, 'dashboard-audit.log');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function formatTimestamp() {
  return new Date().toISOString();
}

let runSSH = null;
async function getRunSSH() {
  if (!runSSH) {
    try {
      const sshMod = await import('./ssh.js');
      runSSH = sshMod.runSSH;
    } catch (_) {}
  }
  return runSSH;
}

async function write(level, message, data = {}) {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...data,
  };

  const line = JSON.stringify(entry) + '\n';

  // 1. Escreve localmente no /tmp da Vercel (temporário/memória)
  try {
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (err) {
    console.error('[Logger] Failed to write local audit log:', err.message);
  }

  // 2. Escreve persistentemente no servidor remoto via SSH (se disponível)
  try {
    const sshExec = await getRunSSH();
    if (sshExec) {
      const escapedLine = JSON.stringify(entry).replace(/'/g, "'\\''");
      // Faz o append no arquivo de auditoria persistente do servidor remoto de forma assíncrona
      sshExec(`echo '${escapedLine}' >> ~/dashboard-audit.log`).catch(() => {});
    }
  } catch (err) {
    // Ignora silenciosamente falhas de rede/conexão SSH antes da máquina estar ativa
  }
}

export async function logRequest(method, route, username, status, responseTime, error = null) {
  await write('info', 'API Request', {
    method,
    route,
    user: username || 'anonymous',
    status,
    responseTime: `${responseTime}ms`,
    error: error ? error.message : null,
  });
}

export async function logAction(action, result, details = {}) {
  await write('info', `Action: ${action}`, {
    result,
    ...details,
  });
}

export async function logError(error, context = {}) {
  await write('error', error.message, {
    ...context,
    stack: error.stack?.split('\n').slice(0, 3),
  });
}

export async function logDebug(message, data = {}) {
  await write('debug', message, data);
}
