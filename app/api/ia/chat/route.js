import { runSSH, apiHandler } from '@/lib/ssh';
import { generateText } from 'ai';
import { sanitizeSensitiveText } from '@/lib/sanitize';

export const maxDuration = 60;

export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { model, messages, provider } = body;

      if (!model || !messages) {
        throw new Error('Modelo e mensagens são obrigatórios.');
      }

      const systemPrompt =
        'Você é o assistente oficial do painel SRV, auxiliando na administração segura do servidor Linux, Docker e automações. Responda em português em formato markdown legível.';

      if (model === 'antigravity' || model.startsWith('antigravity')) {
        const lastMsg = messages[messages.length - 1]?.content || '';
        const b64Prompt = Buffer.from(lastMsg, 'utf-8').toString('base64');
        const agyCmd = `
          NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
          export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          timeout 25 agy --dangerously-skip-permissions --print-timeout 22s --print="$PROMPT_TXT" </dev/null 2>&1
        `;
        const agyRes = await runSSH(agyCmd, 30000);
        return {
          message: {
            role: 'assistant',
            content: sanitizeSensitiveText((agyRes.stdout || agyRes.stderr || 'Sem resposta do Antigravity.').trim()),
          },
        };
      }

      if (provider === 'gateway' || model.includes('/') || model.startsWith('gateway:')) {
        const gatewayModel = model.replace(/^gateway:/, '');
        const coreMessages = messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
          content: m.content,
        }));

        try {
          const result = await generateText({
            model: gatewayModel,
            system: systemPrompt,
            messages: coreMessages,
          });

          return {
            message: {
              role: 'assistant',
              content: result.text,
            },
          };
        } catch (_) {
          const lastMsg = messages[messages.length - 1]?.content || '';
          const b64Prompt = Buffer.from(lastMsg, 'utf-8').toString('base64');
          const agyRes = await runSSH(
            `NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1); export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"; PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d); timeout 25 agy --dangerously-skip-permissions --print-timeout 22s --print="$PROMPT_TXT" </dev/null 2>&1`,
            30000
          );
          if (agyRes.stdout?.trim()) {
            return {
              message: {
                role: 'assistant',
                content: sanitizeSensitiveText(agyRes.stdout.trim()),
              },
            };
          }
          throw new Error('Modelo em nuvem temporariamente indisponível.');
        }
      }

      const systemMessage = {
        role: 'system',
        content: systemPrompt,
      };

      const enrichedMessages = messages.some((m) => m.role === 'system')
        ? messages
        : [systemMessage, ...messages];

      const isLightLocal = /^ia-core\b|:3b\b/i.test(model);
      const jsonPayload = JSON.stringify({
        model,
        messages: enrichedMessages,
        stream: false,
        keep_alive: isLightLocal ? '24h' : '2m',
        options: {
          num_ctx: 1024,
          num_predict: 256,
        },
      });

      const b64Payload = Buffer.from(jsonPayload).toString('base64');
      const cmd = `(systemctl is-active --quiet ollama || sudo -n systemctl start ollama 2>/dev/null || true) && echo "${b64Payload}" | base64 -d | curl -s --max-time 45 -X POST http://127.0.0.1:11434/api/chat -H "Content-Type: application/json" -d @-`;

      const result = await runSSH(cmd, 50000);
      if (result.code !== 0) {
        throw new Error('Serviço Ollama indisponível no momento.');
      }

      let data;
      try {
        data = JSON.parse(result.stdout);
      } catch (e) {
        throw new Error('Resposta inválida do serviço de IA local.');
      }

      return { message: data.message };
    },
    request,
    'POST /api/ia/chat'
  );
}
