import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText } from '@/lib/sanitize';

// GET /api/vpn/status — status sanitizado do Tailscale no servidor
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('tailscale status 2>&1 || echo "Tailscale não disponível"');
      const rawOutput = result.stdout || '';
      const cleanRaw = rawOutput.trim();

      let statusText = 'Status: Inativo\nDispositivos Ativos: 0';
      let loggedOut = false;
      let authUrl = null;
      let activeSessions = 0;
      let hasFunnel = false;

      const authMatch = cleanRaw.match(/https:\/\/login\.tailscale\.com\/[^\s]+/);
      if (cleanRaw.toLowerCase().includes('logged out') || authMatch) {
        loggedOut = true;
        authUrl = authMatch ? authMatch[0] : null;
        statusText = 'Status: Aguardando autenticação\nUse o botão acima para autorizar este nó na rede VPN.';
      } else {
        const isInactive =
          !cleanRaw ||
          cleanRaw.includes('Tailscale não disponível') ||
          cleanRaw.includes('stopped') ||
          cleanRaw.includes('failed to connect') ||
          cleanRaw.includes('Tailscale is stopped');

        if (!isInactive) {
          const lines = cleanRaw.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.toLowerCase().includes('funnel on') || trimmed.toLowerCase().includes('funnel:')) {
              hasFunnel = true;
            }
            if (/^100\./.test(trimmed) && !trimmed.toLowerCase().includes('offline')) {
              activeSessions++;
            }
          }
          statusText = `Status: Ativo\nNós online na VPN: ${activeSessions}`;
          if (hasFunnel) {
            statusText += '\nFunnel Público: Ativo';
          }
        }
      }

      return {
        output: sanitizeSensitiveText(statusText),
        loggedOut,
        authUrl,
        activeSessions,
        hasFunnel,
      };
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
      const cmd =
        action === 'up'
          ? 'sudo -n tailscale up --timeout=8s 2>&1 || tailscale status 2>&1'
          : 'sudo -n tailscale down 2>&1';
      const result = await runSSH(cmd, 15000);
      const out = (result.stdout || result.stderr || '').trim();
      const authMatch = out.match(/https:\/\/login\.tailscale\.com\/[^\s]+/);
      return {
        ok: true,
        needsAuth: Boolean(authMatch),
        authUrl: authMatch ? authMatch[0] : null,
        message: authMatch
          ? 'Tailscale aguarda autenticação no navegador. Abra o link exibido.'
          : `VPN Tailscale (${action}) executada com sucesso.`,
        output: sanitizeSensitiveText(authMatch ? 'Aguardando autenticação no link oficial.' : out),
      };
    },
    request,
    'POST /api/vpn/status',
    { roles: ['admin'] }
  );
}
