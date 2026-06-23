import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/docker/logs?name=container_name
export async function GET(request) {
  return apiHandler(
    async () => {
      const { searchParams } = new URL(request.url);
      const name = searchParams.get('name');
      if (!name) throw new Error('O parâmetro "name" é obrigatório.');
      const result = await runSSH(`sudo docker logs --tail 100 ${name}`);
      return { output: result.stdout || result.stderr || 'Sem logs.' };
    },
    request,
    'GET /api/docker/logs'
  );
}
