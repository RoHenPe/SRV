import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'sudo docker start srv_filebrowser 2>/dev/null || ' +
        'sudo docker run -d --name srv_filebrowser -p 8089:80 -v /home/rodrigo:/srv filebrowser/filebrowser:latest --noauth -r /srv';

      await runAndEnsurePort({
        startCmd,
        port: 8089,
        containerName: 'srv_filebrowser',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Gerenciador de Arquivos Web ativo.',
        url: `http://${host}:8089`,
      };
    },
    request,
    'POST /api/sandbox/filebrowser'
  );
}
