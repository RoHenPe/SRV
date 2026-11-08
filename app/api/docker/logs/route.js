import { runSSH, apiHandler } from '@/lib/ssh';

const CONTAINER_NAME_RE = /^[a-zA-Z0-9_.-]{1,128}$/;

// GET /api/docker/logs?name=container_name
export async function GET(request) {
  return apiHandler(
    async () => {
      const { searchParams } = new URL(request.url);
      const name = (searchParams.get('name') || '').trim();
      if (!name || !CONTAINER_NAME_RE.test(name)) {
        throw new Error('O parâmetro "name" é obrigatório e deve conter apenas caracteres válidos.');
      }

      const result = await runSSH(`docker logs --tail 100 ${name}`);
      const logs = (result.stdout + '\n' + result.stderr).trim();
      return { output: logs || 'Sem logs.' };
    },
    request,
    'GET /api/docker/logs'
  );
}
