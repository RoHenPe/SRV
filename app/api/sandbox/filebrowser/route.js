import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        '(docker start srv_filebrowser 2>/dev/null && docker exec srv_filebrowser sh -c \'[ -f /config/settings.json ] || (mkdir -p /config && echo "{\\"port\\":80,\\"address\\":\\"0.0.0.0\\",\\"database\\":\\"/database/filebrowser.db\\",\\"root\\":\\"/srv\\"}" > /config/settings.json)\' 2>/dev/null) || ' +
        'docker run -d --name srv_filebrowser -p 8089:80 -v /home/rodrigo:/srv --entrypoint sh filebrowser/filebrowser:latest -c "mkdir -p /config && echo \'{\\"port\\":80,\\"address\\":\\"0.0.0.0\\",\\"database\\":\\"/database/filebrowser.db\\",\\"root\\":\\"/srv\\"}\' > /config/settings.json && if [ ! -f /database/filebrowser.db ]; then filebrowser config init -d /database/filebrowser.db && filebrowser config set --auth.method=noauth -d /database/filebrowser.db && filebrowser users add admin admin12345678 --perm.admin -d /database/filebrowser.db; fi && exec filebrowser -d /database/filebrowser.db -r /srv -a 0.0.0.0 -p 80"';

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
