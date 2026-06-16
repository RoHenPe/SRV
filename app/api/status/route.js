import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/status — verifica se o servidor está online
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH('echo "ONLINE" && uptime && hostname');
    return {
      online: result.code === 0,
      output: result.stdout,
      host: result.host,
    };
  });
}
