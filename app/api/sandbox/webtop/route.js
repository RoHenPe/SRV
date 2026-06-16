import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/webtop — inicia Webtop (Ubuntu XFCE) container
export async function POST() {
  return apiHandler(async () => {
    await runSSH("sudo docker ps -q --filter publish=3000 | xargs -r sudo docker rm -f");
    await runSSH(
      "sudo docker run -d --rm -p 3000:3000 --name srv_webtop_sandbox " +
      "--tmpfs /config:exec,mode=1777 --tmpfs /tmp:exec,mode=1777 --tmpfs /run:exec,mode=1777 " +
      "lscr.io/linuxserver/webtop:ubuntu-xfce"
    );
    const host = getTargetHost();
    return {
      message: 'Webtop iniciado! Aguarde ~8s para abrir.',
      url: `http://${host}:3000`,
    };
  });
}
