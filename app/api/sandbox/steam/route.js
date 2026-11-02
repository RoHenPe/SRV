import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'sudo docker start srv_steam_sandbox 2>/dev/null || ' +
        'sudo docker run -d --privileged --name srv_steam_sandbox -p 8083:8083 -p 5900:5900 -v /dev:/dev josh5/steam-headless:latest';

      await runAndEnsurePort({
        startCmd,
        port: 8083,
        containerName: 'srv_steam_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Ambiente Gráfico (Steam Headless) ativo.',
        url: `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/steam'
  );
}
