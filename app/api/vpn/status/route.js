import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/vpn/status — status do Tailscale no servidor
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH('tailscale status 2>&1 || echo "Tailscale não disponível"');
    return { output: result.stdout };
  });
}
