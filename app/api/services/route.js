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
  emulator: { container: 'emulatorjs', composeDir: '~/Automation/Apps/Emulator' },
  ttyd: { container: 'srv_dashboard', composeDir: '~/srv-dashboard' },
  dashboard: { container: 'rohenper_dashboard', composeDir: '~/rohenper-dashboard' },
  jarvis: { container: 'open-webui', composeDir: null },
  'open-webui': { container: 'open-webui', composeDir: null },
  srv_erp_mercados: { container: 'srv_erp_mercados', composeDir: '~/erp-mercados' },
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
        // Suporte genérico seguro para qualquer container Docker pelo nome técnico
        cmd = `sudo docker ${action} ${service}`;
      } else {
        throw new Error('Serviço inválido.');
      }

      const result = await runSSH(cmd);
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
