import { apiHandler } from '@/lib/ssh';
import { startNgrok, stopNgrok } from '@/lib/ngrok';
import { touchDeviceSession } from '@/lib/auth';

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { port, protocol, action, mode, appName, stopAll, localHost, path = '' } = await request.json();

      if (action === 'stop') {
        if (stopAll) {
          await stopNgrok(null);
          return { ok: true, message: 'Túneis temporários encerrados.' };
        }
        if (port) {
          await stopNgrok(port);
          return { ok: true, message: 'Túnel encerrado com sucesso.' };
        }
        await touchDeviceSession({
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
          username: ctx.username,
          ip: ctx.clientIp,
          activeApp: null,
        });
        return { ok: true, message: 'Sessão de aplicativo liberada neste dispositivo.' };
      }

      if (!port) {
        throw new Error('Porta não informada.');
      }

      let url = await startNgrok(port, protocol, mode || 'tunnel', localHost);
      if (!url) {
        throw new Error('Não foi possível obter a URL do serviço.');
      }

      const base = url.replace(/\/$/, '');
      let resolvedPath = typeof path === 'string' ? path : '';
      if (Number(port) === 8888 && process.env.JUPYTER_TOKEN && !resolvedPath.includes('token=')) {
        resolvedPath = `/lab?token=${encodeURIComponent(process.env.JUPYTER_TOKEN)}`;
      }
      url = `${base}${resolvedPath}`;

      await touchDeviceSession({
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
        username: ctx.username,
        ip: ctx.clientIp,
        activeApp: appName ? `${appName}` : `App`,
      });

      return {
        ok: true,
        url,
      };
    },
    request,
    'POST /api/tunnel'
  );
}
