import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/start  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name } = await request.json();
      if (!name) throw new Error('Campo "name" é obrigatório.');
      const result = await runSSH(`sudo docker start ${name}`);
      return { message: `Container "${name}" iniciado.`, output: result.stdout };
    },
    request,
    'POST /api/docker/start'
  );
}
