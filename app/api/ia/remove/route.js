import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText, isValidModelName } from '@/lib/sanitize';

// POST /api/ia/remove  body: { model: "model_name" } (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model: rawModel } = await request.json();
      const model = String(rawModel || '').trim();
      if (!isValidModelName(model)) {
        throw new Error('Campo "model" é obrigatório e deve ter formato válido.');
      }
      const result = await runSSH(`ollama rm ${model}`);
      if (result.code !== 0) {
        throw new Error(`Falha ao remover modelo ${model}.`);
      }
      return {
        message: `Modelo "${model}" removido com sucesso.`,
        output: sanitizeSensitiveText(result.stdout || result.stderr || 'Modelo removido.'),
      };
    },
    request,
    'POST /api/ia/remove',
    { roles: ['admin'] }
  );
}
