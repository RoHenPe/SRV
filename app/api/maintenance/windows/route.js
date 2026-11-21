import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText } from '@/lib/sanitize';

// GET /api/maintenance/windows — roundtrip único para ISOs, status VM e relatórios
export async function GET(request) {
  return apiHandler(
    async () => {
      const cmd = `
        [ -f ~/win10-deploy/BK/ISOs/Win10.iso ] && echo "WIN10:true" || echo "WIN10:false"
        [ -f ~/win10-deploy/BK/ISOs/Win11.iso ] && echo "WIN11:true" || echo "WIN11:false"
        echo "VM:$(docker ps --filter name=win10_teste --format '{{.Status}}' 2>/dev/null || true)"
        echo "===REPORTS==="
        cat ~/win10-deploy/BK/Relatorios/*_relatorio.csv ~/win10-deploy/BK/ISOs/Relatorio_Geral.csv 2>/dev/null || true
      `;
      const res = await runSSH(cmd);
      const raw = res.stdout || '';
      const [metaPart = '', reportsRaw = ''] = raw.split('===REPORTS===');

      const hasWin10 = metaPart.includes('WIN10:true');
      const hasWin11 = metaPart.includes('WIN11:true');
      const vmRunning = /VM:.*up/i.test(metaPart);

      const reports = [];
      reportsRaw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line) => {
          if (line.startsWith('HOSTNAME') || !line.includes(',')) return;
          const parts = line.split(',');
          if (parts.length >= 6) {
            reports.push({
              hostname: parts[0],
              oldBuild: parts[1],
              status: parts[2],
              message: parts[3],
              date: parts[4],
              time: parts[5],
            });
          }
        });

      return {
        ok: true,
        isos: { win10: hasWin10, win11: hasWin11 },
        vmRunning,
        reports,
      };
    },
    request,
    'GET /api/maintenance/windows'
  );
}

// POST /api/maintenance/windows — Admin apenas
export async function POST(request) {
  return apiHandler(
    async () => {
      const { action } = await request.json();
      if (!action) throw new Error('Campo "action" é obrigatório.');

      let cmd = '';
      let message = '';

      if (action === 'start_vm') {
        cmd = 'cd ~/win10-deploy && docker compose up -d';
        message = 'Comando para iniciar a VM Windows enviado.';
      } else if (action === 'stop_vm') {
        cmd = 'cd ~/win10-deploy && docker compose down';
        message = 'Comando para parar a VM Windows enviado.';
      } else {
        throw new Error('Ação inválida.');
      }

      const result = await runSSH(cmd);
      return {
        ok: true,
        message,
        output: sanitizeSensitiveText(result.stdout || result.stderr || ''),
      };
    },
    request,
    'POST /api/maintenance/windows',
    { roles: ['admin'] }
  );
}
