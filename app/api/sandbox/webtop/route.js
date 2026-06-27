import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/webtop — inicia Webtop (srv-webtop-antigravity) container
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior
      await runSSH("sudo docker rm -f srv_webtop_sandbox || true");
      // Inicia de acordo com o srv.sh — porta 3001 é a interface KasmVNC (HTTPS)
      await runSSH(
        "sudo docker run -d --name=srv_webtop_sandbox -e PASSWORD=\"\" " +
        "-p 3000:3000 -p 3001:3001 -p 9222:9222 " +
        "-v /home/rodrigo/webtop_config:/config -v /home/rodrigo:/storage " +
        "--shm-size=2gb srv-webtop-antigravity:latest"
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

