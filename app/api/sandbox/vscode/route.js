import { runSSH, apiHandler } from '@/lib/ssh';
import { getTargetHost } from '@/lib/ssh';

// POST /api/sandbox/vscode — inicia VS Code container e retorna URL
export async function POST() {
  return apiHandler(async () => {
    // Remove container antigo na porta 8443
    await runSSH("sudo docker ps -q --filter publish=8443 | xargs -r sudo docker rm -f");
    // Inicia novo container
    await runSSH(
      "sudo docker run -d --rm -p 8443:8443 --name srv_vscode_sandbox --env AUTH=none " +
      "--tmpfs /home/coder:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 " +
      "lscr.io/linuxserver/code-server:latest"
    );
    const host = getTargetHost();
    return {
      message: 'VS Code iniciado! Aguarde ~5s para abrir.',
      url: `http://${host}:8443`,
    };
  });
}
