import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/terminal — Inicia ttyd bash sandbox e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_terminal_sandbox 2>/dev/null || true",
        "pkill -f 'ttyd -W -p 7682' 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d --name srv_terminal_sandbox --network host -v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro -v /home/rodrigo/.ssh:/root/.ssh:ro srv-dashboard-srv-dashboard:latest ttyd -W -p 7682 ssh -o StrictHostKeyChecking=no rodrigo@127.0.0.1"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 7682,
        containerName: 'srv_terminal_sandbox',
        maxWaitSeconds: 10,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Terminal Sandbox iniciado com sucesso!',
        url: `http://${host}:7682`,
      };
    },
    request,
    'POST /api/sandbox/terminal'
  );
}

