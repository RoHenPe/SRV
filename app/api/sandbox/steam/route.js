import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/steam — inicia container Steam Headless
export async function POST(request) {
  return apiHandler(
    async () => {
      await runSSH("sudo docker rm -f srv_steam_sandbox");
      await runSSH(
        "sudo docker run -d --rm --name srv_steam_sandbox " +
        "-p 8083:8083 -p 5900:5900 josh5/steam-headless:latest"
      );
      const host = getTargetHost();
      return {
        message: 'Steam iniciado! Aguarde ~5s para abrir.',
        url: `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/steam'
  );
}
