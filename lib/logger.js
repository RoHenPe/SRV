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

async function write(level, message, data = {}) {
  if (!shouldLog(level)) return;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...data,
  };

  const line = JSON.stringify(entry) + '\n';
  try {
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (err) {
    console.error('[Logger] Failed to write audit log:', err.message);
  }
}

export async function logRequest(method, route, apiKey, status, responseTime, error = null) {
  await write('info', 'API Request', {
    method,
    route,
    apiKey: apiKey ? apiKey.slice(0, 4) + '...' : 'anonymous',
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
