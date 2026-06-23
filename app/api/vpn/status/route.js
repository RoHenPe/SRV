import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/vpn/status — status do Tailscale no servidor
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('tailscale status 2>&1 || echo "Tailscale não disponível"');
      return { output: result.stdout };
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
