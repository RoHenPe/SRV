import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'sudo docker start srv_ag_sandbox 2>/dev/null || ' +
        'sudo docker run -d --name srv_ag_sandbox --network host -v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro -v /home/rodrigo/.ssh:/root/.ssh:ro srv-dashboard-srv-dashboard:latest ttyd -W -p 7685 ssh -o StrictHostKeyChecking=no -t rodrigo@127.0.0.1 "export PATH=\\$HOME/.local/bin:\\$(ls -d \\$HOME/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1):\\$PATH; cd \\$HOME; /home/rodrigo/.local/bin/antigravity; exec bash -l"';

      await runAndEnsurePort({
        startCmd,
        port: 7685,
        containerName: 'srv_ag_sandbox',
        maxWaitSeconds: 10,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Console CLI Agente ativo.',
        url: `http://${host}:7685`,
      };
    },
    request,
    'POST /api/sandbox/antigravity'
  );
}
