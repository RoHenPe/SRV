import { runAndEnsurePort, apiHandler } from '@/lib/ssh';

export const maxDuration = 60;

export async function POST(request) {
  return apiHandler(
    async () => {
      const startCmd =
        'docker start srv_nvim_sandbox 2>/dev/null || (' +
        'if docker image inspect srv-nvim:latest >/dev/null 2>&1; then ' +
        '  docker run -d --name srv_nvim_sandbox -p 7683:7681 -v /home/rodrigo:/root/workspace srv-nvim:latest ttyd -W -p 7681 nvim; ' +
        'else ' +
        '  docker run -d --name srv_nvim_sandbox -p 7683:7681 alpine:latest sh -c "apk update && apk add neovim git ttyd && ttyd -W -p 7681 nvim"; ' +
        'fi)';

      await runAndEnsurePort({
        startCmd,
        port: 7683,
        containerName: 'srv_nvim_sandbox',
        maxWaitSeconds: 20,
      });

      return {
        ok: true,
        ready: true,
        port: 7683,
        message: 'Editor Neovim Web ativo.',
      };
    },
    request,
    'POST /api/sandbox/neovim'
  );
}
