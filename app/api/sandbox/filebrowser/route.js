import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/filebrowser — Inicia File Browser container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Inicia novo container File Browser com a flag --noauth para remover solicitações de senha (removendo o antigo anteriormente)
      await runSSH(
        "sudo docker rm -f srv_filebrowser || true && " +
        "sudo docker run -d --name srv_filebrowser -p 8089:80 -v /home/rodrigo:/srv filebrowser/filebrowser:latest --noauth -r /srv"
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

