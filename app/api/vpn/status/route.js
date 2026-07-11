import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/vpn/status — status do Tailscale no servidor (filtrado para privacidade)
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('tailscale status 2>&1 || echo "Tailscale não disponível"');
      const rawOutput = result.stdout || '';

      const cleanRaw = rawOutput.trim();
      let statusText = 'Status: Inativo\nDispositivos Ativos: 0';

      const isInactive = 
        !cleanRaw ||
        cleanRaw.includes('Tailscale não disponível') ||
        cleanRaw.includes('stopped') ||
        cleanRaw.includes('failed to connect') ||
        cleanRaw.includes('Tailscale is stopped');

      if (!isInactive) {
        const lines = cleanRaw.split('\n');
        let activeSessions = 0;
        let hasFunnel = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Verifica se o Funnel está ativo sem revelar a URL
          if (trimmed.toLowerCase().includes('funnel on') || trimmed.toLowerCase().includes('funnel:')) {
            hasFunnel = true;
          }

          // Filtra linhas de dispositivos pelo IP do Tailscale (100.x)
          if (trimmed.startsWith('100.')) {
            if (!trimmed.toLowerCase().includes('offline')) {
              activeSessions++;
            }
          }
        }

        statusText = `Status: Ativo\nDispositivos Ativos: ${activeSessions}`;
        if (hasFunnel) {
          statusText += '\nFunnel Público: Ativo';
        }
      }

      return { output: statusText };
    },
    request,
    'GET /api/vpn/status'
  );
}

// POST /api/vpn/status — liga/desliga o Tailscale no servidor
export async function POST(request) {
  return apiHandler(
    async () => {
      const { action } = await request.json();
      if (!action || (action !== 'up' && action !== 'down')) {
        throw new Error('Ação inválida. Use "up" ou "down".');
      }
      const cmd = `sudo tailscale ${action}`;
      const result = await runSSH(cmd);
      return {
        ok: true,
        message: `VPN Tailscale executada (${action}) com sucesso.`,
        output: result.stdout || result.stderr || '',
      };
    },
    request,
    'POST /api/vpn/status'
  );
}
