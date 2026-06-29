import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/backup/status — retorna o status do processo de backup e as últimas linhas do log
export async function GET(request) {
  return apiHandler(
    async () => {
      // 1. Verifica se o worker do backup está rodando
      const checkResult = await runSSH('pgrep -f "run_headless.py --worker" >/dev/null && echo "running" || echo "stopped"');
      const running = checkResult.stdout.trim() === 'running';

      // 2. Lê as últimas 100 linhas do log de progresso
      const logResult = await runSSH('tail -n 100 ~/Automation/Apps/Backup/EngineCore/Log/progress.log 2>/dev/null || echo "Nenhum log disponível."');
      const logContent = logResult.stdout;

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
