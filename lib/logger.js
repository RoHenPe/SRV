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

  // 1. Escreve no console para captura direta na Vercel/Docker
  if (level === 'error') {
    console.error(`[AUDIT ERROR] ${message}`, data);
  } else if (level === 'warn') {
    console.warn(`[AUDIT WARN] ${message}`, data);
  } else if (level === 'info') {
    console.log(`[AUDIT INFO] ${message}`, data);
  }

  // 2. Escreve localmente no /tmp da Vercel (temporário/memória)
  try {
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (err) {
    // Falha silenciosa em ambientes read-only
  }

  // 3. Escreve persistentemente no servidor remoto via SSH apenas se configurado
  if (process.env.REMOTE_AUDIT_LOG === 'true') {
    try {
      const sshExec = await getRunSSH();
      if (sshExec) {
        const escapedLine = JSON.stringify(entry).replace(/'/g, "'\\''");
        sshExec(`echo '${escapedLine}' >> ~/dashboard-audit.log`).catch(() => {});
      }
    } catch (_) {}
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
