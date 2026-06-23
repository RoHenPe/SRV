import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/vscode — inicia VS Code container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container antigo na porta 8443
      await runSSH("sudo docker rm -f srv_vscode_sandbox || true");
      // Inicia novo container de acordo com o srv.sh
      await runSSH(
        "sudo docker run -d --rm -p 8443:3000 --name srv_vscode_sandbox gitpod/openvscode-server:latest --without-connection-token"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(8443);
      return {
        ok: true,
        message: 'VS Code iniciado com sucesso!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:8443`,
      };
    },
    request,
    'POST /api/sandbox/vscode'
  );
}
