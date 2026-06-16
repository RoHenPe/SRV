import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/pull  body: { model: "llama3" }
export async function POST(req) {
  return apiHandler(async () => {
    const { model } = await req.json();
    if (!model) throw new Error('Campo "model" é obrigatório.');
    const result = await runSSH(`ollama pull ${model}`);
    return {
      message: `Modelo "${model}" baixado com sucesso.`,
      output: result.stdout || result.stderr,
    };
  });
}
