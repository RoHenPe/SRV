import { runSSH, getTargetHost, apiHandler } from '@/lib/ssh';

// POST /api/sandbox/antigravity — inicia Antigravity (SSH) container
export async function POST(request) {
  return apiHandler(
    async () => {
      await runSSH("sudo docker rm -f srv_ag_sandbox || true");
      await runSSH(
        "sudo docker run -d --rm -p 2222:22 --name srv_ag_sandbox " +
        "-v ~/.ssh/authorized_keys:/root/.ssh/authorized_keys:ro " +
        "alpine sh -c 'apk update && apk add openssh git neovim && ssh-keygen -A && /usr/sbin/sshd -D -o StrictModes=no'"
      );
      const host = getTargetHost();
      return {
        ok: true,
        message: `Sandbox Antigravity SSH iniciado na porta 2222.`,
        connectionInfo: `ssh root@${host} -p 2222`,
      };
    },
    request,
    'POST /api/sandbox/antigravity'
  );
}
