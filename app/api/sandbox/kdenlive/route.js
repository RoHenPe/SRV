import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_kdenlive_sandbox 2>/dev/null || ' +
        'docker run -d --name=srv_kdenlive_sandbox -p 3005:3000 -p 3006:3001 -v /home/rodrigo/kdenlive_config:/config -v /home/rodrigo:/storage --shm-size=2gb lscr.io/linuxserver/kdenlive:latest';

      await runAndEnsurePort({
        startCmd,
        port: 3005,
        containerName: 'srv_kdenlive_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Editor de Vídeo (Kdenlive) ativo.',
        url: `http://${host}:3005`,
      };
    },
    request,
    'POST /api/sandbox/kdenlive'
  );
}
