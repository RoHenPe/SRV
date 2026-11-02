import { apiHandler } from '@/lib/ssh';
import { readAuditLogs, clearAuditLogs, logAction, logError, logWarn } from '@/lib/logger';

export async function GET(request) {
  return apiHandler(
    async () => {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '150', 10), 10), 500);
      const level = searchParams.get('level') || 'all';
      const search = searchParams.get('search') || '';
      const deviceId = searchParams.get('deviceId') || 'all';
      const includeRemote = searchParams.get('remote') !== '0';

      const logs = await readAuditLogs({
        limit,
        level,
        search,
        deviceId,
        includeRemote,
      });

      return {
        logs,
        total: logs.length,
      };
    },
    request,
    'GET /api/logs'
  );
}

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const body = await request.json();
      const { event = 'client.event', level = 'info', message = '', details = {} } = body;

      const payload = {
        ...details,
        user: ctx.username,
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
        ip: ctx.clientIp,
      };

      if (level === 'error') {
        await logError(new Error(message || event), payload);
      } else if (level === 'warn') {
        await logWarn(message || event, payload);
      } else {
        await logAction(event, message || 'ok', payload);
      }

      return { logged: true };
    },
    request,
    'POST /api/logs'
  );
}

export async function DELETE(request) {
  return apiHandler(
    async (ctx) => {
      await clearAuditLogs();
      await logAction('logs.clear', 'success', {
        user: ctx.username,
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
        ip: ctx.clientIp,
      });
      return { cleared: true };
    },
    request,
    'DELETE /api/logs'
  );
}
