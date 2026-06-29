import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/antigravity — inicia ttyd com interpreter no host
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior
      await runSSH("sudo docker rm -f srv_ag_sandbox || true");
      // Inicia ttyd usando a imagem srv-dashboard pré-configurada para início imediato
      await runSSH(
        "sudo docker run -d --rm --name srv_ag_sandbox --network host " +
        "-v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro srv-dashboard-srv-dashboard:latest " +
        "ttyd -W -p 7685 ssh -o StrictHostKeyChecking=no -t rodrigo@127.0.0.1 /home/rodrigo/.local/bin/antigravity"
      );
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

