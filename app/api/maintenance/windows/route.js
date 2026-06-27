import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/maintenance/windows — Obtém o status da automação de atualização do Windows (ISOs, VM e relatórios das máquinas)
export async function GET(request) {
  return apiHandler(
    async () => {
      // 1. Verifica existência das ISOs (dentro do diretório Docker win10-deploy)
      const isoCheck = await runSSH(
        '[ -f ~/win10-deploy/BK/ISOs/Win10.iso ] && echo "win10:true" || echo "win10:false"; [ -f ~/win10-deploy/BK/ISOs/Win11.iso ] && echo "win11:true" || echo "win11:false"'
      );
      const isoOutput = isoCheck.stdout || '';
      const hasWin10 = isoOutput.includes('win10:true');
      const hasWin11 = isoOutput.includes('win11:true');

      // 2. Verifica se a VM de testes está rodando
      const vmCheck = await runSSH(
        'sudo docker ps --filter name=win10_teste --format "{{.Status}}" 2>/dev/null || true'
      );
      const vmRunning = (vmCheck.stdout || '').toLowerCase().includes('up');

      // 3. Lê todos os relatórios de rede (*_relatorio.csv)
      const reportsCheck = await runSSH(
        'cat ~/win10-deploy/BK/Relatorios/*_relatorio.csv 2>/dev/null || true'
      );
      const reportsRaw = reportsCheck.stdout || '';
      const reports = [];

      // Parseia as linhas do CSV
      const lines = reportsRaw.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach(line => {
        // Ignora cabeçalhos ou linhas inválidas
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
        isos: {
          win10: hasWin10,
          win11: hasWin11,
        },
        vmRunning,
        reports,
      };
    },
    request,
    'GET /api/maintenance/windows'
  );
}

// POST /api/maintenance/windows — Controla a VM de testes ou executa comandos adicionais
// Body: { action: 'start_vm' | 'stop_vm' }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { action } = await request.json();
      if (!action) throw new Error('Campo "action" é obrigatório.');

      let cmd = '';
      let message = '';

      if (action === 'start_vm') {
        cmd = 'cd ~/win10-deploy && sudo docker compose up -d';
        message = 'Comando para iniciar a VM Windows 10 enviado.';
      } else if (action === 'stop_vm') {
        cmd = 'cd ~/win10-deploy && sudo docker compose down';
        message = 'Comando para parar a VM Windows 10 enviado.';
      } else {
        throw new Error('Ação inválida.');
      }

      const result = await runSSH(cmd);

      return {
        ok: true,
        message,
        output: result.stdout || result.stderr || '',
      };
    },
    request,
    'POST /api/maintenance/windows'
  );
}
