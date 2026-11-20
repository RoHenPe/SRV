import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/backup/full — executa ou interrompe backup completo em roundtrip único
export async function POST(request) {
  return apiHandler(
    async () => {
      let body = {};
      try {
        body = await request.json();
      } catch (_) {}

      if (body?.action === 'stop') {
        await runSSH('touch ~/Automation/Apps/Backup/backup.stop');
        return {
          ok: true,
          message: 'Sinal de parada enviado para o processo de backup.',
        };
      }

      const cmd = `
        if ! mountpoint -q /mnt/hd_externo; then
          echo "STATE:UNMOUNTED"
          exit 0
        fi
        if pgrep -f "run_headless.py --worker" >/dev/null 2>&1; then
          echo "STATE:ALREADY_RUNNING"
          exit 0
        fi
        nohup python3 ~/Automation/Apps/Backup/run_headless.py --worker </dev/null >/dev/null 2>&1 &
        echo "STATE:STARTED"
      `;
      const res = await runSSH(cmd);
      const state = (res.stdout || '').trim();

      if (state.includes('STATE:UNMOUNTED')) {
        throw new Error('HD Externo não está montado no servidor. Conecte o disco antes de iniciar o backup.');
      }
      if (state.includes('STATE:ALREADY_RUNNING')) {
        return { ok: true, message: 'O backup já está em andamento no servidor remoto.' };
      }

      return {
        ok: true,
        message: 'Backup geral iniciado com sucesso no servidor remoto.',
      };
    },
    request,
    'POST /api/backup/full'
  );
}
