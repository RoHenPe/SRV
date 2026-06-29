import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/backup/full — executa backup completo
export async function POST(request) {
  return apiHandler(
    async () => {
      // 1. Verifica se o backup já está rodando
      const checkResult = await runSSH('pgrep -f "run_headless.py --worker" >/dev/null && echo "running" || echo "stopped"');
      const running = checkResult.stdout.trim() === 'running';

      if (running) {
        return {
          ok: true,
          message: 'O backup já está em andamento no servidor remoto.',
        };
      }

      // 2. Inicia o backup em segundo plano no servidor (worker logic)
      // Isso libera a requisição HTTP imediatamente para evitar timeouts no Vercel
      await runSSH('nohup python3 ~/Automation/Apps/Backup/run_headless.py --worker >/dev/null 2>&1 &');

      return {
        ok: true,
        message: 'Backup geral iniciado com sucesso no servidor remoto.',
      };
    },
    request,
    'POST /api/backup/full'
  );
}
