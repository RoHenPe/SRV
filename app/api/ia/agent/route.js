import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/agent  body: { prompt: "...", mode: "autonomous" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { prompt, mode } = await request.json();
      if (!prompt) throw new Error('O campo "prompt" é obrigatório.');
      
      const isAutonomous = mode === 'autonomous' || !mode;
      const cmd = isAutonomous 
        ? `/home/rodrigo/.local/bin/interpreter -y --prompt "${prompt.replace(/"/g, '\\"')}"`
        : `/home/rodrigo/.local/bin/interpreter --prompt "${prompt.replace(/"/g, '\\"')}"`;
        
      const result = await runSSH(cmd);
      return {
        ok: true,
        output: result.stdout || result.stderr || 'Nenhuma saída retornada.',
      };
    },
    request,
    'POST /api/ia/agent'
  );
}
