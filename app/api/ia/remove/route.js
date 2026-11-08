import { runSSH, apiHandler } from '@/lib/ssh';

const MODEL_NAME_RE = /^[a-zA-Z0-9_.:/-]{1,128}$/;

// POST /api/ia/remove  body: { model: "model_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model: rawModel } = await request.json();
      const model = String(rawModel || '').trim();
      if (!model || !MODEL_NAME_RE.test(model)) {
        throw new Error('Campo "model" é obrigatório e deve ter formato válido.');
      }
      const result = await runSSH(`ollama rm ${model}`);
      if (result.code !== 0) {
        throw new Error(result.stderr || result.stdout || `Falha ao remover modelo ${model}`);
      }
      return {
        message: `Modelo "${model}" removido com sucesso.`,
        output: result.stdout || result.stderr || 'Modelo removido.',
      };
    },
    request,
    'POST /api/ia/remove'
  );
}
