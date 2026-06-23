import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/terminal — Inicia ttyd sandbox container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior se existir
      await runSSH("sudo docker rm -f srv_terminal_sandbox || true");
      // Inicia novo container rodando ttyd com bash
      await runSSH(
        "sudo docker run -d --rm --name srv_terminal_sandbox -u root -p 7682:7681 srv-dashboard-srv-dashboard:latest ttyd -p 7681 bash"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(7682);
      return {
        ok: true,
        message: 'Terminal Sandbox iniciado com sucesso!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:7682`,
      };
    },
    request,
    'POST /api/sandbox/terminal'
  );
}
