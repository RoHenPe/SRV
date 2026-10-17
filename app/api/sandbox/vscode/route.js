import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/vscode — inicia VS Code container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_vscode_sandbox 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d -p 8443:3000 -v /home/rodrigo:/home/workspace:cached --name srv_vscode_sandbox gitpod/openvscode-server:latest --without-connection-token"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 8443,
        containerName: 'srv_vscode_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'VS Code iniciado com sucesso!',
        url: `http://${host}:8443`,
      };
    },
    request,
    'POST /api/sandbox/vscode'
  );
}

