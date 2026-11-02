import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'sudo docker start srv_terminal_sandbox 2>/dev/null || ' +
        'sudo docker run -d --name srv_terminal_sandbox --network host -v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro -v /home/rodrigo/.ssh:/root/.ssh:ro srv-dashboard-srv-dashboard:latest ttyd -W -p 7682 ssh -o StrictHostKeyChecking=no rodrigo@127.0.0.1';

      await runAndEnsurePort({
        startCmd,
        port: 7682,
        containerName: 'srv_terminal_sandbox',
        maxWaitSeconds: 10,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Terminal Web (TTY) ativo.',
        url: `http://${host}:7682`,
      };
    },
    request,
    'POST /api/sandbox/terminal'
  );
}
