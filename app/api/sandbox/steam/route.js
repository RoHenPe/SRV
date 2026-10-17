import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/steam — inicia container Steam Headless
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_steam_sandbox 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d --privileged --name srv_steam_sandbox -p 8083:8083 -p 5900:5900 -v /dev:/dev josh5/steam-headless:latest"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 8083,
        containerName: 'srv_steam_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Steam iniciado com sucesso!',
        url: `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/steam'
  );
}

