import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/models — lista modelos Ollama e modelos Vercel AI Gateway
export async function GET(request) {
  return apiHandler(
    async () => {
      let ollamaOutput = '';
      try {
        const result = await runSSH('ollama list');
        ollamaOutput = result.stdout || '';
      } catch (e) {
        console.warn('Ollama offline ou inalcançável:', e.message);
      }

      const gatewayModels = [
        { name: 'moonshotai/kimi-k3', id: 'gateway-kimi', size: 'Vercel Cloud' },
        { name: 'moonshotai/kimi-k3-fast', id: 'gateway-kimi-fast', size: 'Vercel Cloud' },
        { name: 'openai/gpt-4o-mini', id: 'gateway-gpt4o-mini', size: 'Vercel Cloud' },
      ];

      return {
        output: ollamaOutput,
        gatewayModels,
      };
    },
    request,
    'GET /api/ia/models'
  );
}

