import { runSSH, apiHandler } from '@/lib/ssh';

// GET /api/ia/models — lista modelos Ollama e modelos Vercel AI Gateway
export async function GET(request) {
  return apiHandler(
    async () => {
      let ollamaOutput = '';
      try {
        const result = await runSSH('(systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true) && ollama list');
        const rawLines = (result.stdout || '').split('\n').filter((l) => l.trim());
        if (rawLines.length > 1) {
          const [header, ...rows] = rawLines;
          rows.sort((a, b) => {
            const score = (line) => (/^ia-core\b/i.test(line) ? 0 : /:3b\b/i.test(line) ? 1 : 2);
            return score(a) - score(b);
          });
          ollamaOutput = [header, ...rows].join('\n');
        } else {
          ollamaOutput = result.stdout || '';
        }
      } catch (e) {
        console.warn('Ollama offline ou inalcançável:', e.message);
      }

      const gatewayModels = [
        { name: 'antigravity', id: 'antigravity-cli', size: 'Gemini 4 Argon' },
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

