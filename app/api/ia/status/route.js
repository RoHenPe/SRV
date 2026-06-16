import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/status — status do serviço Ollama
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH('systemctl status ollama --no-pager -l');
    return { output: result.stdout || result.stderr };
  });
}
