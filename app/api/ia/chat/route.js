import { runSSH, apiHandler } from '@/lib/ssh';

export async function POST(request) {
  return apiHandler(
    async () => {
      const body = await request.json();
      const { model, messages } = body;

      if (!model || !messages) {
        throw new Error('Model and messages are required');
      }

      // Langchain concept: Inject a context-aware system prompt template to improve response quality
      const systemMessage = {
        role: 'system',
        content: 'Você é o assistente oficial do ROHENPER Dashboard, um painel de administração de servidor Linux doméstico rodando Ubuntu, Docker, túnel Bore e Tailscale. Auxilie o administrador a diagnosticar problemas, monitorar recursos (CPU/RAM/Disco), sugerir comandos e gerenciar serviços de forma profissional, direta e segura. Responda em formato markdown legível.'
      };

      const enrichedMessages = messages.some(m => m.role === 'system')
        ? messages
        : [systemMessage, ...messages];

      const jsonPayload = JSON.stringify({
        model,
        messages: enrichedMessages,
        stream: false,
      });

      const b64Payload = Buffer.from(jsonPayload).toString('base64');
      
      // Efficient in-memory execution via curl stdin (no temp files created or disk IO on the remote server)
      const cmd = `echo "${b64Payload}" | base64 -d | curl -s -X POST http://127.0.0.1:11434/api/chat -H "Content-Type: application/json" -d @-`;
      
      const result = await runSSH(cmd);
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
