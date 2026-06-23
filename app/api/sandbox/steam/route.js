import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/steam — inicia container Steam Headless
export async function POST(request) {
  return apiHandler(
    async () => {
      await runSSH("sudo docker rm -f srv_steam_sandbox");
      await runSSH(
        "sudo docker run -d --privileged --rm --name srv_steam_sandbox " +
        "-p 8083:8083 -p 5900:5900 -v /dev:/dev josh5/steam-headless:latest"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(8083);
      return {
        message: 'Steam iniciado! Aguarde ~5s para abrir.',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:8083`,
      };
    },
    request,
    'POST /api/sandbox/steam'
  );
}
