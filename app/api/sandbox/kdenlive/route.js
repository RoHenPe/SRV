import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/kdenlive — inicia Kdenlive container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior se existir
      await runSSH("sudo docker rm -f srv_kdenlive_sandbox || true");
      // Inicia novo container
      await runSSH(
        "sudo docker run -d --name=srv_kdenlive_sandbox -e PASSWORD=\"\" " +
        "-p 3005:3000 -p 3006:3001 " +
        "-v /home/rodrigo/kdenlive_config:/config " +
        "-v /home/rodrigo:/storage " +
        "--shm-size=2gb " +
        "lscr.io/linuxserver/kdenlive:latest"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(3005);
      return {
        ok: true,
        message: 'Kdenlive iniciado com sucesso!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:3005`,
      };
    },
    request,
    'POST /api/sandbox/kdenlive'
  );
}
