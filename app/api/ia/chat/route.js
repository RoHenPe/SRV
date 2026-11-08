import { runSSH, apiHandler } from '@/lib/ssh';
import { generateText } from 'ai';

export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { model, messages, provider } = body;

      if (!model || !messages) {
        throw new Error('Model and messages are required');
      }

      const systemPrompt = 'Você é o assistente oficial do ROHENPER Dashboard, um painel de administração de servidor Linux doméstico rodando Ubuntu, Docker, túnel Bore e Tailscale. Auxilie o administrador a diagnosticar problemas, monitorar recursos (CPU/RAM/Disco), sugerir comandos e gerenciar serviços de forma profissional, direta e segura. Responda em formato markdown legível.';

      // Se o modelo selecionado for o Antigravity CLI no servidor
      if (model === 'antigravity' || model.startsWith('antigravity')) {
        const lastMsg = messages[messages.length - 1]?.content || '';
        const b64Prompt = Buffer.from(lastMsg, 'utf-8').toString('base64');
        const agyCmd = `
          NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -n 1)
          export PATH="$NVM_BIN:$HOME/.local/bin:$PATH"
          PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d)
          agy --dangerously-skip-permissions --print="$PROMPT_TXT" </dev/null 2>&1
        `;
        const agyRes = await runSSH(agyCmd, 30000);
        return {
          message: {
            role: 'assistant',
            content: (agyRes.stdout || agyRes.stderr || 'Sem resposta do Antigravity.').trim(),
          },
        };
      }

      // Se o modelo for da nuvem (Vercel AI Gateway)
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
        } catch (gatewayErr) {
          // Fallback automático para Antigravity no servidor caso o gateway falhe
          const lastMsg = messages[messages.length - 1]?.content || '';
          const b64Prompt = Buffer.from(lastMsg, 'utf-8').toString('base64');
          const agyRes = await runSSH(
            `export PATH="$HOME/.local/bin:$PATH"; PROMPT_TXT=$(echo "${b64Prompt}" | base64 -d); agy --dangerously-skip-permissions --print="$PROMPT_TXT" </dev/null 2>&1`,
            30000
          );
          if (agyRes.stdout?.trim()) {
            return {
              message: {
                role: 'assistant',
                content: agyRes.stdout.trim(),
              },
            };
          }
          throw new Error(`Vercel AI Gateway (${gatewayModel}): ${gatewayErr.message || gatewayErr}`);
        }
      }

      // Langchain concept: Inject a context-aware system prompt template to improve response quality
      const systemMessage = {
        role: 'system',
        content: systemPrompt,
      };

      const enrichedMessages = messages.some((m) => m.role === 'system')
        ? messages
        : [systemMessage, ...messages];

      const jsonPayload = JSON.stringify({
        model,
        messages: enrichedMessages,
        stream: false,
      });

      const b64Payload = Buffer.from(jsonPayload).toString('base64');
      
      // Garante que o Ollama esteja ativo e executa via curl stdin
      const cmd = `(systemctl is-active --quiet ollama || sudo systemctl start ollama 2>/dev/null || true) && echo "${b64Payload}" | base64 -d | curl -s -X POST http://127.0.0.1:11434/api/chat -H "Content-Type: application/json" -d @-`;
      
      const result = await runSSH(cmd, 45000);
      if (result.code !== 0) {
        throw new Error(`Erro ao conectar ao Ollama no servidor: ${result.stderr || result.stdout}`);
      }

      let data;
      try {
        data = JSON.parse(result.stdout);
      } catch (e) {
        throw new Error(`Resposta inválida do Ollama: ${result.stdout}`);
      }

      return { message: data.message };
    },
    request,
    'POST /api/ia/chat'
  );
}

