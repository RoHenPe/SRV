import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/remove  body: { model: "model_name" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model } = await request.json();
      if (!model) throw new Error('Campo "model" é obrigatório.');
      const result = await runSSH(`ollama rm ${model}`);
      return {
        message: `Modelo "${model}" removido com sucesso.`,
        output: result.stdout || result.stderr || 'Modelo removido.'
      };
    },
    request,
    'POST /api/ia/remove'
  );
}
