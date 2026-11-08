import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/backup/status — retorna o status do processo de backup e as últimas linhas do log
export async function GET(request) {
  return apiHandler(
    async () => {
      // 1. Verifica se o worker do backup ou sincronizador de fotos está rodando
      const checkResult = await runSSH(
        '(pgrep -f "run_headless.py --worker" >/dev/null || pgrep -f "server_photos_backup.py" >/dev/null) && echo "running" || echo "stopped"'
      );
      const running = checkResult.stdout.trim() === 'running';

      // 2. Lê as últimas 100 linhas do log ativo (prioriza google_photos_picker.log se estiver rodando photos backup)
      const logResult = await runSSH(
        'if pgrep -f "server_photos_backup.py" >/dev/null 2>&1; then ' +
        '  tail -n 100 ~/google_photos_picker.log 2>/dev/null; ' +
        'else ' +
        '  tail -n 100 ~/Automation/Apps/Backup/EngineCore/Log/progress.log 2>/dev/null || tail -n 100 ~/google_photos_picker.log 2>/dev/null || echo "Nenhum log disponível."; ' +
        'fi'
      );
      let logContent = logResult.stdout || '';

      // Processa os carriage returns (\r) para manter apenas a última atualização em linha
      if (logContent.includes('\r')) {
        const lines = logContent.split('\n');
        const processedLines = lines.map(line => {
          if (line.includes('\r')) {
            const parts = line.split('\r');
            // Retorna o último segmento não vazio
            return parts[parts.length - 1].trim();
          }
          return line;
        });
        logContent = processedLines.join('\n');
      }

      return {
        ok: true,
        running,
        log: logContent
      };
    },
    request,
    'GET /api/backup/status'
  );
}
