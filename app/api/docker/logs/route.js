import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/docker/logs?name=container_name
export async function GET(request) {
  return apiHandler(
    async () => {
      const { searchParams } = new URL(request.url);
      const name = searchParams.get('name');
      if (!name) throw new Error('O parâmetro "name" é obrigatório.');

      if (name === 'srv_ag_sandbox') {
        return { output: 'Logs não disponíveis para processos nativos do host.' };
      }

      const result = await runSSH(`sudo docker logs --tail 100 ${name}`);
      const logs = (result.stdout + '\n' + result.stderr).trim();
      return { output: logs || 'Sem logs.' };
    },
    request,
    'GET /api/docker/logs'
  );
}
