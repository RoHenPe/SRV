import { runSSH, apiHandler } from '@/lib/ssh';
import { logAction } from '@/lib/logger';

/**
 * POST /api/terminal/exec
 * Executa um comando SSH diretamente via API HTTPS com estado (cwd) isolado por requisição/dispositivo.
 * Body: { command: string, cwd?: string }
 */
export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { command, cwd = '~' } = await request.json();
      if (!command || !command.trim()) {
        throw new Error('Informe um comando para executar.');
      }

      const b64Cmd = Buffer.from(command.trim(), 'utf-8').toString('base64');
      const safeCwd = (cwd || '~').replace(/"/g, '');
      const marker = '___SRV_CWD_MARKER___';

      const wrappedCmd = `
        NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
        export PATH="$NVM_BIN:$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
        cd ${safeCwd === '~' ? '$HOME' : `"${safeCwd}"`} 2>/dev/null || cd "$HOME"
        CMD_STR=$(echo "${b64Cmd}" | base64 -d)
        eval "$CMD_STR" 2>&1
        EXIT_CODE=$?
        echo ""
        echo "${marker}:$(pwd):$EXIT_CODE"
      `;

      const res = await runSSH(wrappedCmd, 25000);
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

      await logAction('terminal.exec', cmdExitCode === 0 ? 'success' : 'nonzero_exit', {
        command: command.trim().slice(0, 200),
        cwd: nextCwd,
        exitCode: cmdExitCode,
        user: ctx.username,
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });

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
