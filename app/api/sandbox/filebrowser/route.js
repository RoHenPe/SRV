import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/filebrowser — Inicia File Browser container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior se existir
      await runSSH("sudo docker rm -f srv_filebrowser || true");
      // Inicia novo container File Browser
      await runSSH(
        "sudo docker run -d --name srv_filebrowser -p 8089:80 --entrypoint /bin/sh -v /home/rodrigo:/srv filebrowser/filebrowser:latest -c 'filebrowser -d /database/filebrowser.db config init && filebrowser -d /database/filebrowser.db config set --auth.method=noauth && filebrowser -d /database/filebrowser.db -p 80 -a 0.0.0.0 -r /srv'"
      );
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
