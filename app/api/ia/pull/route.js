import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/pull  body: { model: "llama3" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { model } = await request.json();
      if (!model) throw new Error('Campo "model" é obrigatório.');
      const result = await runSSH(`ollama pull ${model}`);
      return {
        message: `Modelo "${model}" baixado com sucesso.`,
        output: result.stdout || result.stderr,
      };
    },
    request,
    'POST /api/ia/pull'
  );
}
