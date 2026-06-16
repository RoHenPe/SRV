import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/stop  body: { name: "container_name" }
export async function POST(req) {
  return apiHandler(async () => {
    const { name } = await req.json();
    if (!name) throw new Error('Campo "name" é obrigatório.');
    const result = await runSSH(`sudo docker rm -f ${name}`);
    return { message: `Container "${name}" removido.`, output: result.stdout };
  });
}
