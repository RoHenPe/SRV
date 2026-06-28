import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/webtop — inicia Webtop (srv-webtop-antigravity) container
export async function POST(request) {
  return apiHandler(
    async () => {
      // Inicia novo container de acordo com o srv.sh (removendo o antigo anteriormente)
      await runSSH(
        "sudo docker rm -f srv_webtop_sandbox || true && " +
        "sudo docker run -d --privileged --name=srv_webtop_sandbox -e PASSWORD=\"\" " +
        "-p 3000:3000 -p 3001:3001 -p 9222:9222 " +
        "-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage " +
        "--shm-size=2gb srv-webtop-antigravity:latest && " +
        "for i in {1..10}; do " +
        "  if sudo docker exec srv_webtop_sandbox test -f /etc/nginx/sites-available/default; then " +
        "    sudo docker exec srv_webtop_sandbox sed -i 's/auth_basic/#auth_basic/g' /etc/nginx/sites-available/default && " +
        "    sudo docker exec srv_webtop_sandbox nginx -s reload && " +
        "    exit 0; " +
        "  fi; " +
        "  sleep 1; " +
        "done"
      );
      const host = getTargetHost();
      return {
        ok: true,
        message: 'Webtop iniciado com sucesso!',
        url: `https://${host}:3001`,
      };
    },
    request,
    'POST /api/sandbox/webtop'
  );
}

