import { runAndEnsurePort, apiHandler } from '@/lib/ssh';

export const maxDuration = 60;

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_terminal_sandbox 2>/dev/null || ' +
        'docker run -d --name srv_terminal_sandbox --network host -v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro -v /home/rodrigo/.ssh:/root/.ssh:ro srv-monitor-srv-monitor:latest ttyd -W -p 7682 ssh -o StrictHostKeyChecking=no rodrigo@127.0.0.1';

      await runAndEnsurePort({
        startCmd,
        port: 7682,
        containerName: 'srv_terminal_sandbox',
        maxWaitSeconds: 10,
      });

      return {
        ok: true,
        ready: true,
        port: 7682,
        message: 'Terminal Web (TTY) ativo.',
      };
    },
    request,
    'POST /api/sandbox/terminal'
  );
}
