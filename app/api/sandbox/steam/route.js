import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/steam — inicia container Steam Headless
export async function POST(request) {
  return apiHandler(
    async () => {
      // Inicia novo container (removendo o antigo anteriormente)
      await runSSH(
        "sudo docker rm -f srv_steam_sandbox || true && " +
        "sudo docker run -d --privileged --rm --name srv_steam_sandbox " +
        "-p 8083:8083 -p 5900:5900 -v /dev:/dev josh5/steam-headless:latest"
      );
      const host = getTargetHost();
      return {
        ok: true,
        message: 'Steam iniciado! Aguarde ~5s para abrir.',
        url: `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/steam'
  );
}

