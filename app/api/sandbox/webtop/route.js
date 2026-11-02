import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        '(sudo docker start srv_webtop_sandbox 2>/dev/null || ' +
          'sudo docker run -d --privileged --name=srv_webtop_sandbox -e PASSWORD="" ' +
          '-p 3000:3000 -p 3001:3001 -p 9222:9222 ' +
          '-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage ' +
          '--shm-size=2gb srv-webtop-antigravity:latest)',
        'for i in {1..10}; do ' +
          'if sudo docker exec srv_webtop_sandbox test -f /etc/nginx/sites-available/default 2>/dev/null; then ' +
          '  sudo docker exec srv_webtop_sandbox sed -i "s/auth_basic/#auth_basic/g" /etc/nginx/sites-available/default && ' +
          '  sudo docker exec srv_webtop_sandbox nginx -s reload 2>/dev/null && break; ' +
          'fi; sleep 1; done',
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 3000,
        containerName: 'srv_webtop_sandbox',
        maxWaitSeconds: 15,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Desktop Remoto (Webtop) ativo.',
        url: `https://${host}:3001`,
      };
    },
    request,
    'POST /api/sandbox/webtop'
  );
}
