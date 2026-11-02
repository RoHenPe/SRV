import { promises as fs } from 'fs';
import path from 'path';

const LOG_DIR = '/tmp';
const LOG_FILE = path.join(LOG_DIR, 'dashboard-audit.log');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_MEMORY_LOGS = 500;

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const memoryLogs = [];
let pendingRemoteLines = [];
let flushTimer = null;

function shouldLog(level) {
  return (LEVELS[level] ?? 1) >= (LEVELS[LOG_LEVEL] ?? 1);
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

async function flushRemoteLogs() {
  flushTimer = null;
  if (pendingRemoteLines.length === 0) return;
  const batch = pendingRemoteLines.splice(0, 50);
  try {
    const sshExec = await getRunSSH();
    if (sshExec) {
      const payload = Buffer.from(batch.join('\n') + '\n', 'utf-8').toString('base64');
      await sshExec(`echo '${payload}' | base64 -d >> ~/dashboard-audit.log`, 8000);
    }
  } catch (_) {
    // Ignora falha silenciosa de gravação remota para não interromper requisições
  }
  if (pendingRemoteLines.length > 0 && !flushTimer) {
    flushTimer = setTimeout(flushRemoteLogs, 1500);
  }
}

function enqueueRemoteLog(entryJson) {
  if (process.env.REMOTE_AUDIT_LOG === 'false') return;
  pendingRemoteLines.push(entryJson);
  if (pendingRemoteLines.length >= 10) {
    if (flushTimer) clearTimeout(flushTimer);
    flushRemoteLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushRemoteLogs, 1500);
  }
}

async function write(level, message, data = {}) {
  if (!shouldLog(level)) return;

  const { _skipRemoteLog, ...cleanData } = data || {};
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: formatTimestamp(),
    level,
    message,
    ...cleanData,
  };

  memoryLogs.push(entry);
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.splice(0, memoryLogs.length - MAX_MEMORY_LOGS);
  }

  const entryJson = JSON.stringify(entry);
  const line = entryJson + '\n';

  if (level === 'error') {
    console.error(`[AUDIT ERROR] ${message}`, cleanData);
  } else if (level === 'warn') {
    console.warn(`[AUDIT WARN] ${message}`, cleanData);
  } else if (level === 'info') {
    console.log(`[AUDIT INFO] ${message}`, cleanData);
  }

  try {
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (_) {}

  if (!_skipRemoteLog) {
    enqueueRemoteLog(entryJson);
  }

  return entry;
}

export async function logRequest(method, route, username, status, responseTime, error = null, extra = {}) {
  return write(error || status >= 400 ? (status >= 500 ? 'error' : 'warn') : 'info', 'API Request', {
    method,
    route,
    user: username || 'anonymous',
    status,
    responseTime: typeof responseTime === 'number' ? `${responseTime}ms` : responseTime,
    error: error ? (error.message || String(error)) : null,
    ...extra,
  });
}

export async function logAction(action, result, details = {}) {
  return write('info', `Action: ${action}`, {
    action,
    result,
    ...details,
  });
}

export async function logWarn(message, details = {}) {
  return write('warn', message, details);
}

export async function logError(error, context = {}) {
  const msg = error instanceof Error ? error.message : String(error);
  return write('error', msg, {
    ...context,
    stack: error instanceof Error ? error.stack?.split('\n').slice(0, 4) : undefined,
  });
}

export async function logDebug(message, data = {}) {
  return write('debug', message, data);
}

export async function readAuditLogs({ limit = 150, level = '', search = '', deviceId = '', includeRemote = true } = {}) {
  const byKey = new Map();

  for (const item of memoryLogs) {
    const key = `${item.timestamp}|${item.message}|${item.route || ''}|${item.deviceId || ''}`;
    byKey.set(key, item);
  }

  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-limit * 2);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const key = `${parsed.timestamp}|${parsed.message}|${parsed.route || ''}|${parsed.deviceId || ''}`;
        byKey.set(key, parsed);
      } catch (_) {}
    }
  } catch (_) {}

  if (includeRemote) {
    try {
      const sshExec = await getRunSSH();
      if (sshExec) {
        const tailCount = Math.min(Math.max(Number(limit) || 150, 50), 400);
        const rawRes = await sshExec(`tail -n ${tailCount} ~/dashboard-audit.log 2>/dev/null || true`, 6000);
        const raw = typeof rawRes === 'string' ? rawRes : (rawRes?.stdout || '');
        const lines = raw.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const key = `${parsed.timestamp}|${parsed.message}|${parsed.route || ''}|${parsed.deviceId || ''}`;
            byKey.set(key, parsed);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  let entries = Array.from(byKey.values());

  if (level && level !== 'all') {
    entries = entries.filter((e) => e.level === level);
  }
  if (deviceId && deviceId !== 'all') {
    entries = entries.filter((e) => e.deviceId === deviceId);
  }
  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter((e) => JSON.stringify(e).toLowerCase().includes(q));
  }

  entries.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return entries.slice(0, limit);
}

export async function clearAuditLogs() {
  memoryLogs.length = 0;
  pendingRemoteLines = [];
  try {
    await fs.writeFile(LOG_FILE, '', 'utf-8');
  } catch (_) {}
  try {
    const sshExec = await getRunSSH();
    if (sshExec) {
      await sshExec(`: > ~/dashboard-audit.log 2>/dev/null || true`, 5000);
    }
  } catch (_) {}
}
