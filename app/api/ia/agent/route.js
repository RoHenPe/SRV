import { runSSH, apiHandler } from '@/lib/ssh';
import { logAction } from '@/lib/logger';
import { sanitizeSensitiveText } from '@/lib/sanitize';

export const maxDuration = 60;

// POST /api/ia/agent (Admin apenas)
export async function POST(request) {
  return apiHandler(
    async (ctx) => {
      const { prompt, mode, engine = 'cli-agent' } = await request.json();
      if (!prompt || !prompt.trim()) {
        throw new Error('O campo de instrução (prompt) é obrigatório.');
      }

      const isAutonomous = mode === 'autonomous' || !mode;
      const b64Prompt = Buffer.from(prompt.trim(), 'utf-8').toString('base64');
      const ollamaFallbackBlock = `
        systemctl is-active --quiet ollama || sudo -n systemctl start ollama 2>/dev/null || true
        MODEL_NAME=$(ollama ps 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
        MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
        python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False, 'keep_alive': '24h', 'options': {'num_ctx': 1024, 'num_predict': 256}}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=35).read().decode('utf-8')).get('response', ''))" 2>&1
      `;

      let cmd = '';
      if (engine === 'cli-agent' || engine === 'antigravity') {
        cmd = `
          NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
          export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          if command -v agy >/dev/null 2>&1; then
            AGY_OUT=$(timeout 35 agy ${isAutonomous ? '--dangerously-skip-permissions ' : ''}--print-timeout 32s --print="$PROMPT_TXT" </dev/null 2>&1)
            AGY_RC=$?
            if [ $AGY_RC -eq 0 ] && [ -n "$AGY_OUT" ]; then
              printf '%s\\n' "$AGY_OUT"
              exit 0
            fi
          fi
          if command -v interpreter >/dev/null 2>&1; then
            systemctl is-active --quiet ollama || sudo -n systemctl start ollama 2>/dev/null || true
            interpreter ${isAutonomous ? '-y' : ''} --prompt "$PROMPT_TXT" </dev/null 2>&1
          else
            ${ollamaFallbackBlock}
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
            AGY_OUT=$(timeout 35 agy ${isAutonomous ? '--dangerously-skip-permissions ' : ''}--print-timeout 32s --print="$PROMPT_TXT" </dev/null 2>&1)
            AGY_RC=$?
            if [ $AGY_RC -eq 0 ] && [ -n "$AGY_OUT" ]; then
              printf '%s\\n' "$AGY_OUT"
              exit 0
            fi
            ${ollamaFallbackBlock}
          else
            ${ollamaFallbackBlock}
          fi
        `;
      } else if (engine === 'local-llm' || engine === 'gemma4') {
        cmd = `
          systemctl is-active --quiet ollama || sudo -n systemctl start ollama 2>/dev/null || true
          MODEL_NAME=$(ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -iE '^ia-core|^qwen2.5-coder:3b' | head -n 1)
          if [ -z "$MODEL_NAME" ]; then
            MODEL_NAME=$(ollama ps 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
          fi
          MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
          python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'prompt': p, 'stream': False, 'keep_alive': '24h', 'options': {'num_ctx': 1024, 'num_predict': 256}}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=35).read().decode('utf-8')).get('response', ''))" 2>&1
        `;
      } else {
        cmd = `
          systemctl is-active --quiet ollama || sudo -n systemctl start ollama 2>/dev/null || true
          MODEL_NAME=$(ollama ps 2>/dev/null | awk 'NR>1 {print $1}' | head -n 1)
          MODEL_NAME=\${MODEL_NAME:-ia-core:latest}
          python3 -c "import json, urllib.request, base64; p = base64.b64decode('${b64Prompt}').decode('utf-8'); sys_p = 'Você é o Open Interpreter do servidor Linux SRV (Ubuntu/Docker). Responda de forma objetiva e forneça os comandos ou diagnóstico exato.'; req = urllib.request.Request('http://127.0.0.1:11434/api/generate', data=json.dumps({'model': '$MODEL_NAME', 'system': sys_p, 'prompt': p, 'stream': False, 'keep_alive': '24h', 'options': {'num_ctx': 1024, 'num_predict': 256}}).encode('utf-8'), headers={'Content-Type': 'application/json'}); print(json.loads(urllib.request.urlopen(req, timeout=35).read().decode('utf-8')).get('response', ''))" 2>&1
        `;
      }

      const result = await runSSH(cmd, 45000);
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
        output: sanitizeSensitiveText(result.stdout || result.stderr || 'Nenhuma saída retornada.'),
      };
    },
    request,
    'POST /api/ia/agent',
    { roles: ['admin'] }
  );
}
