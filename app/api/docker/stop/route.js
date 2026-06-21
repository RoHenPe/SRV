import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/stop  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name } = await request.json();
      if (!name) throw new Error('Campo "name" é obrigatório.');
      const result = await runSSH(`sudo docker rm -f ${name}`);
      return { message: `Container "${name}" removido.`, output: result.stdout };
    },
    request,
    'POST /api/docker/stop'
  );
}
