import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/neovim — Inicia Neovim sandbox container e retorna URL
export async function POST(request) {
  return apiHandler(
    async () => {
      // Inicia novo container rodando alpine, instala git, neovim e ttyd, e expõe nvim na porta 7683 (removendo o antigo anteriormente)
      await runSSH(
        "sudo docker rm -f srv_nvim_sandbox || true && " +
        "sudo docker run -d --rm --name srv_nvim_sandbox -p 7683:7681 alpine:latest sh -c 'apk update && apk add neovim git ttyd && ttyd -W -p 7681 nvim'"
      );
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

