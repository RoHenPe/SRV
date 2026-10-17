import { runSSH, apiHandler } from '@/lib/ssh';

/**
 * POST /api/terminal/exec
 * Executa um comando SSH diretamente via API HTTPS (funciona de qualquer lugar, 4G, corporativo, Vercel,
 * sem precisar abrir portas extras ou iframes HTTP).
 * Body: { command: string, cwd?: string }
 */
export async function POST(request) {
  return apiHandler(
    async () => {
      const { command, cwd = '~' } = await request.json();
      if (!command || !command.trim()) {
        throw new Error('Informe um comando para executar.');
      }

      const b64Cmd = Buffer.from(command.trim(), 'utf-8').toString('base64');
      const safeCwd = (cwd || '~').replace(/"/g, '');
      const marker = '___SRV_CWD_MARKER___';

      const wrappedCmd = `
        export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        cd ${safeCwd === '~' ? '$HOME' : `"${safeCwd}"`} 2>/dev/null || cd "$HOME"
        CMD_STR=$(echo "${b64Cmd}" | base64 -d)
        eval "$CMD_STR" 2>&1
        EXIT_CODE=$?
        echo ""
        echo "${marker}:$(pwd):$EXIT_CODE"
      `;

      const res = await runSSH(wrappedCmd);
      const rawOut = res.stdout || '';
      const lines = rawOut.split('\n');
      let nextCwd = cwd || '/home/rodrigo';
      let cmdExitCode = res.code ?? 0;

      const markerIdx = lines.findIndex((l) => l.startsWith(`${marker}:`));
      let cleanOutput = rawOut;

      if (markerIdx !== -1) {
        const markerLine = lines[markerIdx];
        const parts = markerLine.split(':');
        if (parts.length >= 3) {
          nextCwd = parts.slice(1, -1).join(':') || nextCwd;
          cmdExitCode = parseInt(parts[parts.length - 1], 10) || 0;
        }
        cleanOutput = lines.slice(0, markerIdx).join('\n').trimEnd();
      }

      return {
        output: cleanOutput || (res.stderr ? res.stderr.trim() : '(comando concluído sem saída)'),
        cwd: nextCwd,
        exitCode: cmdExitCode,
        host: res.host,
        port: res.port,
        route: res.route,
      };
    },
    request,
    'POST /api/terminal/exec'
  );
}
