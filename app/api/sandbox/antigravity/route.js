import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/antigravity — inicia ttyd com interpreter no host
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_ag_sandbox 2>/dev/null || true",
        "pkill -f 'ttyd -W -p 7685' 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d --name srv_ag_sandbox --network host -v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro -v /home/rodrigo/.ssh:/root/.ssh:ro srv-dashboard-srv-dashboard:latest ttyd -W -p 7685 ssh -o StrictHostKeyChecking=no -t rodrigo@127.0.0.1 /home/rodrigo/.local/bin/antigravity"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 7685,
        containerName: 'srv_ag_sandbox',
        maxWaitSeconds: 10,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Agente Antigravity iniciado!',
        url: `http://${host}:7685`,
      };
    },
    request,
    'POST /api/sandbox/antigravity'
  );
}

