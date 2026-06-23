import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/restart  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name } = await request.json();
      if (!name) throw new Error('Campo "name" é obrigatório.');
      const result = await runSSH(`sudo docker restart ${name}`);
      return { message: `Container "${name}" reiniciado.`, output: result.stdout };
    },
    request,
    'POST /api/docker/restart'
  );
}
