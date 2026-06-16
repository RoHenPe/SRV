import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/models — lista modelos Ollama
export async function GET() {
  return apiHandler(async () => {
    const result = await runSSH('ollama list');
    return { output: result.stdout };
  });
}
