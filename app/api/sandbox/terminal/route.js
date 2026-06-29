import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/terminal — Inicia ttyd bash sandbox e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container antigo ou processos ttyd na porta 7682 se existirem
      await runSSH("sudo docker rm -f srv_terminal_sandbox || true");
      await runSSH("pkill -f 'ttyd -W -p 7682' || true");
      
      // Inicia ttyd usando a imagem srv-dashboard pré-configurada para início imediato
      await runSSH(
        "sudo docker run -d --rm --name srv_terminal_sandbox --network host " +
        "-v /home/rodrigo/.ssh:/home/rodrigo/.ssh:ro srv-dashboard-srv-dashboard:latest " +
        "ttyd -W -p 7682 ssh -o StrictHostKeyChecking=no rodrigo@127.0.0.1"
      );
      
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

