import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';
import { startNgrok } from '@/lib/ngrok';

// POST /api/sandbox/neovim — Inicia Neovim sandbox container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Remove container anterior se existir
      await runSSH("sudo docker rm -f srv_nvim_sandbox || true");
      // Inicia novo container rodando alpine, instala git, neovim e ttyd, e expõe nvim na porta 7681
      await runSSH(
        "sudo docker run -d --rm --name srv_nvim_sandbox -p 7683:7681 alpine:latest sh -c 'apk update && apk add neovim git ttyd && ttyd -W -p 7681 nvim'"
      );
      const host = getTargetHost();
      const ngrokUrl = await startNgrok(7683);
      return {
        ok: true,
        message: 'Neovim Sandbox iniciado com sucesso!',
        url: ngrokUrl ? ngrokUrl + "" : `http://${host}:7683`,
      };
    },
    request,
    'POST /api/sandbox/neovim'
  );
}
