import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/stop  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name } = await request.json();
      if (!name) throw new Error('Campo "name" é obrigatório.');

      let result;
      if (name === 'srv_ag_sandbox') {
        result = await runSSH("pkill -f 'ttyd -W -p 7685' || true");
        return { message: `Agente Antigravity parado.`, output: result.stdout };
      } else {
        result = await runSSH(`sudo docker stop ${name}`);
        return { message: `Container "${name}" parado.`, output: result.stdout };
      }
    },
    request,
    'POST /api/docker/stop'
  );
}
