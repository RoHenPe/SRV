import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/kdenlive — inicia Kdenlive container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_kdenlive_sandbox 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d --name=srv_kdenlive_sandbox -e PASSWORD=\"\" -p 3005:3000 -p 3006:3001 -v /home/rodrigo/kdenlive_config:/config -v /home/rodrigo:/storage --shm-size=2gb lscr.io/linuxserver/kdenlive:latest"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 3005,
        containerName: 'srv_kdenlive_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Kdenlive iniciado com sucesso!',
        url: `http://${host}:3005`,
      };
    },
    request,
    'POST /api/sandbox/kdenlive'
  );
}

