import { runSSH, apiHandler } from '@/lib/ssh';

export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('echo "ONLINE" && uptime && hostname');
      return {
        online: result.code === 0,
        output: result.stdout,
        host: result.host,
      };
    },
    request,
    'GET /api/status'
  );
}
