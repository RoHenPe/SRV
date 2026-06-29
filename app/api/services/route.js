import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/services  body: { service: 'cups' | 'scanner' | 'portal' | 'emulator' | 'ttyd', action: 'start' | 'stop' }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { service, action } = await request.json();
      if (!service || !action) throw new Error('Campos "service" e "action" são obrigatórios.');

      let cmd = '';
      if (service === 'cups') {
        const dir = '~/cups-deploy';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'scanner') {
        const dir = '~/scanner-deploy';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'portal' || service === 'srv_onlyoffice' || service === 'srv_metabase' || service === 'srv_jupyter_spark') {
        const dir = '~/data-portal';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'emulator') {
        const dir = '~/Automation/Apps/Emulator';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'ttyd') {
        const dir = '~/srv-dashboard';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'dashboard') {
        const dir = '~/rohenper-dashboard';
        cmd = action === 'start' ? `cd ${dir} && sudo docker compose up -d` : `cd ${dir} && sudo docker compose down`;
      } else if (service === 'jarvis') {
        cmd = action === 'start' ? 'sudo docker start open-webui' : 'sudo docker stop open-webui';
      } else {
        throw new Error('Serviço inválido.');
      }

      const result = await runSSH(cmd);
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
