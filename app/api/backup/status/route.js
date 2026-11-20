import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/backup/status — retorna o status do processo de backup e as últimas linhas do log (single roundtrip)
export async function GET(request) {
  return apiHandler(
    async () => {
      const cmd = `
        RUNNING="stopped"
        if pgrep -f "run_headless.py --worker" >/dev/null 2>&1 || pgrep -f "server_photos_backup.py" >/dev/null 2>&1; then
          RUNNING="running"
        fi
        echo "STATUS:$RUNNING"
        if pgrep -f "server_photos_backup.py" >/dev/null 2>&1; then
          tail -n 100 ~/google_photos_picker.log 2>/dev/null || true
        else
          tail -n 100 ~/Automation/Apps/Backup/EngineCore/Log/progress.log 2>/dev/null || tail -n 100 ~/google_photos_picker.log 2>/dev/null || echo "Nenhum log disponível."
        fi
      `;
      const res = await runSSH(cmd);
      const raw = res.stdout || '';
      const firstNl = raw.indexOf('\n');
      const statusLine = firstNl === -1 ? raw : raw.slice(0, firstNl);
      const running = statusLine.trim() === 'STATUS:running';
      let logContent = firstNl === -1 ? '' : raw.slice(firstNl + 1);

      if (logContent.includes('\r')) {
        logContent = logContent
          .split('\n')
          .map((line) => {
            if (!line.includes('\r')) return line;
            const parts = line.split('\r');
            return parts[parts.length - 1].trim();
          })
          .join('\n');
      }

      return { ok: true, running, log: logContent };
    },
    request,
    'GET /api/backup/status'
  );
}
