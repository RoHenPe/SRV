import { runSSH, apiHandler } from '@/lib/ssh';
import { logAction } from '@/lib/logger';

const SERVICE_MAP = {
  cups: { container: 'cupsd', composeDir: '~/cups-deploy' },
  scanner: { container: 'scanservjs', composeDir: '~/scanner-deploy' },
  srv_onlyoffice: { container: 'srv_onlyoffice', composeDir: '~/data-portal' },
  srv_metabase: { container: 'srv_metabase', composeDir: '~/data-portal' },
  srv_jupyter_spark: { container: 'srv_jupyter_spark', composeDir: '~/data-portal' },
  srv_postgres_db: { container: 'srv_postgres_db', composeDir: '~/data-portal' },
  portal: { container: null, composeDir: '~/data-portal' },
  emulator: { container: 'emulator-android-container-1', composeDir: '~/Automation/Apps/Emulator' },
  ttyd: { container: 'srv_dashboard', composeDir: '~/srv-dashboard' },
  dashboard: { container: 'rohenper_dashboard', composeDir: '~/rohenper-dashboard' },
  jarvis: { container: 'open-webui', composeDir: null },
  'open-webui': { container: 'open-webui', composeDir: null },
  srv_erp_mercados: { container: 'srv_erp_mercados', composeDir: '~/erp-mercados/deploy' },
  erp: { container: 'srv_erp_mercados', composeDir: '~/erp-mercados/deploy' },
  win10: { container: 'win10_teste', composeDir: '~/win10-deploy' },
};

export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { service, action } = await request.json();
      if (!service || !action) {
        throw new Error('Campos "service" e "action" são obrigatórios.');
      }
      if (!['start', 'stop', 'restart'].includes(action)) {
        throw new Error('Ação inválida. Use start, stop ou restart.');
      }

      const spec = SERVICE_MAP[service];
      let cmd = '';

      if (spec) {
        if (spec.container) {
          if (action === 'start') {
            cmd = spec.composeDir
              ? `sudo docker start ${spec.container} 2>/dev/null || (cd ${spec.composeDir} && sudo docker compose up -d)`
              : `sudo docker start ${spec.container}`;
          } else if (action === 'stop') {
            cmd = `sudo docker stop ${spec.container}`;
          } else if (action === 'restart') {
            cmd = `sudo docker restart ${spec.container}`;
          }
        } else if (spec.composeDir) {
          cmd =
            action === 'start'
              ? `cd ${spec.composeDir} && sudo docker compose up -d`
              : action === 'stop'
              ? `cd ${spec.composeDir} && sudo docker compose stop`
              : `cd ${spec.composeDir} && sudo docker compose restart`;
        }
      } else if (/^[a-zA-Z0-9_.-]+$/.test(service)) {
        cmd = `sudo docker ${action} ${service}`;
      } else {
        throw new Error('Serviço inválido.');
      }

      const result = await runSSH(cmd);

      if (service === 'srv_onlyoffice' && action === 'start') {
        await runSSH(
          'sudo docker exec srv_onlyoffice sh -c \'grep -q documentserver /etc/hosts || echo "127.0.0.1 documentserver" >> /etc/hosts; grep -q "8086" /etc/onlyoffice/documentserver/nginx/ds.conf || (sed -i "s/listen 0.0.0.0:80;/listen 0.0.0.0:80;\\n  listen 0.0.0.0:8086;/" /etc/onlyoffice/documentserver/nginx/ds.conf && nginx -s reload)\' 2>/dev/null || true'
        );
      }

      await logAction(`service.${action}`, result.code === 0 ? 'success' : 'error', {
        service,
        action,
        user: ctx.username,
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
        output: (result.stdout || result.stderr || '').slice(0, 300),
      });

      return {
        ok: true,
        message: `Serviço ${service} executado (${action}) com sucesso.`,
        output: result.stdout || result.stderr || '',
      };
    },
    request,
    'POST /api/services'
  );
}
