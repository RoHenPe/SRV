import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/filebrowser — Inicia File Browser container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_filebrowser 2>/dev/null || true",
        "sleep 0.3",
        "sudo docker run -d --name srv_filebrowser -p 8089:80 -v /home/rodrigo:/srv filebrowser/filebrowser:latest --noauth -r /srv"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 8089,
        containerName: 'srv_filebrowser',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'File Browser iniciado com sucesso!',
        url: `http://${host}:8089`,
      };
    },
    request,
    'POST /api/sandbox/filebrowser'
  );
}

