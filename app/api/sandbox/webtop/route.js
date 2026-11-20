import { runSSH, runAndEnsurePort, apiHandler } from '@/lib/ssh';

export const maxDuration = 60;

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_webtop_sandbox 2>/dev/null || ' +
        'docker run -d --privileged --name=srv_webtop_sandbox ' +
        '-p 3000:3000 -p 3001:3001 -p 9222:9222 ' +
        '-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage ' +
        '--shm-size=2gb srv-webtop-antigravity:latest';

      await runAndEnsurePort({
        startCmd,
        port: 3000,
        containerName: 'srv_webtop_sandbox',
        maxWaitSeconds: 15,
      });

      await runSSH(
        'if docker exec -u 0 srv_webtop_sandbox grep -q "^[[:space:]]*auth_basic" /etc/nginx/sites-available/default 2>/dev/null; then ' +
        '  docker exec -u 0 srv_webtop_sandbox sed -i "s/auth_basic/#auth_basic/g" /etc/nginx/sites-available/default && ' +
        '  docker exec -u 0 srv_webtop_sandbox nginx -s reload 2>/dev/null || true; ' +
        'fi'
      );

      return {
        ok: true,
        ready: true,
        port: 3000,
        message: 'Webtop iniciado com sucesso!',
      };
    },
    request,
    'POST /api/sandbox/webtop'
  );
}
