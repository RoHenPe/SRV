import { runSSH, apiHandler } from '@/lib/ssh';

// POST /api/ia/agent  body: { prompt: "...", mode: "autonomous", engine: "antigravity" | "crewai" | "gemma4" | "interpreter" }
export async function POST(request) {
  return apiHandler(
    async () => {
      const { prompt, mode, engine = 'antigravity' } = await request.json();
      if (!prompt) throw new Error('O campo "prompt" é obrigatório.');

      const isAutonomous = mode === 'autonomous' || !mode;
      const b64Prompt = Buffer.from(prompt, 'utf-8').toString('base64');

      let cmd = '';
      if (engine === 'antigravity') {
        cmd = `
          export PATH="$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          if command -v agy >/dev/null 2>&1; then
            agy --disable-slash-commands ${isAutonomous ? '--dangerously-skip-permissions' : ''} -p "$PROMPT_TXT" 2>&1
          elif command -v interpreter >/dev/null 2>&1; then
            interpreter ${isAutonomous ? '-y' : ''} --prompt "$PROMPT_TXT" 2>&1
          else
            echo "Binário agy/antigravity não encontrado no host remoto."
          fi
        `;
      } else if (engine === 'crewai') {
        cmd = `
          export PATH="$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          if command -v crew-arquiteto >/dev/null 2>&1; then
            crew-arquiteto --modo rapido "$PROMPT_TXT" 2>&1
          elif command -v agy >/dev/null 2>&1; then
            agy --disable-slash-commands -p "$PROMPT_TXT" 2>&1
          else
            echo "CrewAI não encontrado neste host; executando diagnóstico via shell."
          fi
        `;
      } else if (engine === 'gemma4') {
        cmd = `
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -i gemma | head -n 1)
          MODEL_NAME=\${MODEL_NAME:-gemma4:latest}
          python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=120).read().decode('utf-8')).get('response', ''))" 2>&1
        `;
      } else {
        cmd = `python3 -c "import base64, subprocess; p = base64.b64decode('${b64Prompt}').decode('utf-8'); args = ['/home/rodrigo/.local/bin/interpreter', '--prompt', p]; ${isAutonomous ? "args.insert(1, '-y'); " : ""}subprocess.run(args)"`;
      }

      const result = await runSSH(cmd);
      return {
        ok: true,
        engine,
        output: result.stdout || result.stderr || 'Nenhuma saída retornada.',
      };
    },
    request,
    'POST /api/ia/agent'
  );
}
