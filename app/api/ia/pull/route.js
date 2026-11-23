import { runSSH, apiHandler } from '@/lib/ssh';
import { sanitizeSensitiveText, isValidModelName } from '@/lib/sanitize';

export const maxDuration = 60;

// POST /api/ia/pull  body: { model: "llama3" } (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model: rawModel } = await request.json();
      const model = String(rawModel || '').trim();
      if (!isValidModelName(model)) {
        throw new Error('Campo "model" é obrigatório e deve ter formato válido.');
      }
      const result = await runSSH(`ollama pull ${model}`, 60000);
      if (result.code !== 0) {
        throw new Error(`Falha ao baixar modelo ${model}.`);
      }
      return {
        message: `Modelo "${model}" baixado com sucesso.`,
        output: sanitizeSensitiveText(result.stdout || result.stderr),
      };
    },
    request,
    'POST /api/ia/pull',
    { roles: ['admin'] }
  );
}
