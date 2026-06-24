import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/filebrowser — Inicia File Browser container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior se existir
      await runSSH("sudo docker rm -f srv_filebrowser || true");
      // Inicia novo container File Browser com a flag --noauth para remover solicitações de senha
      await runSSH(
        "sudo docker run -d --name srv_filebrowser -p 8089:80 -v /home/rodrigo:/srv filebrowser/filebrowser:latest --noauth -r /srv"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(8089);
      return {
        ok: true,
        message: 'File Browser iniciado com sucesso!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:8089`,
      };
    },
    request,
    'POST /api/sandbox/filebrowser'
  );
}
