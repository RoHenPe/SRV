import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/agent  body: { prompt: "...", mode: "autonomous" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { prompt, mode } = await request.json();
      if (!prompt) throw new Error('O campo "prompt" é obrigatório.');
      
      const isAutonomous = mode === 'autonomous' || !mode;
      const b64Prompt = Buffer.from(prompt).toString('base64');
      const cmd = `python3 -c "import base64, subprocess; p = base64.b64decode('${b64Prompt}').decode('utf-8'); args = ['/home/rodrigo/.local/bin/interpreter', '--prompt', p]; ${isAutonomous ? "args.insert(1, '-y'); " : ""}subprocess.run(args)"`;
        
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
