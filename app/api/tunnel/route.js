import { apiHandler } from '@/lib/ssh';
import { startNgrok, stopNgrok } from '@/lib/ngrok';
import { touchDeviceSession } from '@/lib/auth';

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { port, protocol, action, mode, appName, stopAll } = await request.json();

      if (action === 'stop') {
        if (stopAll) {
          await stopNgrok(null);
          return { ok: true, message: 'Túneis temporários encerrados' };
        }
        if (port) {
          await stopNgrok(port);
          return { ok: true, message: `Túnel da porta ${port} encerrado` };
        }
        await touchDeviceSession({
          deviceId: ctx.deviceId,
          deviceName: ctx.deviceName,
          username: ctx.username,
          ip: ctx.clientIp,
          activeApp: null,
        });
        return { ok: true, message: 'Sessão de aplicativo liberada neste dispositivo' };
      }

      if (!port) {
        throw new Error('Porta não informada.');
      }

      const url = await startNgrok(port, protocol, mode || 'tunnel');
      if (!url) {
        throw new Error('Não foi possível obter a URL do serviço.');
      }

      await touchDeviceSession({
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
        username: ctx.username,
        ip: ctx.clientIp,
        activeApp: appName ? `${appName} (:${port})` : `Porta ${port}`,
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
