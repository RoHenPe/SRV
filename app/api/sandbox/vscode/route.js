import { runAndEnsurePort, apiHandler } from '@/lib/ssh';

export const maxDuration = 60;

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_vscode_sandbox 2>/dev/null || ' +
        'docker run -d -p 8443:3000 -v /home/rodrigo:/home/workspace:cached --name srv_vscode_sandbox gitpod/openvscode-server:latest --without-connection-token';

      await runAndEnsurePort({
        startCmd,
        port: 8443,
        containerName: 'srv_vscode_sandbox',
        maxWaitSeconds: 15,
      });

      return {
        ok: true,
        ready: true,
        port: 8443,
        message: 'Ambiente IDE (VS Code) ativo.',
      };
    },
    request,
    'POST /api/sandbox/vscode'
  );
}
