import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/models — lista modelos Ollama
export async function GET(request) {
  return apiHandler(
    async () => {
      const result = await runSSH('ollama list');
      return { output: result.stdout };
    },
    request,
    'GET /api/ia/models'
  );
}
