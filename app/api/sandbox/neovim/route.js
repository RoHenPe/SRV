import { runAndEnsurePort, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/neovim — Inicia Neovim sandbox container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd = [
        "sudo docker rm -f srv_nvim_sandbox 2>/dev/null || true",
        "sleep 0.3",
        "if sudo docker image inspect srv-nvim:latest >/dev/null 2>&1; then " +
        "  sudo docker run -d --name srv_nvim_sandbox -p 7683:7681 -v /home/rodrigo:/root/workspace srv-nvim:latest ttyd -W -p 7681 nvim; " +
        "else " +
        "  sudo docker run -d --name srv_nvim_sandbox -p 7683:7681 alpine:latest sh -c 'apk update && apk add neovim git ttyd && ttyd -W -p 7681 nvim'; " +
        "fi"
      ].join(' && ');

      await runAndEnsurePort({
        startCmd,
        port: 7683,
        containerName: 'srv_nvim_sandbox',
        maxWaitSeconds: 20,
      });

      const host = getTargetHost();
      return {
        ok: true,
        message: 'Neovim Sandbox iniciado com sucesso!',
        url: `http://${host}:7683`,
      };
    },
    request,
    'POST /api/sandbox/neovim'
  );
}

