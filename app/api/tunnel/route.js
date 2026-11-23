import { apiHandler } from '@/lib/ssh';
import { startNgrok, stopNgrok } from '@/lib/ngrok';
import { touchDeviceSession, AuthError } from '@/lib/auth';

const ALLOWED_APP_PORTS = new Set([
  631, 3000, 3003, 3005, 3010, 6081,
  7681, 7682, 7683, 7685, 8006, 8080,
  8083, 8086, 8089, 8090, 8443, 8888, 9090,
]);

function normalizeAppPath(rawPath) {
  if (!rawPath) return '';
  if (typeof rawPath !== 'string') {
    throw new Error('Caminho de aplicação inválido.');
  }
  const clean = rawPath.trim();
  if (!clean) return '';
  if (!clean.startsWith('/') || clean.startsWith('//') || /[\s@<>\\]/.test(clean)) {
    throw new Error('Caminho de aplicação inválido.');
  }
  return clean;
}

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { port, protocol = 'http:', action, mode = 'tunnel', appName, stopAll, localHost, path = '' } = await request.json();

      if (action === 'stop') {
        if (stopAll) {
          if (ctx.userRole !== 'admin') {
            throw new AuthError('Apenas administradores podem encerrar todos os túneis.', 403);
          }
          await stopNgrok(null);
          return { ok: true, message: 'Túneis temporários encerrados.' };
        }
        if (port) {
          const numPort = parseInt(String(port), 10);
          if (!ALLOWED_APP_PORTS.has(numPort)) {
            throw new AuthError('Porta não autorizada para encerramento.', 403);
          }
          await stopNgrok(numPort);
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

      const numPort = parseInt(String(port), 10);
      if (!ALLOWED_APP_PORTS.has(numPort)) {
        throw new AuthError('Porta de serviço não autorizada para exposição em túnel.', 403);
      }

      if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error('Protocolo inválido para abertura de túnel.');
      }
      if (mode !== 'tunnel' && mode !== 'local_http') {
        throw new Error('Modo de túnel inválido.');
      }

      const resolvedPath = normalizeAppPath(path);
      let url = await startNgrok(numPort, protocol, mode, localHost);
      if (!url) {
        throw new Error('Não foi possível obter a URL do serviço.');
      }

      const base = url.replace(/\/$/, '');
      let finalPath = resolvedPath;
      const jupyterToken = (process.env.JUPYTER_TOKEN || '').replace(/\\n|\\r/g, '').trim();
      if (numPort === 8888 && jupyterToken && !finalPath.includes('token=')) {
        finalPath = `/lab?token=${encodeURIComponent(jupyterToken)}`;
      }
      url = `${base}${finalPath}`;

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
