import { runSSH, apiHandler } from '@/lib/ssh';
import { logAction } from '@/lib/logger';

// POST /api/ia/agent
// Suporta motores técnicos: cli-agent (antigravity/agy), multi-agent (crewai), local-llm (ollama/gemma4), shell-interpreter (interpreter)
export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { prompt, mode, engine = 'cli-agent' } = await request.json();
      if (!prompt || !prompt.trim()) {
        throw new Error('O campo de instrução (prompt) é obrigatório.');
      }

      const isAutonomous = mode === 'autonomous' || !mode;
      const b64Prompt = Buffer.from(prompt.trim(), 'utf-8').toString('base64');

      let cmd = '';
      if (engine === 'cli-agent' || engine === 'antigravity') {
        cmd = `
          NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
          export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          if command -v agy >/dev/null 2>&1; then
            agy ${isAutonomous ? '--dangerously-skip-permissions' : '--mode plan'} --print="$PROMPT_TXT" </dev/null 2>&1
          elif command -v interpreter >/dev/null 2>&1; then
            systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true
            interpreter ${isAutonomous ? '-y' : ''} --prompt "$PROMPT_TXT" </dev/null 2>&1
          else
            systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true
            MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
            MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
            python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=120).read().decode('utf-8')).get('response', ''))" 2>&1
          fi
        `;
      } else if (engine === 'multi-agent' || engine === 'crewai') {
        cmd = `
          NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
          export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          if command -v crew-arquiteto >/dev/null 2>&1; then
            crew-arquiteto --modo rapido "$PROMPT_TXT" </dev/null 2>&1
          elif command -v agy >/dev/null 2>&1; then
            agy ${isAutonomous ? '--dangerously-skip-permissions' : '--mode plan'} --print="$PROMPT_TXT" </dev/null 2>&1
          else
            systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true
            MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
            MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
            python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=120).read().decode('utf-8')).get('response', ''))" 2>&1
          fi
        `;
      } else if (engine === 'local-llm' || engine === 'gemma4') {
        cmd = `
          systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true
          MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -iE 'gemma|ia-core|jarvis|qwen' | head -n 1)
          if [ -z "$MODEL_NAME" ]; then
            MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
          fi
          MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
          python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=120).read().decode('utf-8')).get('response', ''))" 2>&1
        `;
      } else {
        cmd = `
          systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true
          python3 -c "import base64, subprocess; p = base64.b64decode('${b64Prompt}').decode('utf-8'); args = ['/home/rodrigo/.local/bin/interpreter', '--prompt', p]; ${isAutonomous ? "args.insert(1, '-y'); " : ''}subprocess.run(args, stdin=subprocess.DEVNULL)" 2>&1
        `;
      }

      const result = await runSSH(cmd, 30000);
      await logAction('automation.agent_exec', result.code === 0 ? 'success' : 'error', {
        engine,
        mode: isAutonomous ? 'autonomous' : 'supervised',
        promptPreview: prompt.trim().slice(0, 120),
        user: ctx.username,
        deviceId: ctx.deviceId,
        deviceName: ctx.deviceName,
      });

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
