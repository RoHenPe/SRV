import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/antigravity — inicia ttyd com interpreter no host
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior
      await runSSH("sudo docker rm -f srv_ag_sandbox || true");
      // Inicia ttyd rodando no Alpine Docker com redirecionamento SSH interativo para o agente
      await runSSH(
        "sudo docker run -d --rm --name srv_ag_sandbox --network host " +
        "-v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro alpine:latest " +
        "sh -c 'apk add --no-cache ttyd openssh-client && ttyd -W -p 7685 ssh -o StrictHostKeyChecking=no -t rodrigo@127.0.0.1 /home/rodrigo/.local/bin/antigravity'"
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

