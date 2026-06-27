import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/docker/restart  body: { name: "container_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { name } = await request.json();
      if (!name) throw new Error('Campo "name" é obrigatório.');

      let result;
      if (name === 'srv_ag_sandbox') {
        await runSSH("pkill -f 'ttyd -W -p 7685' || true");
        result = await runSSH("nohup ttyd -W -p 7685 /home/rodrigo/.local/bin/interpreter > /dev/null 2>&1 &");
        return { message: `Agente Antigravity reiniciado.`, output: result.stdout };
      } else {
        result = await runSSH(`sudo docker restart ${name}`);
        return { message: `Container "${name}" reiniciado.`, output: result.stdout };
      }
    },
    request,
    'POST /api/docker/restart'
  );
}
