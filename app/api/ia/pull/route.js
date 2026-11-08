import { runSSH, apiHandler } from '@/lib/ssh';

const MODEL_NAME_RE = /^[a-zA-Z0-9_.:/-]{1,128}$/;

// POST /api/ia/pull  body: { model: "llama3" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model: rawModel } = await request.json();
      const model = String(rawModel || '').trim();
      if (!model || !MODEL_NAME_RE.test(model)) {
        throw new Error('Campo "model" é obrigatório e deve ter formato válido.');
      }
      const result = await runSSH(`ollama pull ${model}`, 60000);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `Falha ao baixar modelo ${model}`);
      }
      return {
        message: `Modelo "${model}" baixado com sucesso.`,
        output: result.stdout || result.stderr,
      };
    },
    request,
    'POST /api/ia/pull'
  );
}
